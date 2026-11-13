import { mkdir, readFile, writeFile, rename, readdir, rm, open, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { Cron } from 'croner';
import { dispatch, targetKey, validateTarget } from './targets.mjs';

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const iso = value => new Date(value).toISOString();
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };

export function validate(spec) {
  const fields = ['schemaVersion', 'id', 'trigger', 'target', 'maxRuns', 'expiresAt', 'timeoutMs', 'enabled', 'cooldownMs'];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || Object.keys(spec).some(k => !fields.includes(k))) throw new Error('Unknown schedule field');
  if (spec.schemaVersion !== 1 || typeof spec.id !== 'string' || !idPattern.test(spec.id)) throw new Error('Expected schemaVersion 1 and a safe id');
  if (typeof spec.enabled !== 'boolean') throw new Error('enabled must be boolean');
  if (!Number.isSafeInteger(spec.maxRuns) || spec.maxRuns < 1 || spec.maxRuns > 100000) throw new Error('maxRuns must be 1..100000');
  if (!Number.isSafeInteger(spec.timeoutMs) || spec.timeoutMs < 100 || spec.timeoutMs > 900000) throw new Error('timeoutMs must be 100..900000');
  if (spec.cooldownMs !== undefined && (!Number.isSafeInteger(spec.cooldownMs) || spec.cooldownMs < 0 || spec.cooldownMs > 86400000)) throw new Error('Invalid cooldownMs');
  if (typeof spec.expiresAt !== 'string' || !Number.isFinite(Date.parse(spec.expiresAt))) throw new Error('expiresAt must be a timestamp');
  const t = spec.trigger;
  if (!t || Object.keys(t).length !== 1) throw new Error('trigger requires exactly one of at, everyMs, cron');
  if ('at' in t) {
    if (typeof t.at !== 'string' || !Number.isFinite(Date.parse(t.at))) throw new Error('Invalid at timestamp');
  } else if ('everyMs' in t) {
    if (!Number.isSafeInteger(t.everyMs) || t.everyMs < 1000) throw new Error('everyMs must be >=1000');
  } else if ('cron' in t) {
    if (!t.cron || typeof t.cron.expression !== 'string' || typeof t.cron.timezone !== 'string' || Object.keys(t.cron).some(k => !['expression', 'timezone'].includes(k))) throw new Error('cron requires expression and timezone');
    new Cron(t.cron.expression, { paused: true, timezone: t.cron.timezone }).stop();
  } else throw new Error('Unknown trigger');
  validateTarget(spec.target);
  return spec;
}

export function nextDue(spec, now) {
  if (spec.trigger.at) return Date.parse(spec.trigger.at) > now ? spec.trigger.at : null;
  if (spec.trigger.everyMs) return iso(now + spec.trigger.everyMs);
  const cron = new Cron(spec.trigger.cron.expression, { paused: true, timezone: spec.trigger.cron.timezone });
  try { return cron.nextRun(new Date(now))?.toISOString() ?? null; } finally { cron.stop(); }
}

