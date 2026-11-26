import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const text = (v, name) => {
  if (typeof v !== 'string' || !v.trim() || /[\x00-\x08\x0b-\x1f\x7f]/.test(v)) throw new Error(`Invalid ${name}`);
};
const absolute = (v, name) => { text(v, name); if (!isAbsolute(v)) throw new Error(`${name} must be absolute`); };
const shell = /^-?(sh|bash|zsh|fish|dash|ksh|tcsh|csh|nu|pwsh)$/;
// Receiver absence pauses a schedule; a failed check (abort, timeout, manager down) does not.
const gone = message => Object.assign(new Error(message), { receiverGone: true });
const json = output => { try { return JSON.parse(output); } catch { return null; } };

// Terminal managers differ in addressing and transport; the scheduler contract is the same for every
// coding agent running inside them: verify the exact receiver, submit literal text, press Enter.
export const terminals = {
  cmux: {
    fields: ['workspace', 'surface'],
    validate(t) { if (![t.surface, t.workspace].every(v => typeof v === 'string' && uuid.test(v))) throw new Error('cmux requires surface and workspace UUIDs'); },
    key: t => [t.workspace, t.surface],
    async verify(call, t) {
      const listed = await call(['cmux', '--id-format', 'uuids', 'tree', '--workspace', t.workspace]);
      if (!listed.output.toLowerCase().includes(t.surface.toLowerCase())) throw gone('cmux surface is absent from the declared workspace');
      // Agent hooks record every Claude/Codex session per surface; no live record means the session ended.
      const sessions = json((await call(['cmux', 'sessions', 'list', '--surface', t.surface, '--json', '--all'])).output)?.sessions ?? [];
      const live = sessions.filter(r => r.surface_id?.toLowerCase() === t.surface.toLowerCase() && r.stored_pid_exists === true);
      if (!live.length) throw gone('No live agent session on the cmux surface');
      if (t.session && !live.some(r => r.session_id?.toLowerCase() === t.session.toLowerCase())) throw gone('The registered agent session no longer runs on the cmux surface');
    },
    async submit(call, t, prompt) {
      // The send CLI expands backslash-n/r/t. RPC sends literal text.
      await call(['cmux', 'rpc', 'surface.send_text', JSON.stringify({ workspace_id: t.workspace, surface_id: t.surface, text: prompt })]);
      await new Promise(resolve => setTimeout(resolve, 250));
      await call(['cmux', 'send-key', '--workspace', t.workspace, '--surface', t.surface, 'Enter']);
    },
    fromEnv: async env => env.CMUX_WORKSPACE_ID && env.CMUX_SURFACE_ID ? { workspace: env.CMUX_WORKSPACE_ID, surface: env.CMUX_SURFACE_ID } : null,
    async read(call, t) { return (await call(['cmux', 'read-screen', '--workspace', t.workspace, '--surface', t.surface, '--lines', '40'])).output; },
    async list(call) {
      const tree = json((await call(['cmux', '--id-format', 'uuids', 'tree', '--all', '--json'])).output);
      const sessions = json((await call(['cmux', 'sessions', 'list', '--json', '--all']).catch(() => ({ output: '' }))).output)?.sessions ?? [];
      const rows = [];
      for (const w of tree?.windows ?? []) for (const ws of w.workspaces ?? []) for (const pane of ws.panes ?? []) for (const s of pane.surfaces ?? []) {
        if (s.type !== 'terminal') continue;
        const session = sessions.filter(r => r.surface_id?.toLowerCase() === s.id.toLowerCase() && r.stored_pid_exists === true).sort((a, b) => (b.updated_at_unix ?? 0) - (a.updated_at_unix ?? 0))[0];
        rows.push({ target: { type: 'cmux', workspace: ws.id, surface: s.id, ...(session ? { session: session.session_id } : {}) }, label: s.title ?? s.id, group: ws.title ?? ws.id, live: !!session, agent: session?.agent ?? null, session: session?.session_id ?? null, cwd: session?.cwd ?? null });
      }
      return rows;
    },
  },
  orca: {
    fields: ['terminal'],
    validate(t) { text(t.terminal, 'orca terminal handle'); if (t.terminal.length > 256) throw new Error('orca terminal handle is too long'); },
    key: t => [t.terminal],
    async verify(call, t) {
      // Handles are runtime-scoped; a stale handle fails here, before any input.
      const result = await call(['orca', 'terminal', 'show', '--terminal', t.terminal, '--json']).catch(error => error);
      const shown = json(result.output ?? '');
      if (shown?.ok === false && /stale|not_found|unknown_terminal/.test(shown.error?.code ?? '')) throw gone(`orca terminal is gone (${shown.error.code})`);
      if (result instanceof Error) throw result;
      const terminal = shown?.result?.terminal ?? shown?.result ?? shown;
      if (!terminal?.agentIdentity) throw gone('No running agent in the orca terminal');
    },
    async submit(call, t, prompt) {
      const sent = json((await call(['orca', 'terminal', 'send', '--terminal', t.terminal, '--text', prompt, '--enter', '--json'])).output);
      if (sent?.ok === false) throw new Error(`orca send failed (${sent.error?.code ?? 'unknown'})`);
    },
    async fromEnv(env, call) {
      // Orca exports the pane key; the runtime maps it to the current terminal handle.
      if (!env.ORCA_PANE_KEY) return null;
      const listed = json((await call(['orca', 'terminal', 'list', '--json'])).output);
      const row = (listed?.result?.terminals ?? listed?.terminals ?? []).find(r => `${r.tabId}:${r.leafId}` === env.ORCA_PANE_KEY);
      return row?.handle ? { terminal: row.handle } : null;
    },
    async read(call, t) {
      const read = json((await call(['orca', 'terminal', 'read', '--terminal', t.terminal, '--screen', '--json'])).output);
      if (read?.ok === false) throw new Error(read.error?.message ?? 'orca terminal read failed');
      const result = read?.result ?? read;
      return typeof result === 'string' ? result : result?.screen ?? result?.text ?? JSON.stringify(result, null, 2);
    },
    async list(call) {
      const listed = json((await call(['orca', 'terminal', 'list', '--json'])).output);
      if (listed?.ok === false) throw new Error(listed.error?.message ?? 'orca terminal list failed');
      const rows = listed?.result?.terminals ?? listed?.terminals ?? [];
      return rows.filter(r => typeof r.handle === 'string').map(r => ({ target: { type: 'orca', terminal: r.handle }, label: r.paneTitle || r.title || r.handle, group: r.worktreePath ?? r.worktree ?? null, live: !!r.agentIdentity, agent: r.agentIdentity ?? null, session: null, cwd: r.cwd ?? r.worktreePath ?? null }));
    },
  },
  tmux: {
    fields: ['socket', 'pane'],
    validate(t) { if (!/^%\d+$/.test(t.pane)) throw new Error('tmux requires an exact %pane id'); absolute(t.socket, 'tmux socket'); },
    key: t => [t.socket, t.pane],
    async verify(call, t) {
      const listed = await call(['tmux', '-S', t.socket, 'display-message', '-p', '-t', t.pane, '#{pane_id}\t#{pane_current_command}']).catch(error => error);
      if (listed instanceof Error) throw /can't find pane|no server running|error connecting/i.test(listed.message) ? gone(listed.message) : listed;
      const [pane, command] = listed.output.trim().split('\t');
      if (pane !== t.pane) throw gone('tmux pane identity mismatch');
      // A shell in the foreground means the agent exited; typed text would run as a command.
      if (shell.test(command ?? '')) throw gone('No running agent in the tmux pane');
    },
    async submit(call, t, prompt) {
      await call(['tmux', '-S', t.socket, 'send-keys', '-t', t.pane, '-l', '--', prompt]);
      await new Promise(resolve => setTimeout(resolve, 250));
      await call(['tmux', '-S', t.socket, 'send-keys', '-t', t.pane, 'Enter']);
    },
    fromEnv: async env => env.TMUX && env.TMUX_PANE ? { socket: env.TMUX.split(',')[0], pane: env.TMUX_PANE } : null,
    async read(call, t) { return (await call(['tmux', '-S', t.socket, 'capture-pane', '-p', '-t', t.pane, '-S', '-40'])).output; },
    async list(call) {
      const { output } = await call(['tmux', 'list-panes', '-a', '-F', '#{socket_path}\t#{pane_id}\t#{session_name}:#{window_index}.#{pane_index}\t#{pane_current_command}\t#{pane_current_path}']);
      return output.split('\n').filter(Boolean).map(line => {
        const [socket, pane, name, command, cwd] = line.split('\t');
        return { target: { type: 'tmux', socket, pane }, label: `${name} ${command}`, group: socket, live: !shell.test(command), agent: null, session: null, cwd };
      });
    },
  },
};

