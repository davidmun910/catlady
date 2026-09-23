// Cat Lady relay server: serves the static game and hosts WebSocket game rooms.
// Run: npm start  (PORT env var optional). Rooms are kept in memory and mirrored to data/rooms.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, makeCode } from './public/room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const rooms = new Map();
try { const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'rooms.json'), 'utf8')); for (const r of saved) rooms.set(r.code, new Room(r.code, r)); console.log(`Restored ${rooms.size} room(s).`); } catch { /* fresh start */ }
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'rooms.json'), JSON.stringify([...rooms.values()].map(r => r.serialize()))); } catch (e) { console.error('save failed', e.message); }
  }, 500);
}
function getRoom(code, create) {
  let r = rooms.get(code);
  if (!r && create) { r = new Room(code); r.onChange = scheduleSave; rooms.set(code, r); }
  return r;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (url.pathname === '/api/ping') { res.writeHead(200, cors); return res.end(JSON.stringify({ ok: true, mode: 'server' })); }
  if (url.pathname === '/api/new') {
    let code; do code = makeCode(); while (rooms.has(code));
    getRoom(code, true); res.writeHead(200, cors); return res.end(JSON.stringify({ code }));
  }
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
let connSeq = 0;
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const code = String(url.searchParams.get('room') || '').toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) return ws.close(4000, 'bad room');
  const room = getRoom(code, true);
  const id = ++connSeq;
  room.attach(id, msg => ws.send(JSON.stringify(msg)));
  ws.on('message', data => { let msg; try { msg = JSON.parse(data); } catch { return; } room.handle(id, msg); });
  ws.on('close', () => room.detach(id));
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); } }, 30000);

server.listen(PORT, () => console.log(`Cat Lady is running on http://localhost:${PORT}`));
