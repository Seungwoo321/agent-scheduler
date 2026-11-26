import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, symlink, readFile } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { Store, validate, nextDue } from '../src/core.mjs';
import { dispatch, processCommand, currentReceivers } from '../src/targets.mjs';

const spec = (id = 'watch') => ({ schemaVersion: 1, id, enabled: true, trigger: { at: '2026-01-01T00:00:00Z' }, target: { type: 'command', argv: [process.execPath, '-e', 'process.exit(0)'], cwd: tmpdir() }, maxRuns: 2, expiresAt: '2099-01-01T00:00:00Z', timeoutMs: 5000 });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'agent-scheduler-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return new Store(root);
}

test('AC-1 rejects invalid schedules before replacing persisted definitions', async t => {
  const store = await fixture(t), s = spec();
  await store.put(s);
  for (const change of [{ id: '../escape' }, { id: undefined }, { maxRuns: 0 }, { enabled: 'yes' }, { trigger: { cron: { expression: 'nonsense', timezone: 'UTC' } } }, { unknown: 1 }]) {
    await assert.rejects(store.put({ ...s, ...change }));
  }
  assert.deepEqual((await store.list())[0].spec, s);
});

test('AC-1 cron timezone and interval calculate future times', () => {
  const s = { ...spec(), trigger: { cron: { expression: '0 9 * * *', timezone: 'Asia/Seoul' } } };
  validate(s);
  assert.equal(nextDue(s, Date.parse('2026-01-01T00:00:00Z')), '2026-01-02T00:00:00.000Z');
  assert.equal(nextDue({ ...s, trigger: { everyMs: 1000 } }, 0), '1970-01-01T00:00:01.000Z');
});

test('AC-1 one-shot dispatches once even when maxRuns is greater than one; reload preserves state', async t => {
  const store = await fixture(t); await store.put(spec());
  const first = await store.tick();
  assert.equal(first[0].status, 'succeeded');
  assert.deepEqual(await new Store(store.root).tick(), []);
});

test('AC-1 direct schedule file initializes interval once; expiry and budget stop execution', async t => {
  const store = await fixture(t); await store.init();
  const s = { ...spec(), trigger: { everyMs: 1000 }, maxRuns: 1 };
  await writeFile(store.path('schedules', s.id), JSON.stringify(s));
  const now = Date.parse('2026-11-01T00:00:00Z');
  assert.deepEqual(await store.tick({ now }), []);
  assert.equal((await store.tick({ now: now + 1000 }))[0].status, 'succeeded');
  assert.deepEqual(await store.tick({ now: now + 2000 }), []);
  await store.put({ ...spec('expired'), expiresAt: '2020-01-01T00:00:00Z' });
  assert.deepEqual(await store.tick({ now }), []);
});

test('AC-3 intent is durable before effects and crash/uncertain dispatch never automatically replays', async t => {
  const store = await fixture(t); await store.put(spec());
  let calls = 0;
  const execute = async () => {
    calls++;
    const state = await store.read(store.path('state', 'watch'));
    assert.ok(state.pending);
    assert.equal((await store.read(store.path('runs', state.pending))).status, 'intent');
    assert.deepEqual((await store.read(store.path('runs', state.pending))).definition, spec());
    throw new Error('Ambiguous submission');
  };
  assert.equal((await store.tick({ execute }))[0].status, 'uncertain');
  assert.deepEqual(await new Store(store.root).tick({ execute }), []);
  assert.equal(calls, 1);
  await assert.rejects(store.remove('watch'), /pending/);
  await assert.rejects(store.put(spec()), /pending/);
});

test('AC-3 overlapping targets and concurrent ticks cannot dispatch twice', async t => {
  const store = await fixture(t); await store.put(spec('one')); await store.put(spec('two'));
  let release, entered;
  const started = new Promise(r => { entered = r; });
  const pending = new Promise(r => { release = r; });
  const first = store.tick({ execute: async () => { entered(); await pending; return { status: 'succeeded' }; } });
  await started;
  assert.deepEqual(await store.tick(), []);
  release(); await first;
  assert.equal((await store.tick()).length, 1);
});