export function validateTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) throw new Error('target must be an object');
  if (target.type === 'codex-queue') throw new Error('codex-queue was removed; target the agent through its terminal (cmux, orca, or tmux)');
  const manager = terminals[target.type];
  const allowed = target.type === 'command' ? ['type', 'argv', 'cwd'] : manager && ['type', ...manager.fields, 'session', 'mode', 'prompt'];
  if (!allowed || Object.keys(target).some(k => !allowed.includes(k))) throw new Error('Unknown target type or field');
  if (target.type === 'command') {
    if (!Array.isArray(target.argv) || !target.argv.length) throw new Error('command.argv must be nonempty');
    target.argv.forEach(v => text(v, 'argument'));
    absolute(target.cwd, 'cwd');
    return target;
  }
  text(target.prompt, 'prompt');
  if (target.prompt.includes('\t')) throw new Error('Tab control input is not allowed in prompts');
  if (target.prompt.length > 16000) throw new Error('prompt exceeds 16000 characters');
  if (target.mode !== undefined && !['prompt', 'goal'].includes(target.mode)) throw new Error('mode must be prompt or goal');
  if (target.session !== undefined && (typeof target.session !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(target.session))) throw new Error('Invalid agent session id');
  manager.validate(target);
  return target;
}

export function targetKey(t) {
  // Prompt changes do not create a second destination.
  const key = t.type === 'command' ? [t.type, t.argv, t.cwd] : [t.type, ...terminals[t.type].key(t)];
  return createHash('sha256').update(JSON.stringify(key)).digest('hex');
}

