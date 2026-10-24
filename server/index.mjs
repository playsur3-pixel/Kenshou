import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GameStore, GameError } from './game.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dictionaries = {};
for (const [key, file] of [['easy', 'facile'], ['medium', 'moyen'], ['hard', 'difficile']]) {
  dictionaries[key] = (await readFile(path.join(root, 'src', 'words', `${file}.txt`), 'utf8')).split(/\r?\n/).map(w => w.trim()).filter(Boolean);
}
export const store = new GameStore(dictionaries);
const clients = new Map(), rateBuckets = new Map();
const headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" };
const json = (res, status, data) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
function send(room, player, res) { if (!res.writableEnded) res.write(`data: ${JSON.stringify(store.view(room, player))}\n\n`); }
function broadcast(room) { for (const [token, streams] of clients) { const player = room.players.find(p => p.token === token); if (player) for (const stream of streams) send(room, player, stream); } }
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new GameError('Requête trop volumineuse.', 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new GameError('Le contenu de la requête est invalide.'); }
}
function rate(req) {
  const key = req.socket.remoteAddress, now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.at >= 10000) { bucket = { at: now, count: 0 }; rateBuckets.set(key, bucket); }
  if (++bucket.count > 180) throw new GameError('Trop de requêtes. Patientez quelques secondes.', 429);
}
export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, app: 'kenshou' });
    if (url.pathname.startsWith('/api/')) {
      rate(req);
      // Les clients sont servis par la même origine ; aucun accès CORS externe.
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) throw new GameError('Origine non autorisée.', 403);
      if (req.method === 'POST' && url.pathname === '/api/rooms') { const data = await body(req); return json(res, 201, store.create(data.name, data.rules)); }
      if (req.method === 'POST' && url.pathname === '/api/join') { const data = await body(req); const result = store.join(data.room, data.name); broadcast(store.get(data.room)); return json(res, 200, result); }
      const room = store.get(url.searchParams.get('room'));
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      const player = store.auth(room, token);
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.flushHeaders(); res.write('retry: 1500\n\n');
        if (!clients.has(token)) clients.set(token, new Set()); clients.get(token).add(res);
        store.connect(room, player, true); broadcast(room);
        req.on('close', () => { const streams = clients.get(token); streams?.delete(res); if (!streams?.size) { clients.delete(token); if (room.players.includes(player)) { store.connect(room, player, false); broadcast(room); } } });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/action') {
        const data = await body(req); if (store.tickRoom(room)) broadcast(room); store.action(room, player, data.type, data.data); broadcast(room);
        if (data.type === 'leave') { for (const stream of clients.get(token) ?? []) stream.end(); clients.delete(token); }
        return json(res, 200, { ok: true, app: 'kenshou' });
      }
      throw new GameError('Route introuvable.', 404);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new GameError('Méthode non autorisée.', 405);
    const file = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/hooks/useRoom.js': 'hooks/useRoom.js', '/hooks/useTimer.js': 'hooks/useTimer.js', '/hooks/useSound.js': 'hooks/useSound.js', '/favicon.svg': 'favicon.svg' }[url.pathname];
    if (!file) throw new GameError('Page introuvable.', 404);
    const content = await readFile(path.join(root, 'public', file));
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)];
    res.writeHead(200, { ...headers, 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) { if (!res.headersSent) json(res, error.status ?? 500, { error: error instanceof GameError ? error.message : 'Une erreur serveur est survenue.' }); else res.end(); if (!(error instanceof GameError)) console.error(error); }
});
const tick = setInterval(() => { for (const room of store.rooms.values()) if (store.tickRoom(room)) broadcast(room); }, 100);
const heartbeat = setInterval(() => { for (const streams of clients.values()) for (const res of streams) res.write(': heartbeat\n\n'); store.cleanup(); for (const [ip, bucket] of rateBuckets) if (Date.now() - bucket.at > 60000) rateBuckets.delete(ip); }, 15000);
server.on('close', () => { clearInterval(tick); clearInterval(heartbeat); });
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Le port ${process.env.PORT ?? 3000} est deja utilise. Relancez avec Lancer Kenshou.cmd : il ouvrira le jeu si Kenshou est deja actif.`);
  } else {
    console.error(`Impossible de demarrer Kenshou : ${error.message}`);
  }
  process.exit(1);
});
server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0', () => console.log(`Kenshou prêt : http://localhost:${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const streams of clients.values()) for (const res of streams) res.end(); server.close(); });
