// Networking: one interface, two transports.
//  - ServerTransport: WebSocket to the Node relay (when the page is served by server.js)
//  - PeerTransport: WebRTC via PeerJS, the host's browser runs the Room (static hosting, no server)
import { Room } from './room.js';

// Where the relay server lives: this origin (when server.js serves the page) or window.CATLADY_RELAY (a remote server).
let preferLocal = false; // set when the page itself is served by server.js (local dev, or the Render URL opened directly)
const localBase = () => location.origin + location.pathname.replace(/[^/]*$/, '').replace(/\/$/, '');
export function relayBase() {
  const r = (!preferLocal && typeof window !== 'undefined' && window.CATLADY_RELAY) ? String(window.CATLADY_RELAY).replace(/\/+$/, '') : '';
  return r || localBase();
}
async function ping(base, ms) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(base + '/api/ping', { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
    if (r.ok) { const j = await r.json(); if (j.ok) return true; }
  } catch { /* not there */ }
  return false;
}
// Resolves 'server' or 'p2p'. A remote relay may be asleep (free hosting): keep knocking for a while and report progress.
export async function detectMode(onWait) {
  if (await ping(localBase(), 2500)) { preferLocal = true; return 'server'; }
  const remote = !!(typeof window !== 'undefined' && window.CATLADY_RELAY);
  if (!remote) return 'p2p';
  const deadline = Date.now() + 90000;
  let n = 0;
  while (Date.now() < deadline) {
    if (await ping(relayBase(), 8000)) return 'server';
    if (onWait) onWait(++n);
    await new Promise(r => setTimeout(r, 2000));
  }
  return 'p2p';
}

class Emitter {
  constructor() { this.handlers = {}; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const fn of this.handlers[ev] || []) fn(...a); }
}

export class ServerTransport extends Emitter {
  constructor(code) { super(); this.code = code; this.ws = null; this.closed = false; this.retry = 1000; this.connect(); }
  connect() {
    if (this.closed) return;
    const ws = new WebSocket(relayBase().replace(/^http/, 'ws') + `/ws?room=${this.code}`);
    this.ws = ws;
    ws.onopen = () => { this.retry = 1000; this.emit('status', 'connected'); clearInterval(this.beat); this.beat = setInterval(() => this.send({ type: 'ping' }), 20000); };
    ws.onmessage = e => { try { this.emit('message', JSON.parse(e.data)); } catch { /* ignore */ } };
    ws.onclose = () => { if (this.closed) return; this.emit('status', 'reconnecting'); setTimeout(() => this.connect(), this.retry); this.retry = Math.min(this.retry * 2, 10000); };
    ws.onerror = () => ws.close();
  }
  send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  close() { this.closed = true; clearInterval(this.beat); this.ws?.close(); }
}

const PEER_PREFIX = 'catlady-v1-';
const PEER_OPTS = { debug: 0, config: { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] } };

// The host browser: owns a Room, accepts PeerJS connections, and also talks to the Room locally.
export class PeerHostTransport extends Emitter {
  constructor(code, saved) {
    super();
    this.code = code;
    this.room = new Room(code, saved);
    this.room.onChange = r => { try { localStorage.setItem('catlady:room:' + code, JSON.stringify(r.serialize())); } catch { /* full */ } };
    this.localId = 'local';
    this.room.attach(this.localId, msg => queueMicrotask(() => this.emit('message', msg)));
    this.peer = null; this.closed = false; this.seq = 0;
    this.open();
  }
  open() {
    if (this.closed) return;
    const peer = new Peer(PEER_PREFIX + this.code, PEER_OPTS);
    this.peer = peer;
    peer.on('open', () => this.emit('status', 'connected'));
    peer.on('connection', conn => {
      const id = 'peer' + (++this.seq);
      conn.on('open', () => {
        this.room.attach(id, msg => conn.send(msg));
        conn.on('data', msg => { if (msg && typeof msg === 'object') this.room.handle(id, msg); });
        conn.on('close', () => this.room.detach(id));
        conn.on('error', () => this.room.detach(id));
      });
    });
    peer.on('disconnected', () => { if (!this.closed) { this.emit('status', 'reconnecting'); setTimeout(() => { try { peer.reconnect(); } catch { /* ignore */ } }, 1500); } });
    peer.on('error', err => {
      if (this.closed) return;
      if (err.type === 'unavailable-id') {
        // After a refresh the signalling server may still hold our old id for a moment: retry, then give up.
        this.idRetries = (this.idRetries || 0) + 1;
        if (this.idRetries > 12) { this.emit('status', 'taken'); return; }
      }
      this.emit('status', 'reconnecting');
      setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } this.open(); }, 3000);
    });
    peer.on('open', () => { this.idRetries = 0; });
  }
  send(msg) { this.room.handle(this.localId, msg); }
  close() { this.closed = true; try { this.peer?.destroy(); } catch { /* ignore */ } }
}

// A guest browser: connects to the host's peer id.
export class PeerGuestTransport extends Emitter {
  constructor(code) { super(); this.code = code; this.closed = false; this.conn = null; this.failures = 0; this.open(); }
  open() {
    if (this.closed) return;
    const peer = new Peer(PEER_OPTS);
    this.peer = peer;
    this.emit('status', 'connecting');
    peer.on('open', () => {
      this.emit('status', 'connecting-host');
      const conn = peer.connect(PEER_PREFIX + this.code, { reliable: true });
      this.conn = conn;
      let opened = false;
      conn.on('open', () => { opened = true; this.failures = 0; this.emit('status', 'connected'); });
      conn.on('data', msg => { if (msg && typeof msg === 'object') this.emit('message', msg); });
      conn.on('close', () => this.lost('reconnecting'));
      conn.on('error', () => this.lost('reconnecting'));
      setTimeout(() => { if (!opened && !this.closed) { this.failures++; this.lost(this.failures >= 2 ? 'blocked' : 'reconnecting'); } }, 15000);
    });
    peer.on('error', err => {
      if (this.closed) return;
      if (err.type === 'peer-unavailable') this.lost('waiting-host');
      else this.lost(err.type === 'network' || err.type === 'server-error' ? 'no-signal' : 'reconnecting');
    });
  }
  lost(status) {
    if (this.closed || this.retrying) return;
    this.retrying = true;
    this.emit('status', status);
    try { this.peer?.destroy(); } catch { /* ignore */ }
    setTimeout(() => { this.retrying = false; this.open(); }, status === 'waiting-host' ? 4000 : 3000);
  }
  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
  close() { this.closed = true; try { this.peer?.destroy(); } catch { /* ignore */ } }
}
