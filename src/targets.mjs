import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

const text = (v, name) => {
  if (typeof v !== 'string' || !v.trim() || /[\x00-\x08\x0b-\x1f\x7f]/.test(v)) throw new Error(`Invalid ${name}`);
};

export function validateTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) throw new Error('target must be an object');
  const allowed = {
    command: ['type', 'argv', 'cwd'],
    cmux: ['type', 'surface', 'workspace', 'prompt'],
    tmux: ['type', 'socket', 'pane', 'prompt'],
    'codex-queue': ['type', 'thread', 'home', 'prompt'],
  }[target.type];
  if (!allowed || Object.keys(target).some(k => !allowed.includes(k))) throw new Error('Unknown target type or field');
  if (target.type === 'command') {
    if (!Array.isArray(target.argv) || !target.argv.length) throw new Error('command.argv must be nonempty');
    target.argv.forEach(v => text(v, 'argument'));
    text(target.cwd, 'cwd');
    if (!isAbsolute(target.cwd)) throw new Error('cwd must be absolute');
  } else {
    text(target.prompt, 'prompt');
    if (target.prompt.includes('\t')) throw new Error('Tab control input is not allowed in prompts');
    if (target.prompt.length > 16000) throw new Error('prompt exceeds 16000 characters');
    if (target.type === 'cmux') {
      // Durable UUIDs avoid dispatching into a reused short reference.
      if (![target.surface, target.workspace].every(v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v))) throw new Error('cmux requires surface and workspace UUIDs');
    } else if (target.type === 'tmux') {
      if (!/^%\d+$/.test(target.pane)) throw new Error('tmux requires an exact %pane id');
      text(target.socket, 'tmux socket');
      if (!isAbsolute(target.socket)) throw new Error('tmux socket must be absolute');
    } else {
      if (typeof target.thread !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(target.thread)) throw new Error('Codex requires a thread UUID');
      text(target.home, 'Codex home');
      if (!isAbsolute(target.home)) throw new Error('Codex home must be absolute');
    }
  }
  return target;
}

export function targetKey(t) {
  // Prompt changes do not create a second destination.
  const key = t.type === 'command' ? [t.type, t.argv, t.cwd]
    : t.type === 'cmux' ? [t.type, t.workspace, t.surface]
      : t.type === 'tmux' ? [t.type, t.socket, t.pane] : [t.type, t.home, t.thread];
  return createHash('sha256').update(JSON.stringify(key)).digest('hex');
}

export function processCommand(argv, { cwd, env = process.env, timeoutMs = 30000, signal } = {}) {
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
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-65536); });
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

export async function dispatch(target, options = {}) {
  validateTarget(target);
  const execute = options.execute ?? processCommand;
  const call = async (argv, extra = {}) => {
    if (options.signal?.aborted) throw new Error('Dispatch aborted');
    const result = await execute(argv, { ...options, ...extra });
    if (result.code !== 0 || result.timedOut || result.aborted) throw new Error(`Transport failed (${result.timedOut ? 'timeout' : result.aborted ? 'aborted' : result.code})`);
    return result;
  };
  if (target.type === 'command') {
    await call(target.argv, { cwd: target.cwd });
    return { status: 'succeeded', acknowledgment: 'command-exited-zero' };
  }
  // Flatten newlines and reject terminal control characters before the effect.
  const prompt = target.prompt.replace(/[\r\n]+/g, ' ');
  if (target.type === 'cmux') {
    const listed = await call(['cmux', '--id-format', 'uuids', 'tree', '--workspace', target.workspace]);
    if (!listed.output.toLowerCase().includes(target.surface.toLowerCase())) throw new Error('cmux surface is absent from the declared workspace');
    // The send CLI expands backslash-n/r/t. RPC sends literal text.
    await call(['cmux', 'rpc', 'surface.send_text', JSON.stringify({ workspace_id: target.workspace, surface_id: target.surface, text: prompt })]);
    await new Promise(resolve => setTimeout(resolve, 250));
    await call(['cmux', 'send-key', '--workspace', target.workspace, '--surface', target.surface, 'Enter']);
  } else if (target.type === 'tmux') {
    const listed = await call(['tmux', '-S', target.socket, 'display-message', '-p', '-t', target.pane, '#{pane_id}']);
    if (listed.output.trim() !== target.pane) throw new Error('tmux pane identity mismatch');
    await call(['tmux', '-S', target.socket, 'send-keys', '-t', target.pane, '-l', '--', prompt]);
    await new Promise(resolve => setTimeout(resolve, 250));
    await call(['tmux', '-S', target.socket, 'send-keys', '-t', target.pane, 'Enter']);
  } else {
    const result = await call(['codex', 'queue', '--thread', target.thread, '--message', target.prompt], { env: { ...process.env, CODEX_HOME: target.home } });
    if (/warning|failed/i.test(result.output ?? '')) throw new Error('Codex queue reported a warning; inspect the native queue before retrying');
  }
  return { status: 'transport-accepted', acknowledgment: 'delivery-only-not-model-turn' };
}
