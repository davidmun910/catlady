// Networking: one interface, two transports.
//  - ServerTransport: WebSocket to the Node relay (when the page is served by server.js)
//  - PeerTransport: WebRTC via PeerJS, the host's browser runs the Room (static hosting, no server)
import { Room } from './room.js';

export async function detectMode() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch('api/ping', { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
    if (r.ok) { const j = await r.json(); if (j.ok) return 'server'; }
  } catch { /* static hosting */ }
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
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = location.pathname.replace(/[^/]*$/, '');
    const ws = new WebSocket(`${proto}//${location.host}${base}ws?room=${this.code}`);
    this.ws = ws;
    ws.onopen = () => { this.retry = 1000; this.emit('status', 'connected'); };
    ws.onmessage = e => { try { this.emit('message', JSON.parse(e.data)); } catch { /* ignore */ } };
    ws.onclose = () => { if (this.closed) return; this.emit('status', 'reconnecting'); setTimeout(() => this.connect(), this.retry); this.retry = Math.min(this.retry * 2, 10000); };
    ws.onerror = () => ws.close();
  }
  send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  close() { this.closed = true; this.ws?.close(); }
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
  constructor(code) { super(); this.code = code; this.closed = false; this.conn = null; this.open(); }
  open() {
    if (this.closed) return;
    const peer = new Peer(PEER_OPTS);
    this.peer = peer;
    peer.on('open', () => {
      const conn = peer.connect(PEER_PREFIX + this.code, { reliable: true });
      this.conn = conn;
      let opened = false;
      conn.on('open', () => { opened = true; this.emit('status', 'connected'); });
      conn.on('data', msg => { if (msg && typeof msg === 'object') this.emit('message', msg); });
      conn.on('close', () => this.lost());
      conn.on('error', () => this.lost());
      setTimeout(() => { if (!opened && !this.closed) this.lost(); }, 8000);
    });
    peer.on('error', err => { if (!this.closed) { this.emit('status', err.type === 'peer-unavailable' ? 'waiting-host' : 'reconnecting'); this.lost(); } });
  }
  lost() {
    if (this.closed || this.retrying) return;
    this.retrying = true;
    this.emit('status', 'reconnecting');
    try { this.peer?.destroy(); } catch { /* ignore */ }
    setTimeout(() => { this.retrying = false; this.open(); }, 3000);
  }
  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
  close() { this.closed = true; try { this.peer?.destroy(); } catch { /* ignore */ } }
}
