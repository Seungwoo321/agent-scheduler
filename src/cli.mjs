#!/usr/bin/env node
import { readFile, readdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from './core.mjs';

const args = process.argv.slice(2);
const index = args.indexOf('--store');
if (index !== -1 && !args[index + 1]) throw new Error('--store requires a path');
const root = index === -1 ? (process.env.AGENT_SCHEDULER_HOME ?? join(homedir(), '.local', 'state', 'agent-scheduler')) : args.splice(index, 2)[1];
const store = new Store(root);
const [command, ...rest] = args;
const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
try {
  await store.init();
  if (!command || command === 'help' || command === '--help') {
    console.log(`agent-scheduler 0.1.0 — Node >=22\n\nUsage: agent-scheduler [--store PATH] COMMAND\n\nput FILE|-       Validate and register a JSON schedule\nlist             List definitions and runtime state\npause ID         Disable future dispatch\nresume ID        Enable future dispatch\nremove ID        Remove definition, retain receipts\nresolve ID RUN   Acknowledge uncertain run after owner exit; never replay\ntick             Dispatch due schedules once\nserve            Run scheduler in foreground\nstart            Start a detached scheduler\nstop             Request graceful daemon stop\nstatus           Inspect daemon owner and store\nhistory          Read run receipts\nunlock NAME      Remove store/daemon lock only after confirmed owner exit\n\nNo API key, HTTP server or model process is required.`);
  } else if (command === 'put') {
    if (rest.length !== 1) throw new Error('put requires FILE or -');
    let input;
    if (rest[0] === '-') { input = ''; for await (const chunk of process.stdin) input += chunk; }
    else input = await readFile(rest[0], 'utf8');
    print(await store.put(JSON.parse(input)));
  } else if (command === 'list') print(await store.list());
  else if (command === 'pause' || command === 'resume') print(await store.enable(rest[0], command === 'resume'));
  else if (command === 'remove') print(await store.remove(rest[0]));
  else if (command === 'resolve') print(await store.resolveRun(rest[0], rest[1]));
  else if (command === 'unlock') print(await store.unlock(rest[0]));
  else if (command === 'tick') print(await store.tick());
  else if (command === 'history') {
    const files = (await readdir(join(store.root, 'runs'))).filter(n => n.endsWith('.json')).sort();
    print(await Promise.all(files.map(n => store.read(join(store.root, 'runs', n)))));
  } else if (command === 'status') print({ store: store.root, daemon: await store.read(join(store.root, 'daemon.lock', 'owner.json')), storeLock: await store.read(join(store.root, 'store.lock', 'owner.json')) });
  else if (command === 'serve') {
    await store.lock('daemon', async () => {
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
        await Promise.all(active);
        process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      }
    });
  } else if (command === 'start') {
    if (await store.read(join(store.root, 'daemon.lock', 'owner.json'))) throw new Error('Daemon lock exists; inspect status before starting');
    const log = await open(join(store.root, 'daemon.log'), 'a', 0o600);
    try {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--store', store.root, 'serve'], { detached: true, stdio: ['ignore', log.fd, log.fd] });
      child.unref();
      await new Promise(r => setTimeout(r, 500));
      const owner = await store.read(join(store.root, 'daemon.lock', 'owner.json'));
      if (owner?.pid !== child.pid) throw new Error('Daemon did not acquire its lock; inspect daemon.log');
      print({ status: 'started', ...owner, store: store.root });
    } finally { await log.close(); }
  } else if (command === 'stop') {
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
