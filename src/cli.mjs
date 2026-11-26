#!/usr/bin/env node
import { readFile, open } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store, validate } from './core.mjs';
import { agentForSession, currentReceivers, listTerminals } from './targets.mjs';
import { createUi, history, status } from './ui.mjs';

const args = process.argv.slice(2);
// One store and one daemon serve every coding agent and provider home on this computer.
// AGENT_SCHEDULER_HOME exists only to isolate tests.
const root = process.env.AGENT_SCHEDULER_HOME ?? join(homedir(), '.local', 'state', 'agent-scheduler');
const store = new Store(root);
const [command, ...rest] = args;
const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const port = Number(process.env.AGENT_SCHEDULER_PORT ?? 47800);

// The management page token persists so the one daemon keeps one stable URL.
async function uiToken() {
  const path = join(store.root, 'ui-token');
  const existing = (await readFile(path, 'utf8').catch(() => '')).trim();
  if (existing) return existing;
  const token = randomBytes(24).toString('base64url');
  const file = await open(path, 'wx', 0o600).catch(() => null);
  if (!file) return (await readFile(path, 'utf8')).trim();
  try { await file.writeFile(token); } finally { await file.close(); }
  return token;
}
const uiUrl = async () => `http://127.0.0.1:${port}/#token=${await uiToken()}`;

// The daemon runs detached in its own process session, independent of the session that started it.
async function startDaemon() {
  if (await store.read(join(store.root, 'daemon.lock', 'owner.json'))) {
    if (await store.daemon()) throw new Error('Daemon is already running');
    await store.unlock('daemon'); // refuses a live or unknown owner
  }
  const log = await open(join(store.root, 'daemon.log'), 'a', 0o600);
  try {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], { detached: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, AGENT_SCHEDULER_HOME: store.root } });
    child.unref();
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 100));
      const owner = await store.read(join(store.root, 'daemon.lock', 'owner.json'));
      if (owner?.pid === child.pid) return { status: 'started', ...owner };
    }
    throw new Error('Daemon did not acquire its lock; inspect daemon.log');
  } finally { await log.close(); }
}
// Registration without a running daemon would never fire, so the registering session starts it.
async function ensureDaemon() {
  const owner = await store.daemon();
  return owner ? { status: 'running', ...owner } : startDaemon();
}
try {
  await store.init();
  if (!command || command === 'help' || command === '--help') {
    console.log(`agent-scheduler 0.3.0 — Node >=22\n\nUsage: agent-scheduler COMMAND\n\nOne global store and daemon serve all coding agents on this computer.\nRegistering or resuming starts the daemon when it is absent.\n\nput FILE|-       Validate and register a JSON schedule\nlist             List definitions and runtime state\npause ID         Disable future dispatch\nresume ID        Enable future dispatch\nremove ID        Remove definition, retain receipts\nresolve ID RUN   Acknowledge uncertain run after owner exit; never replay\ntick             Dispatch due schedules once\nserve            Run scheduler in foreground\nstart            Start the global daemon (scheduler and management page) if absent\nstop             Request graceful daemon stop\nstatus           Inspect daemon owner and store\nhistory          Read run receipts\nunlock NAME      Remove store/daemon lock only after confirmed owner exit\nterminals        List cmux, orca and tmux receivers\nsession-end      Remove schedules addressed to this terminal (session end hook)\nui               Start the daemon if needed and print the management page URL\n\nNo API key or model process is required.`);
  } else if (command === 'put') {
    if (rest.length !== 1) throw new Error('put requires FILE or -');
    let input;
    if (rest[0] === '-') { input = ''; for await (const chunk of process.stdin) input += chunk; }
    else input = await readFile(rest[0], 'utf8');
    const spec = validate(JSON.parse(input));
    const daemon = await ensureDaemon();
    print({ ...(await store.put(spec)), daemon, ui: await uiUrl() });
  } else if (command === 'list') print(await store.list());
  else if (command === 'pause' || command === 'resume') {
    const daemon = command === 'resume' ? await ensureDaemon() : undefined;
    print({ ...(await store.enable(rest[0], command === 'resume')), ...(daemon ? { daemon } : {}) });
  }
  else if (command === 'remove') print(await store.remove(rest[0]));
  else if (command === 'resolve') print(await store.resolveRun(rest[0], rest[1]));
  else if (command === 'unlock') print(await store.unlock(rest[0]));
  else if (command === 'tick') print(await store.tick());
  else if (command === 'history') print(await history(store));
  else if (command === 'status') print({ ...(await status(store)), ui: await uiUrl() });
  else if (command === 'terminals') print(await listTerminals());
  else if (command === 'session-end') {
    // Hook input carries the ending agent session and its reason; /clear and /resume keep the agent running.
    let input = '';
    if (!process.stdin.isTTY) for await (const chunk of process.stdin) input += chunk;
    let hook = {};
    try { hook = input.trim() ? JSON.parse(input) : {}; } catch { hook = {}; }
    if (['clear', 'resume'].includes(hook.reason)) print({ skipped: hook.reason });
    else {
      const receivers = await currentReceivers();
      const agent = receivers.length ? await agentForSession(hook.session_id) : null;
      print({ receivers, agent, schedules: receivers.length ? await store.removeForReceivers(receivers, agent) : [] });
    }
  } else if (command === 'ui') print({ url: await uiUrl(), daemon: await ensureDaemon(), store: store.root });
  else if (command === 'serve') {
    await store.lock('daemon', async () => {
      // The daemon serves the management page, so one process owns both scheduling and the page.
      const { server } = createUi(store, { token: await uiToken() });
      await new Promise(resolve => {
        server.once('error', error => { process.stderr.write(JSON.stringify({ error: `management page unavailable: ${error.message}`, at: new Date().toISOString() }) + '\n'); resolve(); });
        server.listen(port, '127.0.0.1', () => { print({ ui: `http://127.0.0.1:${port}/`, at: new Date().toISOString() }); resolve(); });
      });
      const controller = new AbortController();
      const active = new Set();
      let stopping = false;
      const stop = () => { stopping = true; controller.abort(); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      try {
        while (!stopping) {
          if (await store.read(join(store.root, 'daemon.lock', 'stop.json'))) { stop(); break; }
          const run = store.tick({ signal: controller.signal })
            .then(runs => { if (runs.length) print(runs); })
            .catch(error => { process.stderr.write(JSON.stringify({ error: error.message, at: new Date().toISOString() }) + '\n'); })
            .finally(() => active.delete(run));
          active.add(run);
          if (!stopping) await new Promise(r => setTimeout(r, 1000));
        }
      } finally {
        controller.abort();
        server.close();
        await Promise.all(active);
        process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      }
    });
  } else if (command === 'start') print({ ...(await ensureDaemon()), store: store.root, ui: await uiUrl() }); else if (command === 'stop') {
    // Stop through a file, avoiding signals to a reused PID.
    const path = join(store.root, 'daemon.lock');
    const owner = await store.read(join(path, 'owner.json'));
    if (!owner) throw new Error('No daemon owner');
    await store.atomic(join(path, 'stop.json'), { owner });
    print({ status: 'stop-requested', owner });
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  process.stderr.write(JSON.stringify({ error: error.message }) + '\n');
  process.exitCode = 1;
}
