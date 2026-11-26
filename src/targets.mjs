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
// An agent process is identified by PID plus start time, so a reused PID never matches.
async function processStarts(call, pids) {
  if (!pids.length) return new Map();
  const { output } = await call(['ps', '-o', 'pid=,lstart=', '-p', pids.join(',')], { env: { ...process.env, LC_ALL: 'C' } }).catch(error => ({ output: error.output ?? '' }));
  return new Map(output.split('\n').map(line => line.trim().match(/^(\d+)\s+(.+)$/)).filter(Boolean).map(([, pid, start]) => [Number(pid), start.trim()]));
}
const liveRecords = (sessions, surface) => sessions.filter(r => r.surface_id?.toLowerCase() === surface.toLowerCase() && r.stored_pid_exists === true);
const json = output => { try { return JSON.parse(output); } catch { return null; } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// The input line is empty when only the agent's prompt glyph sits left of the cursor and nothing but
// faint ghost suggestion text sits right of it (a cursor moved to the start of a draft leaves the
// draft right of the cursor in normal style). Requiring the glyph also refuses a cursor in a menu.
const emptyInput = left => /^\s*[❯›>]\s*$/.test(left);
const ready = ({ left, right, busy }) => busy ? { ok: false, reason: 'agent is working' }
  : !emptyInput(left) || right.trim() ? { ok: false, reason: 'input line holds unsubmitted text' } : { ok: true };
// Claude Code and Codex both show this while a turn runs; agent-hook lifecycle records can go stale.
const working = text => /esc to interrupt/i.test(text);
const wide = cp => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || cp >= 0x20000;
// Enter is confirmed when the input line returns to empty within a bounded window.
async function confirmCleared(read) {
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    const state = await read().catch(() => null);
    if (state && emptyInput(state.left) && !state.right.trim()) return true;
  }
  return false;
}
// Minimal SGR tracking for `capture-pane -e`: split a line at a cell column and keep only non-faint text right of it.
function splitStyled(line, cells) {
  let left = '', right = '', used = 0, faint = false;
  for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
    const sgr = part.match(/^\x1b\[([0-9;]*)m$/);
    if (sgr) { for (const code of (sgr[1] || '0').split(';').map(Number)) { if (code === 2) faint = true; else if (code === 0 || code === 22) faint = false; } continue; }
    for (const ch of part) {
      if (used < cells) left += ch; else if (!faint) right += ch;
      used += wide(ch.codePointAt(0)) ? 2 : 1;
    }
  }
  return { left, right };
}

