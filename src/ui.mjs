import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listTerminals, readTerminal } from './targets.mjs';

/* global UI_PAGE */
// The release bundle inlines the page at build time; source runs read it beside this module.
const page = typeof UI_PAGE === 'string' ? UI_PAGE : await readFile(new URL('./ui.html', import.meta.url), 'utf8');

const limit = 1 << 20;
const body = req => new Promise((resolve, reject) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { data += chunk; if (data.length > limit) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); } });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
  req.on('error', reject);
});

export async function history(store) {
  const files = (await readdir(join(store.root, 'runs'))).filter(n => n.endsWith('.json')).sort();
  return Promise.all(files.map(n => store.read(join(store.root, 'runs', n))));
}

export async function status(store) {
  return { store: store.root, daemon: await store.daemon(), daemonLock: await store.read(join(store.root, 'daemon.lock', 'owner.json')), storeLock: await store.read(join(store.root, 'store.lock', 'owner.json')) };
}

// Terminal targets are registered from the UI; command targets execute arbitrary programs and stay CLI-only.
const terminalSpec = spec => {
  if (spec?.target?.type === 'command') throw Object.assign(new Error('Command targets are registered and edited with the CLI'), { status: 403 });
  return spec;
};

export function createUi(store, { token = randomBytes(24).toString('base64url'), terminals = listTerminals, read = readTerminal } = {}) {
  const expected = Buffer.from(`Bearer ${token}`);
  const routes = {
    'GET /api/schedules': () => store.list(),
    'GET /api/history': () => history(store),
    'GET /api/status': () => status(store),
    'GET /api/terminals': () => terminals(),
    // The screen is context for the person writing the prompt; nothing is sent to the terminal.
    'POST /api/terminals/read': async req => ({ screen: await read((await body(req)).target) }),
    'POST /api/schedules': async req => {
      const spec = terminalSpec(await body(req));
      if (await store.read(store.path('schedules', spec.id))) throw Object.assign(new Error('Schedule id already exists'), { status: 409 });
      return store.put(spec);
    },
    'PUT /api/schedules/:id': async (req, id) => {
      const spec = terminalSpec(await body(req));
      if (spec.id !== id) throw Object.assign(new Error('Schedule id cannot change'), { status: 400 });
      const current = await store.read(store.path('schedules', id));
      if (!current) throw Object.assign(new Error('Schedule not found'), { status: 404 });
      terminalSpec(current);
      return store.put(spec);
    },
    'POST /api/schedules/:id/pause': (req, id) => store.enable(id, false),
    'POST /api/schedules/:id/resume': (req, id) => store.enable(id, true),
    'DELETE /api/schedules/:id': (req, id) => store.remove(id),
  };
  const server = createServer(async (req, res) => {
    const send = (code, value, type = 'application/json') => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'" });
      res.end(type === 'application/json' ? JSON.stringify(value) : value);
    };
    try {
      // Reject rebinding hosts so another site cannot reach this loopback server by name.
      const { port } = server.address();
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return send(421, { error: 'Unexpected host' });
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/') return send(200, page, 'text/html; charset=utf-8');
      // A custom header forces a CORS preflight that this server never approves.
      const auth = Buffer.from(req.headers.authorization ?? '');
      if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: 'Unauthorized' });
      const parts = url.pathname.split('/');
      const id = parts[3] && decodeURIComponent(parts[3]);
      const route = parts[2] === 'schedules' && parts.length > 3 ? ['/api/schedules/:id', ...parts.slice(4)].join('/') : url.pathname;
      const handler = routes[`${req.method} ${route}`];
      if (!handler) return send(404, { error: 'Not found' });
      send(200, await handler(req, id));
    } catch (error) {
      send(error.status ?? 400, { error: error.message });
    }
  });
  return { server, token };
}