export class Store {
  constructor(root) { this.root = resolve(root); }
  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink()) throw new Error('Store root must not be a symlink');
    for (const dir of ['schedules', 'state', 'runs']) {
      const path = join(this.root, dir);
      await mkdir(path, { recursive: true, mode: 0o700 });
      if ((await lstat(path)).isSymbolicLink()) throw new Error('Store directories must not be symlinks');
    }
  }
  path(dir, id) {
    if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Invalid id');
    return join(this.root, dir, `${id}.json`);
  }
  async read(path) {
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error('Refusing symlink'); return JSON.parse(await readFile(path, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  async atomic(path, value) {
    const temp = `${path}.${randomUUID()}.tmp`;
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
    await rename(temp, path);
  }
  async lock(name, fn) {
    await this.init();
    const path = join(this.root, `${name}.lock`);
    const deadline = Date.now() + (name === 'store' ? 5000 : 0);
    for (;;) {
      try { await mkdir(path, { mode: 0o700 }); break; }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        if (Date.now() >= deadline) throw new Error(`${name} lock held; inspect status and unlock only after owner exit`);
        await new Promise(r => setTimeout(r, 25));
      }
    }
    try {
      await this.atomic(join(path, 'owner.json'), { pid: process.pid, host: hostname(), startedAt: iso(Date.now()) });
      return await fn();
    } finally { await rm(path, { recursive: true }); }
  }
  async unlock(name) {
    if (!['store', 'daemon'].includes(name)) throw new Error('Unknown lock');
    // Recovery callers must not remove a replacement owner's lock.
    return this.lock('recovery', async () => {
      const path = join(this.root, `${name}.lock`), owner = await this.read(join(path, 'owner.json'));
      if (!owner || owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || alive(owner.pid)) throw new Error('Owner is live or unknown; refusing unlock');
      await rm(path, { recursive: true });
      return { unlocked: name, owner };
    });
  }
  async list() {
    await this.init();
    const result = [];
    for (const name of (await readdir(join(this.root, 'schedules'))).filter(n => n.endsWith('.json')).sort()) {
      const spec = validate(await this.read(join(this.root, 'schedules', name)));
      if (name !== `${spec.id}.json`) throw new Error(`Schedule filename/id mismatch: ${name}`);
      result.push({ spec, state: await this.read(this.path('state', spec.id)) });
    }
    return result;
  }
  async put(spec) {
    validate(spec);
    return this.lock('store', async () => {
      const previous = await this.read(this.path('state', spec.id));
      if (previous?.pending) throw new Error('Resolve the pending run before replacing this schedule');
      await this.atomic(this.path('schedules', spec.id), spec);
      // Replacing a definition keeps its execution budget and history.
      const state = { ...previous, runs: previous?.runs ?? 0, nextAt: spec.trigger.at ?? nextDue(spec, Date.now()) };
      await this.atomic(this.path('state', spec.id), state);
      return { spec, state };
    });
  }
  async enable(id, enabled) {
    return this.lock('store', async () => {
      const spec = await this.read(this.path('schedules', id));
      if (!spec) throw new Error('Schedule not found');
      await this.atomic(this.path('schedules', id), validate({ ...spec, enabled }));
      return { id, enabled };
    });
  }
  async remove(id) {
    return this.lock('store', async () => {
      const state = await this.read(this.path('state', id));
      if (state?.pending) throw new Error('Cannot remove a pending schedule; pause and resolve it first');
      await rm(this.path('schedules', id));
      // State and run receipts survive cancellation/removal.
      return { id, removed: true };
    });
  }
  async resolveRun(id, runId) {
    return this.lock('store', async () => {
      const state = await this.read(this.path('state', id));
      const receipt = await this.read(this.path('runs', runId));
      if (!state?.pending || state.pending !== runId || !receipt || receipt.id !== id) throw new Error('Pending run mismatch');
      if (receipt.ownerHost !== hostname() || alive(receipt.ownerPid)) throw new Error('Run owner live or unknown; refusing resolution');
      await this.atomic(this.path('runs', runId), { ...receipt, status: 'resolved-no-replay', finishedAt: iso(Date.now()) });
      delete state.pending;
      await this.atomic(this.path('state', id), state);
      return { id, runId, status: 'resolved-no-replay' };
    });
  }
  async tick({ now = Date.now(), execute = dispatch, signal } = {}) {
    const claimed = await this.lock('store', async () => {
      const all = await this.list(), busy = new Set();
      for (const { state } of all) if (state?.pending && state.targetKey) busy.add(state.targetKey);
      const selected = [];
      for (const entry of all) {
        const { spec } = entry;
        let { state } = entry;
        if (!state) {
          state = { runs: 0, nextAt: spec.trigger.at ?? nextDue(spec, now) };
          await this.atomic(this.path('state', spec.id), state);
        }
        if (!spec.enabled || state?.pending || state?.runs >= spec.maxRuns || Date.parse(spec.expiresAt) <= now) continue;
        const due = state.nextAt;
        if (!due || Date.parse(due) > now) continue;
        const key = targetKey(spec.target);
        if (busy.has(key) || (state?.lastAt && now - Date.parse(state.lastAt) < (spec.cooldownMs ?? 0))) continue;
        const runId = randomUUID();
        const receipt = { runId, id: spec.id, status: 'intent', startedAt: iso(now), ownerPid: process.pid, ownerHost: hostname(), definition: spec, definitionDigest: `sha256:${createHash('sha256').update(JSON.stringify(spec)).digest('hex')}` };
        // Both intent and budget are durable before any external operation.
        await this.atomic(this.path('runs', runId), receipt);
        await this.atomic(this.path('state', spec.id), { runs: (state?.runs ?? 0) + 1, nextAt: spec.trigger.at ? null : nextDue(spec, now), lastAt: iso(now), pending: runId, targetKey: key });
        busy.add(key);
        selected.push({ spec, receipt });
      }
      return selected;
    });
    return Promise.all(claimed.map(async ({ spec, receipt }) => {
      let result;
      try { result = await execute(spec.target, { timeoutMs: spec.timeoutMs, signal }); }
      catch (error) { result = { status: 'uncertain', error: error.code ?? error.message }; }
      // A failed transport may already have submitted text. Never replay it automatically.
      await this.lock('store', async () => {
        await this.atomic(this.path('runs', receipt.runId), { ...receipt, ...result, finishedAt: iso(Date.now()) });
        const state = await this.read(this.path('state', spec.id));
        if (state?.pending === receipt.runId && result.status !== 'uncertain') {
          delete state.pending;
          await this.atomic(this.path('state', spec.id), state);
        }
      });
      return { ...receipt, ...result };
    }));
  }
}
