/**
 * Voyage-Editor's web server: the editor page (built from src/editor on start), the assets for it to draw with (the
 * customs folder first, then the assets' own), and the editor's own routes (store.mjs). What you publish is written
 * into the assets' customs folder, where Voyage-Client and Voyage-Server read it.
 */
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ConfigMgr, ConfigException, confDir } from './configmgr.mjs';
import { EditorConfigs } from './editorconfigs.mjs';
import { CustomStore, serveCustom, customRoutes } from './store.mjs';
import { build, BUNDLE } from './build.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SESSION_MS = 12 * 60 * 60 * 1000, LOCK_MS = 60000, TRIES = 5;

try {
  ConfigMgr.load(confDir(process.argv.slice(2)));
} catch (e) {
  if (!(e instanceof ConfigException)) throw e;
  console.error(`Can't start: ${e.message}`);
  process.exit(1);
}
if (ConfigMgr.created) console.log(`Created ${ConfigMgr.files[0]} from ${ConfigMgr.DIST_FILE}`);
for (const f of ConfigMgr.files) console.log(`Loaded config file ${f}`);

const { HOST, PORT, PASSWORD, ASSETS_DIR, DATA_DIR } = EditorConfigs;
if (!fs.existsSync(path.join(ASSETS_DIR, 'Map'))) {
  console.error(`Can't start: ${ASSETS_DIR} is not an assets folder (it has no Map). Set Editor.AssetsDir in conf/editor.conf to the folder the Voyage extractor made.`);
  process.exit(1);
}
const BUILD_ID = await build();
const store = new CustomStore(ASSETS_DIR, DATA_DIR);
try { store.mirror(); } catch (e) { console.error(`The customs folder could not be brought up to date (${e.message})`); }

const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const sessions = new Map(), fails = new Map();
const cookieOf = (req) => /(?:^|;\s*)voyage_editor=([0-9a-f]{64})/.exec(req.headers.cookie || '')?.[1];
const signedIn = (req) => (PASSWORD ? (sessions.get(cookieOf(req)) || 0) > Date.now() : local(req));
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; frame-ancestors 'none'",
  });
  // without a password only the machine itself gets anything at all
  if (!PASSWORD && !local(req)) { res.status(403).type('text').send('The editor has no password set (Editor.Password), so it only answers the machine it runs on.\n'); return; }
  next();
});
// anything that changes something must come from the page itself: a header no other site's form can send
const guard = (req, res, next) => {
  if (!signedIn(req)) { res.status(401).json({ error: 'sign in' }); return; }
  if (req.method !== 'GET' && req.get('X-Voyage-Admin') !== '1') { res.status(403).json({ error: 'not from the editor page' }); return; }
  next();
};
const api = express.Router();
api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
api.use(express.json({ limit: '8mb' }));
api.get('/session', (req, res) => res.json({ in: signedIn(req), password: !!PASSWORD }));
api.post('/login', (req, res) => {
  if (!PASSWORD) { res.json({ in: signedIn(req) }); return; }
  const ip = req.socket.remoteAddress || '', f = fails.get(ip);
  if (f && f.n >= TRIES && Date.now() - f.at < LOCK_MS) { res.status(429).json({ error: 'Too many tries. Wait a minute.' }); return; }
  if (req.get('X-Voyage-Admin') !== '1' || !crypto.timingSafeEqual(digest(req.body?.password ?? ''), digest(PASSWORD))) {
    fails.set(ip, { n: (f && Date.now() - f.at < LOCK_MS ? f.n : 0) + 1, at: Date.now() });
    console.warn(`a wrong password from ${ip.replace(/^::ffff:/, '')}`);
    res.status(401).json({ error: 'Wrong password.' });
    return;
  }
  fails.delete(ip);
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, Date.now() + SESSION_MS);
  for (const [k, until] of sessions) if (until < Date.now()) sessions.delete(k);
  res.set('Set-Cookie', `voyage_editor=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`);
  console.log(`signed in from ${ip.replace(/^::ffff:/, '')}`);
  res.json({ in: true });
});
api.post('/logout', (req, res) => {
  sessions.delete(cookieOf(req));
  res.set('Set-Cookie', 'voyage_editor=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0').json({ in: false });
});
api.get('/info', guard, (req, res) => res.json({ build: BUILD_ID, assets: ASSETS_DIR, customs: store.customs, data: DATA_DIR }));
customRoutes(api, guard, store);
api.use((req, res) => res.status(404).json({ error: 'no such thing' }));
api.use((err, req, res, next) => { res.status(err.status || 500).json({ error: err.expose || err.status ? err.message : 'It went wrong on the server (see its console).' }); if (!err.status) console.error(err); });
app.use('/api', api);

// what the drawing code asks for its settings: no sheets here, every file as it is
app.get('/config.json', (req, res) => res.set('Cache-Control', 'no-store').json({ sheets: false }));
// the page itself (it shows the sign-in until signed in: nothing in it is secret)
app.get(['/', '/index.html'], (req, res) => {
  let html;
  try { html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8'); } catch { res.status(404).end(); return; }
  const v = encodeURIComponent(BUILD_ID);
  res.set('Cache-Control', 'no-store').type('html').send(html.replace('src="/Editor.js"', `src="/Editor.js?v=${v}"`).replace('href="/editor.css"', `href="/editor.css?v=${v}"`));
});
app.get('/Editor.js', (req, res) => res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache').sendFile(BUNDLE));
app.get('/editor.css', (req, res) => res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache').sendFile(path.join(ROOT, 'public', 'editor.css')));
// the assets, to draw with: a signed-in page only. Pictures brought in and what is published first, then the customs
// folder, then the assets' own; each asked again rather than kept, since they change here.
const assetGuard = (req, res, next) => (signedIn(req) ? next() : res.status(401).end());
serveCustom(app, store, assetGuard);
app.use('/assets', assetGuard, express.static(store.customs, { maxAge: 0, dotfiles: 'allow' }));
app.use('/assets', assetGuard, express.static(ASSETS_DIR, { maxAge: 0, fallthrough: false, dotfiles: 'allow' }), (err, req, res, next) => {
  if (err.status !== 404) { next(err); return; }
  res.status(404).end();
});

const server = http.createServer(app);
server.on('error', (e) => { console.error(`Can't listen on ${HOST}:${PORT} (${e.message})`); process.exit(1); });
server.listen(PORT, HOST, () => {
  console.log(`Voyage editor on http://${HOST}:${PORT} (${PASSWORD ? 'sign in with Editor.Password' : 'no password set: this machine only'})`);
  console.log(`Assets: ${ASSETS_DIR}; publishing to ${store.customs}; drafts in ${DATA_DIR}`);
});