test('AC-3 distinct targets completing together persist all receipts without lock races', async t => {
  const store = await fixture(t);
  for (let i = 0; i < 8; i++) await store.put({ ...spec(`job-${i}`), target: { ...spec().target, argv: ['echo', String(i)] } });
  const results = await store.tick({ execute: async () => ({ status: 'succeeded' }) });
  assert.equal(results.length, 8);
  for (const { state } of await store.list()) assert.equal(state.pending, undefined);
});

test('AC-3 pause and removal preserve receipts; locks reject a second owner', async t => {
  const store = await fixture(t); await store.put(spec());
  await store.enable('watch', false); assert.deepEqual(await store.tick(), []);
  await store.enable('watch', true); const [run] = await store.tick();
  await store.remove('watch'); assert.equal((await store.read(store.path('runs', run.runId))).status, 'succeeded');
  await store.lock('daemon', async () => {
    await assert.rejects(store.lock('daemon', async () => {}), /lock held/);
    await assert.rejects(store.unlock('daemon'), /live or unknown/);
  });
});

test('AC-3 store symlinks and schedule path traversal are rejected', async t => {
  const store = await fixture(t); await store.init();
  await symlink('/tmp', store.path('schedules', 'link'));
  await assert.rejects(store.list(), /symlink/);
  assert.throws(() => store.path('state', '../outside'), /Invalid id/);
});

test('AC-2 real command preserves literal shell syntax and kills timed-out process groups', async () => {
  const result = await processCommand([process.execPath, '-e', 'console.log(process.argv[1])', '$(echo injected); C-c']);
  assert.equal(result.output.trim(), '$(echo injected); C-c');
  const timeout = await processCommand([process.execPath, '-e', 'setInterval(()=>{},1000)'], { timeoutMs: 100 });
  assert.equal(timeout.timedOut, true);
});