export function processCommand(argv, { cwd, env = process.env, timeoutMs = 30000, signal, maxOutput = 65536 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = '', timedOut = false, aborted = false;
    const stop = () => {
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
      force = setTimeout(() => { try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch { /* Already exited. */ } }, 1000);
    };
    let force;
    const abort = () => { aborted = true; stop(); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-maxOutput); });
    const cleanup = () => { clearTimeout(timer); clearTimeout(force); signal?.removeEventListener('abort', abort); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', (code, sig) => {
      // The leader can exit before descendants that ignore TERM.
      if ((timedOut || aborted) && child.pid) {
        try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch { /* Group already exited. */ }
      }
      cleanup(); resolve({ code, signal: sig, output, timedOut, aborted });
    });
  });
}

const caller = (options = {}) => {
  const execute = options.execute ?? processCommand;
  return async (argv, extra = {}) => {
    if (options.signal?.aborted) throw new Error('Dispatch aborted');
    const result = await execute(argv, { ...options, ...extra });
    if (result.code !== 0 || result.timedOut || result.aborted) {
      const detail = json(result.output ?? '')?.error?.message ?? result.output?.trim().split('\n').at(-1);
      throw Object.assign(new Error(`Transport failed (${result.timedOut ? 'timeout' : result.aborted ? 'aborted' : result.code})${detail ? `: ${detail.slice(0, 300)}` : ''}`), { output: result.output });
    }
    return result;
  };
};

export async function dispatch(target, options = {}) {
  validateTarget(target);
  const call = caller(options);
  if (target.type === 'command') {
    await call(target.argv, { cwd: target.cwd });
    return { status: 'succeeded', acknowledgment: 'command-exited-zero' };
  }
  const manager = terminals[target.type];
  try { await manager.verify(call, target); }
  catch (error) { return { status: 'not-delivered', acknowledgment: 'receiver-check-failed-before-input', receiverGone: !!error.receiverGone, error: error.message }; }
  // Flatten newlines and reject terminal control characters before the effect.
  const prompt = target.prompt.replace(/[\r\n]+/g, ' ');
  // Claude Code and Codex both accept `/goal <objective>`: the session keeps working until the objective holds.
  await manager.submit(call, target, target.mode === 'goal' ? `/goal ${prompt}` : prompt);
  return { status: 'transport-accepted', acknowledgment: 'delivery-only-not-model-turn' };
}

export async function listTerminals(options = {}) {
  const call = caller({ timeoutMs: 10000, maxOutput: 16 << 20, ...options });
  return Promise.all(Object.entries(terminals).map(async ([type, manager]) => {
    try { return { type, available: true, terminals: await manager.list(call) }; }
    catch (error) { return { type, available: false, error: error.code === 'ENOENT' ? `${type} is not installed` : error.message, terminals: [] }; }
  }));
}

export async function readTerminal(target, options = {}) {
  validateTarget({ ...target, prompt: 'read' });
  return terminals[target.type].read(caller({ timeoutMs: 10000, maxOutput: 1 << 20, ...options }), target);
}

// Receivers of the terminal this process runs in, for every manager that exports its identity.
export async function currentReceivers(env = process.env, options = {}) {
  const call = caller({ timeoutMs: 5000, maxOutput: 16 << 20, ...options });
  const found = [];
  for (const [type, manager] of Object.entries(terminals)) {
    const ids = await manager.fromEnv(env, call).catch(() => null);
    if (ids) found.push({ type, ...ids });
  }
  return found;
}

export const sameReceiver = (a, b) => a.type === b.type && a.type !== 'command' && terminals[a.type].fields.every(f => String(a[f]).toLowerCase() === String(b[f]).toLowerCase());
