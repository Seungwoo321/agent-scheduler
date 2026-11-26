import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { Store } from '../src/core.mjs';
import { createUi } from '../src/ui.mjs';

const uuid = '12345678-1234-1234-1234-123456789abc';
const terminalSpec = { schemaVersion: 1, id: 'wake', enabled: true, trigger: { everyMs: 60000 }, target: { type: 'cmux', workspace: uuid, surface: uuid, mode: 'goal', prompt: 'Finish the release checklist' }, maxRuns: 3, expiresAt: '2099-01-01T00:00:00Z', timeoutMs: 5000 };

async function serve(t) {
  const root = await mkdtemp(join(tmpdir(), 'agent-scheduler-ui-'));
  const store = new Store(root);
  const { server, token } = createUi(store, { token: 'secret', terminals: async () => [] });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); await rm(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, path, body) => fetch(base + path, { method, headers: { authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  return { store, base, call };
}

test('AC-5 UI API requires the token and a loopback host', async t => {
  const { base, call } = await serve(t);
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/api/schedules')).status, 401);
  // fetch cannot override Host; a raw request models a DNS-rebinding page.
  const rebinding = await new Promise((resolve, reject) => request(base + '/api/schedules', { headers: { host: 'attacker.example', authorization: 'Bearer secret' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject).end());
  assert.equal(rebinding, 421);
  assert.equal((await call('GET', '/api/schedules')).status, 200);
});

test('AC-5 UI registers, edits, pauses and deletes terminal schedules; command targets stay CLI-only', async t => {
  const { store, call } = await serve(t);
  assert.equal((await call('POST', '/api/schedules', terminalSpec)).status, 200);
  assert.equal((await call('POST', '/api/schedules', terminalSpec)).status, 409);
  assert.equal((await call('PUT', '/api/schedules/wake', { ...terminalSpec, target: { ...terminalSpec.target, prompt: 'Changed' } })).status, 200);
  assert.equal((await store.list())[0].spec.target.prompt, 'Changed');
  assert.equal((await call('PUT', '/api/schedules/wake', { ...terminalSpec, id: 'other' })).status, 400);
  assert.equal((await call('POST', '/api/schedules/wake/pause')).status, 200);
  assert.equal((await store.list())[0].spec.enabled, false);
  const command = { ...terminalSpec, id: 'cmd', target: { type: 'command', argv: ['/usr/bin/true'], cwd: '/tmp' } };
  assert.equal((await call('POST', '/api/schedules', command)).status, 403);
  await store.put(command);
  assert.equal((await call('PUT', '/api/schedules/cmd', command)).status, 403);
  assert.equal((await call('DELETE', '/api/schedules/cmd')).status, 200);
  assert.equal((await call('DELETE', '/api/schedules/wake')).status, 200);
  assert.deepEqual(await store.list(), []);
});
