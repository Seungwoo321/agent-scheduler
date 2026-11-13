import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, symlink, readFile } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { Store, validate, nextDue } from '../src/core.mjs';
import { dispatch, processCommand } from '../src/targets.mjs';

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

test('AC-2 terminal targets use literal text and explicit Enter; queue acknowledges delivery only', async () => {
  const uuid = '12345678-1234-1234-1234-123456789abc';
  const calls = [], execute = async (argv, options) => { calls.push({ argv, options }); return { code: 0, output: argv[0] === 'tmux' ? '%3' : uuid }; };
  assert.equal((await dispatch({ type: 'cmux', surface: uuid, workspace: uuid, prompt: 'first\nsecond\\nend' }, { execute })).status, 'transport-accepted');
  assert.equal(JSON.parse(calls[1].argv.at(-1)).text, 'first second\\nend'); assert.equal(calls[2].argv.at(-1), 'Enter');
  calls.length = 0;
  await dispatch({ type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', prompt: 'C-c; $(echo x)' }, { execute });
  assert.deepEqual(calls[1].argv.slice(-3), ['-l', '--', 'C-c; $(echo x)']);
  calls.length = 0;
  const result = await dispatch({ type: 'codex-queue', home: '/tmp/codex-home', thread: uuid, prompt: 'check' }, { execute });
  assert.equal(calls[0].argv[1], 'queue'); assert.equal(calls[0].options.env.CODEX_HOME, '/tmp/codex-home');
  assert.equal(result.acknowledgment, 'delivery-only-not-model-turn');
  await assert.rejects(dispatch({ type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', prompt: 'bad\x1b[2J' }), /Invalid/);
  await assert.rejects(dispatch({ type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', prompt: 'bad\tcompletion' }), /Tab/);
});

test('AC-2 partial terminal submission failure does not try another transport', async () => {
  let calls = 0;
  await assert.rejects(dispatch({ type: 'tmux', socket: '/tmp/tmux-test', pane: '%3', prompt: 'hello' }, { execute: async () => ({ code: ++calls === 3 ? 1 : 0, output: '%3' }) }), /Transport failed/);
  assert.equal(calls, 3);
});
