// A game room: seats, connections, chat and the authoritative game state.
// Used unchanged by the Node server (WebSocket rooms) and by the browser host (WebRTC rooms).
import { newGame, applyAction, redact, RuleError } from './engine.js';

export const MAX_SEATS = 4;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(rand = Math.random) { let s = ''; for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)]; return s; }

export class Room {
  constructor(code, saved = null) {
    this.code = code;
    this.seats = [];      // [{token, name}]
    this.state = null;    // engine state or null while in the lobby
    this.chat = [];
    this.gamesPlayed = 0;
    this.conns = new Map(); // connId -> {send, token}
    this.onChange = null;   // optional persistence hook
    if (saved) Object.assign(this, { seats: saved.seats, state: saved.state, chat: saved.chat || [], gamesPlayed: saved.gamesPlayed || 0 });
  }
  serialize() { return { code: this.code, seats: this.seats, state: this.state, chat: this.chat, gamesPlayed: this.gamesPlayed }; }

  attach(connId, send) { this.conns.set(connId, { send, token: null }); }
  detach(connId) { this.conns.delete(connId); this.broadcast(); }
  seatOf(token) { return this.seats.findIndex(s => s.token === token); }
  isConnected(token) { for (const c of this.conns.values()) if (c.token === token) return true; return false; }

  handle(connId, msg) {
    const conn = this.conns.get(connId);
    if (!conn) return;
    try {
      switch (msg.type) {
        case 'hello': return this.hello(conn, msg);
        case 'start': return this.start(conn, msg);
        case 'action': return this.action(conn, msg);
        case 'chat': return this.say(conn, msg);
        case 'newGame': return this.newGameRequest(conn);
        case 'rename': return this.rename(conn, msg);
        default: throw new RuleError('Unknown message.');
      }
    } catch (e) {
      if (e instanceof RuleError) conn.send({ type: 'error', message: e.message });
      else { console.error(e); conn.send({ type: 'error', message: 'Something went wrong: ' + e.message }); }
    }
  }
  hello(conn, msg) {
    const token = String(msg.token || '').slice(0, 64);
    const name = cleanName(msg.name);
    if (!token) throw new RuleError('Missing token.');
    let seat = this.seatOf(token);
    if (seat < 0 && !this.state && this.seats.length < MAX_SEATS) { this.seats.push({ token, name: name || `Player ${this.seats.length + 1}` }); seat = this.seats.length - 1; }
    else if (seat >= 0 && name) this.seats[seat].name = name;
    conn.token = token;
    if (seat >= 0 && this.state) this.state.players[seat].name = this.seats[seat].name;
    this.broadcast();
  }
  rename(conn, msg) {
    const seat = this.seatOf(conn.token); if (seat < 0) return;
    const name = cleanName(msg.name); if (!name) return;
    this.seats[seat].name = name; if (this.state) this.state.players[seat].name = name;
    this.broadcast();
  }
  start(conn, msg) {
    const seat = this.seatOf(conn.token);
    if (seat !== 0) throw new RuleError('Only the host can start the game.');
    if (this.state && this.state.phase !== 'ended') throw new RuleError('A game is already running.');
    if (this.seats.length < 2) throw new RuleError('You need at least 2 players.');
    let starting = Number.isInteger(msg.startingPlayer) ? msg.startingPlayer : Math.floor(Math.random() * this.seats.length);
    if (starting < 0 || starting >= this.seats.length) starting = 0;
    this.state = newGame({ players: this.seats.map(s => ({ id: s.token, name: s.name })), startingPlayer: starting });
    this.gamesPlayed++;
    this.state.log.unshift(`Game ${this.gamesPlayed} begins. ${this.seats[starting].name} is the starting player.`);
    this.broadcast();
  }
  action(conn, msg) {
    if (!this.state) throw new RuleError('The game has not started.');
    const seat = this.seatOf(conn.token);
    if (seat < 0) throw new RuleError('You are watching this game, not playing.');
    this.state = applyAction(this.state, seat, msg.action || {});
    this.broadcast();
  }
  say(conn, msg) {
    const seat = this.seatOf(conn.token);
    const text = String(msg.text || '').trim().slice(0, 300);
    if (!text) return;
    this.chat.push({ from: seat >= 0 ? this.seats[seat].name : 'Spectator', text, at: Date.now() });
    if (this.chat.length > 100) this.chat.shift();
    this.broadcast();
  }
  newGameRequest(conn) {
    const seat = this.seatOf(conn.token);
    if (seat !== 0) throw new RuleError('Only the host can start a new game.');
    if (this.state && this.state.phase !== 'ended') throw new RuleError('Finish this game first.');
    this.state = null;
    this.broadcast();
  }
  snapshotFor(token) {
    const seat = this.seatOf(token);
    return {
      type: 'state', code: this.code, you: seat, gamesPlayed: this.gamesPlayed,
      seats: this.seats.map((s, i) => ({ name: s.name, connected: this.isConnected(s.token), host: i === 0 })),
      state: this.state ? redact(this.state, seat) : null,
      chat: this.chat.slice(-50),
    };
  }
  broadcast() {
    for (const c of this.conns.values()) if (c.token) { try { c.send(this.snapshotFor(c.token)); } catch (e) { /* dead connection */ } }
    if (this.onChange) this.onChange(this);
  }
}
function cleanName(n) { return String(n || '').replace(/\s+/g, ' ').trim().slice(0, 20); }