// Terminal managers differ in addressing and transport; the scheduler contract is the same for every
// coding agent running inside them: verify the exact receiver, submit literal text, press Enter.
export const terminals = {
  cmux: {
    fields: ['workspace', 'surface'],
    optional: ['agent'],
    validate(t) { if (![t.surface, t.workspace].every(v => typeof v === 'string' && uuid.test(v))) throw new Error('cmux requires surface and workspace UUIDs'); },
    key: t => [t.workspace, t.surface],
    async verify(call, t) {
      const listed = await call(['cmux', '--id-format', 'uuids', 'tree', '--workspace', t.workspace]).catch(error => error);
      if (listed instanceof Error) throw /not_found/.test(listed.message) ? gone(listed.message) : listed;
      if (!listed.output.toLowerCase().includes(t.surface.toLowerCase())) throw gone('cmux surface is absent from the declared workspace');
      // Agent hooks record every Claude/Codex session per surface; no live record means the session ended.
      const sessions = json((await call(['cmux', 'sessions', 'list', '--surface', t.surface, '--json', '--all'])).output)?.sessions ?? [];
      const live = liveRecords(sessions, t.surface);
      if (!live.length) throw gone('No live agent session on the cmux surface');
      // /clear and /resume change the session id but keep the agent process; bind to the process.
      if (t.agent) {
        const starts = await processStarts(call, [t.agent.pid]);
        if (!live.some(r => r.pid === t.agent.pid) || starts.get(t.agent.pid) !== t.agent.startedAt) throw gone('The registered agent process no longer runs on the cmux surface');
      }
    },
    async input(call, t) {
      const grid = json((await call(['cmux', 'rpc', 'terminal.replay', JSON.stringify({ workspace_id: t.workspace, surface_id: t.surface })], { maxOutput: 16 << 20 })).output)?.render_grid;
      if (!grid?.cursor) throw new Error('cmux render grid unavailable');
      const faint = new Set((grid.styles ?? []).filter(style => style.faint).map(style => style.id));
      const row = (grid.row_spans ?? []).filter(span => span.row === grid.cursor.row).sort((a, b) => a.column - b.column);
      return {
        left: row.filter(span => span.column < grid.cursor.column).map(span => span.text).join(''),
        right: row.filter(span => span.column >= grid.cursor.column && !faint.has(span.style_id)).map(span => span.text).join(''),
        busy: working((grid.row_spans ?? []).map(span => span.text).join('')),
      };
    },
    async ready(call, t) { return ready(await this.input(call, t)); },
    async submit(call, t, prompt) {
      // The send CLI expands backslash-n/r/t. RPC sends literal text.
      await call(['cmux', 'rpc', 'surface.send_text', JSON.stringify({ workspace_id: t.workspace, surface_id: t.surface, text: prompt })]);
      await sleep(250);
      await call(['cmux', 'send-key', '--workspace', t.workspace, '--surface', t.surface, 'Enter']);
      return { confirmed: await confirmCleared(() => this.input(call, t)), proof: 'input-line-cleared' };
    },
    fromEnv: async env => env.CMUX_WORKSPACE_ID && env.CMUX_SURFACE_ID ? { workspace: env.CMUX_WORKSPACE_ID, surface: env.CMUX_SURFACE_ID } : null,
    async read(call, t) { return (await call(['cmux', 'read-screen', '--workspace', t.workspace, '--surface', t.surface, '--lines', '40'])).output; },
    async list(call) {
      const tree = json((await call(['cmux', '--id-format', 'uuids', 'tree', '--all', '--json'])).output);
      const sessions = json((await call(['cmux', 'sessions', 'list', '--json', '--all']).catch(() => ({ output: '' }))).output)?.sessions ?? [];
      const starts = await processStarts(call, [...new Set(sessions.filter(r => r.stored_pid_exists === true && Number.isSafeInteger(r.pid)).map(r => r.pid))]);
      const rows = [];
      for (const w of tree?.windows ?? []) for (const ws of w.workspaces ?? []) for (const pane of ws.panes ?? []) for (const s of pane.surfaces ?? []) {
        if (s.type !== 'terminal') continue;
        const session = liveRecords(sessions, s.id).sort((a, b) => (b.updated_at_unix ?? 0) - (a.updated_at_unix ?? 0))[0];
        const agent = session && starts.has(session.pid) ? { pid: session.pid, startedAt: starts.get(session.pid) } : null;
        rows.push({ target: { type: 'cmux', workspace: ws.id, surface: s.id, ...(agent ? { agent } : {}) }, label: s.title ?? s.id, group: ws.title ?? ws.id, live: !!session, agent: session?.agent ?? null, session: session?.session_id ?? null, cwd: session?.cwd ?? null });
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
    async ready(call, t) {
      // Orca reports TUI idleness; it does not expose the input line, so drafts cannot be detected here.
      const waited = await call(['orca', 'terminal', 'wait', '--terminal', t.terminal, '--for', 'tui-idle', '--timeout-ms', '2000', '--json']).catch(error => error);
      return waited instanceof Error ? { ok: false, reason: `agent is not idle (${waited.message})` } : { ok: true };
    },
    async submit(call, t, prompt) {
      // --wait-submit observes the same accepted prompt and never resends; stages prove acceptance and turn start.
      const sent = json((await call(['orca', 'terminal', 'send', '--terminal', t.terminal, '--text', prompt, '--enter', '--wait-submit', '10', '--json'])).output);
      if (sent?.ok === false) throw new Error(`orca send failed (${sent.error?.code ?? 'unknown'})`);
      // input_accepted only means the PTY received the text; only an observed submission or turn start counts.
      const stages = new Set();
      const collect = value => { if (Array.isArray(value)) value.forEach(collect); else if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) { if (/stage/i.test(key)) [v].flat().forEach(x => typeof x === 'string' ? stages.add(x) : collect(x)); else collect(v); } };
      collect(sent?.result ?? sent);
      const proof = ['turn_started', 'submitted', 'submission_observed'].find(stage => stages.has(stage));
      return { confirmed: !!proof, proof: proof && `orca-${proof.replace(/_/g, '-')}` };
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
    async input(call, t) {
      const [x, y, mode] = (await call(['tmux', '-S', t.socket, 'display-message', '-p', '-t', t.pane, '#{cursor_x}\t#{cursor_y}\t#{pane_in_mode}'])).output.trim().split('\t').map(Number);
      if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('tmux cursor unavailable');
      // In copy mode typed keys become copy-mode commands.
      if (mode) return { left: '', right: '', busy: true };
      const screen = (await call(['tmux', '-S', t.socket, 'capture-pane', '-p', '-e', '-t', t.pane])).output.split('\n');
      return { ...splitStyled(screen[y] ?? '', x), busy: working(screen.join('\n').replace(/\x1b\[[0-9;]*m/g, '')) };
    },
    async ready(call, t) { return ready(await this.input(call, t)); },
    async submit(call, t, prompt) {
      await call(['tmux', '-S', t.socket, 'send-keys', '-t', t.pane, '-l', '--', prompt]);
      await sleep(250);
      await call(['tmux', '-S', t.socket, 'send-keys', '-t', t.pane, 'Enter']);
      return { confirmed: await confirmCleared(() => this.input(call, t)), proof: 'input-line-cleared' };
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
  const allowed = target.type === 'command' ? ['type', 'argv', 'cwd'] : manager && ['type', ...manager.fields, ...(manager.optional ?? []), 'mode', 'prompt'];
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
  if (target.agent !== undefined) {
    const a = target.agent;
    if (!a || typeof a !== 'object' || Object.keys(a).some(k => !['pid', 'startedAt'].includes(k)) || !Number.isSafeInteger(a.pid) || a.pid < 1) throw new Error('agent requires pid and startedAt');
    text(a.startedAt, 'agent startedAt');
  }
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
  // Never type over a draft or into a busy agent: skip this occurrence without input; the schedule stays enabled.
  const ready = await manager.ready(call, target).catch(error => ({ ok: false, reason: error.message }));
  if (!ready.ok) return { status: 'not-delivered', acknowledgment: 'receiver-not-ready-before-input', receiverGone: false, error: ready.reason };
  // Flatten newlines and reject terminal control characters before the effect.
  const prompt = target.prompt.replace(/[\r\n]+/g, ' ');
  // Claude Code and Codex both accept `/goal <objective>`: the session keeps working until the objective holds.
  const sent = await manager.submit(call, target, target.mode === 'goal' ? `/goal ${prompt}` : prompt);
  // Unconfirmed submission may have left text in the input line; keep it pending and never resend.
  if (!sent.confirmed) return { status: 'uncertain', acknowledgment: 'submission-not-confirmed', error: 'Input was typed but submission was not observed; inspect the receiver before resolving' };
  return { status: 'transport-accepted', acknowledgment: 'submitted-not-model-turn', proof: sent.proof };
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

// The agent process behind a hook's session id; cmux records every Claude/Codex session with its PID.
export async function agentForSession(sessionId, options = {}) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  const call = caller({ timeoutMs: 5000, maxOutput: 1 << 20, ...options });
  const sessions = json((await call(['cmux', 'sessions', 'list', '--session', sessionId, '--json', '--all']).catch(() => ({ output: '' }))).output)?.sessions ?? [];
  const record = sessions.find(r => r.session_id?.toLowerCase() === sessionId.toLowerCase() && Number.isSafeInteger(r.pid));
  if (!record) return null;
  const startedAt = (await processStarts(call, [record.pid])).get(record.pid);
  return startedAt ? { pid: record.pid, startedAt } : null;
}