test('AC-2 timeout removes descendants even when the leader exits before escalation', async t => {
  let pid;
  t.after(() => { if (pid) try { process.kill(pid, 'SIGKILL'); } catch {} });
  const childCode = 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)';
  const parentCode = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)`;
  const result = await processCommand([process.execPath, '-e', parentCode], { timeoutMs: 400 });
  pid = Number(result.output.trim());
  assert.ok(pid > 0); assert.equal(result.timedOut, true);
  await new Promise(r => setTimeout(r, 100));
  let exists = false;
  try { process.kill(pid, 0); exists = true; } catch (error) { assert.equal(error.code, 'ESRCH'); }
  // Linux can retain an already-dead adopted child as a zombie briefly.
  if (exists && process.platform === 'linux') {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return ''; });
    assert.ok(!stat || /\) Z /.test(stat), stat);
  } else assert.equal(exists, false, 'Descendant survived group termination');
});

test('AC-3 recovery mutex prevents parallel stale-owner unlocks', async t => {
  const store = await fixture(t); await store.init();
  const exited = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  const lock = join(store.root, 'daemon.lock'); await mkdir(lock);
  await store.atomic(join(lock, 'owner.json'), { pid: exited.pid, host: hostname() });
  const results = await Promise.allSettled([store.unlock('daemon'), store.unlock('daemon')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});

test('AC-2 terminal targets verify a live agent, then send literal text and Enter', async () => {
  const uuid = '12345678-1234-1234-1234-123456789abc';
  const live = JSON.stringify({ sessions: [{ surface_id: uuid, stored_pid_exists: true }] });
  const calls = [], execute = async (argv, options) => {
    calls.push({ argv, options });
    const output = argv[0] === 'tmux' ? '%3\tclaude' : argv[1] === 'sessions' ? live : argv[1] === 'terminal' && argv[2] === 'show' ? '{"ok":true,"result":{"terminal":{"agentIdentity":"codex"}}}' : uuid;
    return { code: 0, output };
  };
  assert.equal((await dispatch({ type: 'cmux', surface: uuid, workspace: uuid, prompt: 'first\nsecond\\nend' }, { execute })).status, 'transport-accepted');
  assert.equal(JSON.parse(calls[2].argv.at(-1)).text, 'first second\\nend'); assert.equal(calls[3].argv.at(-1), 'Enter');
  calls.length = 0;
  await dispatch({ type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', prompt: 'C-c; $(echo x)' }, { execute });
  assert.deepEqual(calls[1].argv.slice(-3), ['-l', '--', 'C-c; $(echo x)']);
  calls.length = 0;
  const result = await dispatch({ type: 'orca', terminal: 'term_1', mode: 'goal', prompt: 'all tests pass' }, { execute });
  assert.deepEqual(calls[1].argv, ['orca', 'terminal', 'send', '--terminal', 'term_1', '--text', '/goal all tests pass', '--enter', '--json']);
  assert.equal(result.acknowledgment, 'delivery-only-not-model-turn');
  await assert.rejects(dispatch({ type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', prompt: 'bad\x1b[2J' }), /Invalid/);
  await assert.rejects(dispatch({ type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', prompt: 'bad\tcompletion' }), /Tab/);
  await assert.rejects(dispatch({ type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', mode: 'loop', prompt: 'x' }), /mode/);
  await assert.rejects(dispatch({ type: 'codex-queue', home: '/tmp', thread: uuid, prompt: 'x' }), /removed/);
});

test('AC-2 an ended receiver session is not typed into and its schedule is paused', async t => {
  const store = await fixture(t);
  await store.put({ ...spec(), target: { type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', prompt: 'check' } });
  const calls = [];
  const execute = (target, options) => dispatch(target, { ...options, execute: async argv => { calls.push(argv); return { code: 0, output: '%3\tzsh' }; } });
  const [run] = await store.tick({ execute });
  assert.equal(run.status, 'not-delivered');
  assert.equal(calls.length, 1);
  const [{ spec: saved, state }] = await store.list();
  assert.equal(saved.enabled, false); assert.equal(state.pending, undefined);
});

test('AC-2 a failed receiver check that is not absence keeps the schedule enabled', async t => {
  const store = await fixture(t);
  await store.put({ ...spec(), target: { type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', prompt: 'check' } });
  const execute = (target, options) => dispatch(target, { ...options, execute: async () => ({ code: null, output: '', timedOut: false, aborted: true }) });
  const [run] = await store.tick({ execute });
  assert.equal(run.status, 'not-delivered'); assert.equal(run.receiverGone, false);
  const [{ spec: saved, state }] = await store.list();
  assert.equal(saved.enabled, true); assert.equal(state.pending, undefined);
});

test('AC-2 a cmux schedule follows its agent process across /clear and pauses when the process is replaced', async t => {
  const store = await fixture(t), uuid = '12345678-1234-1234-1234-123456789abc';
  const agent = { pid: 4242, startedAt: 'Thu Nov 26 10:00:00 2026' };
  await store.put({ ...spec(), trigger: { everyMs: 1000 }, target: { type: 'cmux', workspace: uuid, surface: uuid, agent, prompt: 'check' } });
  let record = { surface_id: uuid, session_id: 'after-clear', pid: 4242, stored_pid_exists: true }, sent = 0;
  const execute = (target, options) => dispatch(target, { ...options, execute: async argv => {
    if (argv[0] === 'ps') return { code: 0, output: `${record.pid} ${record.pid === 4242 ? agent.startedAt : 'Thu Nov 26 11:00:00 2026'}\n` };
    if (argv[1] === 'sessions') return { code: 0, output: JSON.stringify({ sessions: [record] }) };
    if (argv[1] === 'rpc') sent++;
    return { code: 0, output: uuid };
  } });
  const now = Date.now() + 2000;
  assert.equal((await store.tick({ now, execute }))[0].status, 'transport-accepted');
  assert.equal(sent, 1);
  record = { ...record, session_id: 'new-process', pid: 5151 };
  const [run] = await store.tick({ now: now + 2000, execute });
  assert.equal(run.receiverGone, true); assert.equal(sent, 1);
  assert.equal((await store.list())[0].spec.enabled, false);
});

test('AC-2 a closed cmux workspace counts as an absent receiver', async () => {
  const uuid = '12345678-1234-1234-1234-123456789abc';
  const result = await dispatch({ type: 'cmux', workspace: uuid, surface: uuid, prompt: 'x' }, { execute: async () => ({ code: 1, output: 'Error: not_found: Workspace not found' }) });
  assert.equal(result.receiverGone, true);
  await assert.rejects(dispatch({ type: 'tmux', socket: '/tmp/s', pane: '%1', agent: { pid: 1, startedAt: 'x' }, prompt: 'x' }), /Unknown target/);
});

test('AC-1 editing a one-shot that already ran does not dispatch it again', async t => {
  const store = await fixture(t); await store.put(spec());
  assert.equal((await store.tick()).length, 1);
  await store.put({ ...spec(), maxRuns: 5 });
  assert.deepEqual(await store.tick(), []);
});

test('AC-3 session end removes schedules addressed to that terminal only', async t => {
  const store = await fixture(t), uuid = '12345678-1234-1234-1234-123456789abc', other = '12345678-1234-1234-1234-123456789abd';
  await store.put({ ...spec('mine'), target: { type: 'cmux', workspace: uuid, surface: uuid, prompt: 'check' } });
  await store.put({ ...spec('theirs'), target: { type: 'cmux', workspace: uuid, surface: other, prompt: 'check' } });
  await store.put(spec('command'));
  const receivers = await currentReceivers({ CMUX_WORKSPACE_ID: uuid.toUpperCase(), CMUX_SURFACE_ID: uuid.toUpperCase() });
  assert.deepEqual(await store.removeForReceivers(receivers), [{ id: 'mine', removed: true }]);
  assert.deepEqual((await store.list()).map(e => e.spec.id), ['command', 'theirs']);
  // Another agent process ending in the same terminal does not end a schedule bound to the receiving process.
  const agent = { pid: 4242, startedAt: 'Thu Nov 26 10:00:00 2026' };
  await store.put({ ...spec('bound'), target: { type: 'cmux', workspace: uuid, surface: uuid, agent, prompt: 'check' } });
  assert.deepEqual(await store.removeForReceivers(receivers, { pid: 5151, startedAt: agent.startedAt }), []);
  assert.deepEqual(await store.removeForReceivers(receivers, null), []);
  assert.deepEqual(await store.removeForReceivers(receivers, { ...agent }), [{ id: 'bound', removed: true }]);
});

test('AC-3 session-end hook keeps schedules on /clear and /resume', async t => {
  const store = await fixture(t), uuid = '12345678-1234-1234-1234-123456789abc';
  await store.put({ ...spec('mine'), target: { type: 'cmux', workspace: uuid, surface: uuid, prompt: 'check' } });
  const run = reason => spawnSync(process.execPath, [new URL('../src/cli.mjs', import.meta.url).pathname, '--store', store.root, 'session-end'], { input: JSON.stringify({ session_id: 's', reason }), encoding: 'utf8', env: { ...process.env, CMUX_WORKSPACE_ID: uuid, CMUX_SURFACE_ID: uuid, TMUX: '', TMUX_PANE: '', ORCA_PANE_KEY: '' } });
  for (const reason of ['clear', 'resume']) assert.equal(JSON.parse(run(reason).stdout).skipped, reason);
  assert.equal((await store.list()).length, 1);
  assert.deepEqual(JSON.parse(run('prompt_input_exit').stdout).schedules, [{ id: 'mine', removed: true }]);
});

test('AC-2 partial terminal submission failure does not try another transport', async () => {
  let calls = 0;
  await assert.rejects(dispatch({ type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', prompt: 'hello' }, { execute: async () => ({ code: ++calls === 3 ? 1 : 0, output: '%3' }) }), /Transport failed/);
  assert.equal(calls, 3);
});
