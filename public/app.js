import { CARDS, FOOD_TYPES } from './cards.js';
import { LINES, lineSlots, sameLine, catFedInfo, canAssign, lineName, hasPlayable, stillNeeded } from './engine.js';
import { detectMode, relayBase, ServerTransport, PeerHostTransport, PeerGuestTransport } from './net.js';
import { makeCode } from './room.js';
import { artPath, hasArt, probeAll, setArtListener, EXTRA_ART } from './art.js';

const $ = sel => document.querySelector(sel);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FOOD_ICON = { chicken: '🍗', tuna: '🐟', milk: '🥛', wild: '✨' };
const FOOD_LABEL = { chicken: 'chicken', tuna: 'tuna', milk: 'milk', wild: 'wild' };
const TOY_ICON = { mouse: '🐭', yarn: '🧶', feather: '🪶', tower: '🪜', post: '🪵' };
const COSTUME_ICON = { Bunny: '🐰', Pirate: '🏴‍☠️', Superhero: '🦸', 'Alien Suit': '👽', 'Sailor Outfit': '⚓', 'Fancy Suit': '🎩', Crown: '👑', Frog: '🐸', 'Duck Hat': '🦆' };
const COLOR_FILL = { B: '#4a4a52', O: '#f0a030', W: '#f7f2ea' };
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- local session ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
let token = store.get('catlady:token', '');
if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('catlady:token', token); }
let myName = store.get('catlady:name', '');

const ui = { mode: null, code: null, transport: null, status: 'connecting', snap: null, pick: null, showRules: false, drawer: null, lastGrid: null, lastPhase: null, handOpen: true, peek: null, unread: 0, seenChat: 0 };

// ---------- boot ----------
async function boot() {
  probeAll();
  ui.mode = await detectMode(n => { app.innerHTML = `<div class="loading"><div class="bigcat">🐈</div><p>Waking up the game server… (${n * 10}s)</p><p class="tiny muted">Free hosting naps when nobody is playing. This usually takes under a minute.</p></div>`; });
  const code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (/^[A-Z0-9]{5}$/.test(code)) connect(code); else render();
}
window.addEventListener('popstate', () => { ui.transport?.close(); ui.transport = null; ui.snap = null; ui.code = null; boot(); });
setArtListener(() => { if (!ui.artTimer) ui.artTimer = setTimeout(() => { ui.artTimer = null; render({ silent: true }); }, 200); });

function connect(code) {
  ui.code = code; ui.snap = null; ui.status = 'connecting';
  if (ui.mode === 'server') ui.transport = new ServerTransport(code);
  else if (store.get('catlady:host:' + code) === '1') {
    let saved = null; try { saved = JSON.parse(store.get('catlady:room:' + code, 'null')); } catch { /* ignore */ }
    ui.transport = new PeerHostTransport(code, saved);
  } else ui.transport = new PeerGuestTransport(code);
  ui.transport.on('status', s => {
    ui.status = s;
    if (s === 'connected') ui.transport.send({ type: 'hello', token, name: myName });
    if (s === 'taken') toast('This room is already open in another tab or browser on your side. Close it there, or create a new game.', true);
    render();
  });
  ui.transport.on('message', msg => {
    if (msg.type === 'state') { ui.snap = msg; if (ui.pick?.kind === 'spray' && !hasCard(me(), 'spray')) ui.pick = null; render(); }
    else if (msg.type === 'error') toast(msg.message, true);
  });
  render();
}
function send(msg) { ui.transport?.send(msg); }
function act(action) { send({ type: 'action', action }); }
function me() { return ui.snap?.state?.players[ui.snap.you]; }
function hasCard(p, type) { return !!p?.hand?.some(id => CARDS[id].type === type); }

let toastTimer = null;
function toast(text, err = false) {
  const t = $('#toast'); t.textContent = text; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, err ? 4500 : 2500);
}

// ---------- art & cards ----------
function catSvg(colors) {
  const key = colors.join('');
  const fill = colors.length === 1 ? COLOR_FILL[colors[0]] : `url(#g${key})`;
  const stops = colors.map((c, i) => `<stop offset="${(i / colors.length) * 100}%" stop-color="${COLOR_FILL[c]}"/><stop offset="${((i + 1) / colors.length) * 100}%" stop-color="${COLOR_FILL[c]}"/>`).join('');
  return `<svg viewBox="0 0 80 96" aria-hidden="true"><defs><linearGradient id="g${key}" x1="0" x2="1" y1="0" y2="1">${stops}</linearGradient></defs>
  <g fill="${fill}" stroke="#2a2430" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M24 90 C6 90 4 62 16 48 C22 40 32 38 40 40 C48 38 58 40 64 48 C76 62 74 90 56 90 Z"/>
    <path d="M62 84 C74 86 80 78 76 68 C74 62 70 62 68 66 C66 72 70 76 62 80 Z"/>
    <path d="M18 14 L26 30 L54 30 L62 14 L62 40 C62 52 18 52 18 40 Z"/>
    <path d="M18 14 L26 30 M62 14 L54 30" fill="none"/>
  </g>
  <circle cx="31" cy="36" r="2.2" fill="#2a2430"/><circle cx="49" cy="36" r="2.2" fill="#2a2430"/>
  <path d="M37.5 42 L40 44.5 L42.5 42 M40 44.5 V47 M34 50 Q40 54 46 50" fill="none" stroke="#2a2430" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M10 40 L24 42 M10 46 L24 45 M70 40 L56 42 M70 46 L56 45" stroke="#2a2430" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}
const tokenSvg = `<svg viewBox="0 0 64 64" aria-label="cat token"><path d="M14 58 C4 58 4 36 12 30 L12 12 L22 22 L36 22 L46 12 L46 30 C50 34 52 42 52 48 C58 44 62 50 58 56 C56 59 52 59 50 57 C48 58 46 58 44 58 Z" fill="#9a9aa6" stroke="#2a2430" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
const vpHtml = () => hasArt(EXTRA_ART.vp) ? `<img class="vpimg" src="${EXTRA_ART.vp}" alt="2 VP token">` : '<span class="heart">💗</span>';
const tokenHtml = () => `<span class="token" data-fly="token">${hasArt(EXTRA_ART.token) ? `<img src="${EXTRA_ART.token}" alt="cat token">` : tokenSvg}</span>`;
function needHtml(need) { if (!need) return '?'; return FOOD_TYPES.filter(t => need[t]).map(t => `${need[t]} ${FOOD_ICON[t]}`).join(' '); }
function vpLabel(c) { if (c.special === 'mostFed') return '7/3'; return c.vp == null ? '✱' : c.vp; }
function art(card, fallback) { const p = artPath(card); return hasArt(p) ? `<img src="${p}" alt="">` : fallback; }
function cardHtml(id, cls = '', attrs = '') {
  const c = CARDS[id];
  const fly = attrs.includes('data-fly') ? '' : `data-fly="${id}"`;
  const mark = c.minPlayers > 2 ? `<span class="mark">${c.minPlayers === 3 ? '3+' : '4'}</span>` : '';
  const base = `class="card ${c.type} ${cls}" data-id="${id}" ${fly} ${attrs}`;
  if (c.type === 'cat') {
    const tlen = c.text ? (c.text.length > 90 ? 'xlong' : c.text.length > 55 ? 'long' : 'short') : '';
    const nlen = c.name.length > 12 ? 'longname' : '';
    return `<div ${base.replace('class="card cat', `class="card cat ${c.stray ? 'stray' : ''} ${c.text ? 'hastext t-' + tlen : ''} ${nlen}`)} title="${esc(c.name)}${c.text ? ': ' + esc(c.text) : ''}">
      <span class="colors">${c.colors.join('+')}</span>${mark}
      <div class="name">${esc(c.name)}</div>${c.stray ? '<div class="sub">Stray Cat</div>' : ''}
      <div class="vp">${vpLabel(c)}</div>
      <div class="art">${art(c, catSvg(c.colors))}</div>
      ${c.text ? `<div class="txt">${esc(c.text)}</div>` : ''}
      <div class="foot">${needHtml(c.need)}</div></div>`;
  }
  if (c.type === 'food') {
    const icon = c.food === 'wild' ? '🍗🐟🥛' : FOOD_ICON[c.food];
    return `<div ${base.replace('class="card food', `class="card food ${c.food}`)}>${mark}<div class="name">${esc(c.name)}</div><div class="art" style="font-size:${c.food === 'wild' ? 18 : 32}px">${art(c, icon)}</div><div class="foot">${c.amount === 2 ? 'x2 ' : ''}food</div></div>`;
  }
  if (c.type === 'toy') return `<div ${base}>${mark}<div class="name">${esc(c.name)}</div><div class="art">${art(c, TOY_ICON[c.toy])}</div><div class="foot">toy<br><span class="tiny">1/3/5/8/12</span></div></div>`;
  if (c.type === 'costume') return `<div ${base}>${mark}<div class="name">${esc(c.name)}</div><div class="art">${art(c, COSTUME_ICON[c.name] || '🎭')}</div><div class="foot">costume<br><span class="tiny">Most: 6 · None: −2</span></div></div>`;
  if (c.type === 'catnip') return `<div ${base}>${mark}<div class="name">Catnip</div><div class="art">${art(c, '🌿')}</div><div class="foot tiny">1) −2 · 2-3) +1/cat · 4) +2/cat</div></div>`;
  if (c.type === 'spray') return `<div ${base}>${mark}<div class="name">Spray Bottle</div><div class="art">${art(c, '🧴')}</div><div class="foot tiny">Discard to move the cat token</div></div>`;
  if (c.type === 'lost') return `<div ${base}>${mark}<div class="name">Lost Cat</div><div class="art">${art(c, '📋')}</div><div class="foot tiny">Discard 2: 2 VP or a stray cat</div></div>`;
  return '';
}
const cardBack = (cls = '', attrs = '') => `<div class="card back ${cls}" ${attrs}>${hasArt(EXTRA_ART.back) ? `<img src="${EXTRA_ART.back}" alt="">` : '🐈'}</div>`;
function cubesHtml(food, showZero = false) {
  return ['chicken', 'tuna', 'milk', 'wild'].filter(t => showZero || food[t]).map(t => `<span class="f"><span class="cube ${t}"></span>${food[t]} ${FOOD_LABEL[t]}</span>`).join('') || '<span class="muted tiny">no food</span>';
}
function sampleId(type, name) { const c = Object.values(CARDS).find(c => c.type === type && (!name || c.name === name)); return c.id; }
function sortHand(hand) { const order = { toy: 0, costume: 1, catnip: 2, lost: 3, spray: 4 }; return hand.slice().sort((a, b) => (order[CARDS[a].type] - order[CARDS[b].type]) || CARDS[a].name.localeCompare(CARDS[b].name)); }

// ---------- render ----------
function render(opts = {}) {
  const prev = opts.silent ? null : snapshotRects();
  if (!ui.code) renderHome();
  else if (!ui.snap) app.innerHTML = `<div class="loading"><div class="bigcat">🐈</div><p>Room <b>${esc(ui.code)}</b></p><p>${statusText()}</p><p class="tiny muted">Keep this page open. <a href="${esc(location.pathname)}">Back to start</a></p></div>`;
  else if (!ui.snap.state) renderLobby(ui.snap);
  else renderGame(ui.snap);
  if (prev) animateFlights(prev);
  countUp();
  fitTable();
}
function countUp() {
  if (reduceMotion()) return;
  for (const el of app.querySelectorAll('.justnow .countup, .total .countup')) {
    const to = +el.dataset.to; const key = el.closest('tr').className + ':' + to; if (el.dataset.done) continue; el.dataset.done = '1';
    const from = el.closest('.total') && ui.reveal ? (ui.reveal.lastTotals?.[[...el.closest('tr').children].indexOf(el.parentElement)] ?? 0) : 0;
    const t0 = performance.now(); const tick = t => { const k = Math.min(1, (t - t0) / 900); const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); el.textContent = (to > 0 && !el.closest('.total') ? '+' : '') + v; if (k < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  }
  if (ui.reveal) ui.reveal.lastTotals = [...app.querySelectorAll('.total .countup')].map(e => +e.dataset.to);
}

// Scale the tilted table so the whole thing fits the viewport height (no scrolling to find your own cats).
function fitTable() {
  const scene = $('.scene'), table = $('.table'); if (!scene || !table) return;
  table.style.setProperty('--fit', 1);
  if (window.innerWidth <= 760) return;
  const avail = scene.clientHeight - 24;
  const h = table.getBoundingClientRect().height;
  const f = Math.max(0.8, Math.min(1, avail / h));
  table.style.setProperty('--fit', f.toFixed(3));
}
let fitTimer = null;
window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitTable, 120); });
function statusText() {
  return {
    connecting: 'Connecting…', connected: 'Connected', reconnecting: 'Reconnecting…',
    'connecting-host': 'Found the host, opening a direct connection…',
    'waiting-host': 'The host is not online right now. This page keeps trying; ask them to open their game tab.',
    'no-signal': 'Cannot reach the matchmaking server. Check your internet connection; some school or office networks block it.',
    blocked: 'Your two networks are not letting a direct connection through. Still trying… If it keeps failing, try a different Wi-Fi or mobile data on one side, or use the server version of the game.',
    taken: 'Room already open elsewhere',
  }[ui.status] || ui.status;
}
function shareLink() { const u = new URL(location.href); u.search = '?room=' + ui.code; return u.toString(); }
const logoHtml = (cls = '') => hasArt(EXTRA_ART.logo) ? `<img class="logo-img ${cls}" src="${EXTRA_ART.logo}" alt="Cat Lady">` : `<span class="logo ${cls}">Cat Lady</span>`;

function renderHome() {
  app.innerHTML = `
  <div class="home">
    <div class="hero"><h1>${logoHtml()}</h1><div class="fan">${cardHtml(sampleId('cat', 'Sir Cuddleface'), 'sm')}${cardHtml(sampleId('toy'), 'sm')}${cardHtml(sampleId('costume', 'Pirate'), 'sm')}</div></div>
    <p class="sub">The card-drafting game, playable live with someone far away.</p>
    <div class="box"><h2>Your name</h2><input id="name" type="text" maxlength="20" placeholder="e.g. Marie Antoinette" value="${esc(myName)}"></div>
    <div class="box"><h2>Start a new game</h2><p class="muted tiny">You get a link to send to the people you want to play with. 2 to 4 players.</p><button class="primary" data-do="create">Create game</button></div>
    <div class="box"><h2>Join a game</h2><div class="row"><input id="joincode" type="text" maxlength="5" placeholder="Room code" style="text-transform:uppercase"><button data-do="join">Join</button></div></div>
    <p class="tiny muted">Cat Lady is a game by Josh Wood, published by AEG. This fan-made version is for playing with people you love.</p>
  </div>`;
}

function renderLobby(snap) {
  const isHost = snap.you === 0;
  const canStart = isHost && snap.seats.length >= 2;
  app.innerHTML = `
  <div class="lobby">
    <h1>${logoHtml()}</h1>
    <div class="box">
      <h2>Room code <span class="code">${snap.code}</span></h2>
      <p class="tiny muted">Send this link to your fellow cat ladies:</p>
      <div class="row"><div class="link">${esc(shareLink())}</div><button data-do="copy">Copy link</button></div>
      ${ui.mode === 'p2p' && isHost ? '<p class="tiny muted">Keep this tab open: in peer-to-peer mode your browser runs the game. If you refresh, the game is restored.</p>' : ''}
    </div>
    <div class="box">
      <h2>Players (${snap.seats.length}/4)</h2>
      <ul class="seats">${snap.seats.map((s, i) => `<li><span class="dot ${s.connected ? 'on' : ''}"></span> ${esc(s.name)} ${s.host ? '<span class="tiny muted">host</span>' : ''} ${i === snap.you ? '<span class="tiny muted">(you)</span>' : ''}</li>`).join('')}</ul>
      ${snap.you < 0 ? '<p class="muted">The table is full. You are watching.</p>' : ''}
      <div class="row" style="margin-top:10px"><input id="name" type="text" maxlength="20" placeholder="Your name" value="${esc(myName)}"><button data-do="rename">Change name</button></div>
    </div>
    <div class="box">
      ${isHost ? `<div class="row"><label>Who goes first? <select id="first"><option value="random">Whoever has the most cats in real life (pick), or random</option>${snap.seats.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('')}</select></label></div>
        <p class="tiny muted">The player to the right of the starter places the cat token first.</p>
        <button class="primary" data-do="start" ${canStart ? '' : 'disabled'}>Start game</button> ${snap.seats.length < 2 ? '<span class="muted tiny">Waiting for at least one more player…</span>' : ''}`
      : `<p class="muted">Waiting for <b>${esc(snap.seats[0]?.name || 'the host')}</b> to start the game…</p>`}
      ${snap.gamesPlayed ? `<p class="tiny muted">Games played in this room: ${snap.gamesPlayed}</p>` : ''}
      <p><button class="small" data-do="rules">How to play</button> <span class="tiny muted">${statusText()}</span></p>
    </div>
  </div>${rulesModal()}`;
}

// ---------- the table ----------
function renderGame(snap) {
  const st = snap.state; const you = snap.you; const meP = st.players[you];
  const mine = you >= 0;
  const isTurn = mine && st.phase === 'playing' && st.current === you;
  const placing = st.phase === 'placeToken' && st.tokenPlacer === you;
  let status = '';
  if (st.phase === 'placeToken') status = placing ? 'Place the cat token next to a row or column to block it.' : `Waiting for ${esc(st.players[st.tokenPlacer].name)} to place the cat token.`;
  else if (st.phase === 'playing') status = isTurn ? (st.turn.taken ? 'Block a line with your spray bottle, play lost cats, or pass.' : 'Your turn: take a row or column.') : `${esc(st.players[st.current].name)}'s turn.`;
  else if (st.phase === 'feeding') status = mine && !meP.feedingDone ? 'Game over! Feed your cats, then press Done.' : 'Waiting for everyone to finish feeding…';
  else status = 'Final scores';
  if (ui.pick?.kind === 'spray') status = 'Spray bottle: tap the paw where the cat token should go.';
  if (ui.pick?.kind === 'stray') status = 'Choose a stray cat to bring home.';
  const offline = ui.status !== 'connected';
  const others = st.players.map((p, i) => i).filter(i => i !== you);
  const phaseChanged = ui.lastPhase !== st.phase; ui.lastPhase = st.phase;
  if (snap.chat.length > ui.seenChat && ui.drawer !== 'chat') ui.unread = snap.chat.length - ui.seenChat; else { ui.seenChat = snap.chat.length; ui.unread = 0; }

  app.innerHTML = `
  <div class="game3d ${offline ? 'offline' : ''} ${st.phase} ${isTurn || placing ? 'myturn' : ''}">
    <div class="hud">
      ${logoHtml('small')}
      <span class="status ${isTurn || placing ? 'mine' : ''}">${status}</span>
      <span class="tiny muted hud-meta">Room ${snap.code} · turn ${st.turnNumber}</span>
      <button class="small ${ui.drawer === 'log' ? 'on' : ''}" data-do="drawer-log">Log</button>
      <button class="small ${ui.drawer === 'chat' ? 'on' : ''}" data-do="drawer-chat">Chat${ui.unread ? ` <span class="badge">${ui.unread}</span>` : ''}</button>
      <button class="small" data-do="rules">Rules</button>
    </div>
    ${offline ? `<div class="offline-bar">${statusText()} — your moves are paused until the connection is back.</div>` : ''}
    <div class="scene">
      <div class="table ${phaseChanged && !reduceMotion() ? 'enter' : ''}" style="${hasArt(EXTRA_ART.table) ? `background-image:url(${EXTRA_ART.table})` : ''}">
        <div class="zone far">${others.map(i => renderSeat(snap, i)).join('')}</div>
        <div class="zone mid">
          ${st.phase === 'ended' ? renderResults(snap) : st.phase === 'feeding' ? (mine ? renderFeeding(snap) : renderFeedingWatch(snap)) : renderBoard(snap)}
        </div>
        <div class="zone near">${mine ? renderMyArea(snap) : '<div class="nameplate">You are watching this game.</div>'}</div>
      </div>
    </div>
    ${mine ? renderHand(snap) : ''}
    <aside class="drawer ${ui.drawer ? 'open' : ''}">
      <div class="drawer-head"><h3>${ui.drawer === 'chat' ? 'Chat' : 'Game log'}</h3><button class="small" data-do="drawer-close">✕</button></div>
      <div class="log" ${ui.drawer === 'log' ? '' : 'hidden'}>${st.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div>
      <div class="chatwrap" ${ui.drawer === 'chat' ? '' : 'hidden'}>
        <div class="chatlist" id="chatlist">${snap.chat.map(c => `<div><b>${esc(c.from)}:</b> ${esc(c.text)}</div>`).join('') || '<span class="muted tiny">Say hi 💕</span>'}</div>
        <form id="chatform" class="row"><input id="chatinput" type="text" maxlength="300" placeholder="Message…" autocomplete="off"><button class="small" type="submit">Send</button></form>
      </div>
    </aside>
  </div>${rulesModal()}${peekModal()}`;
  const cl = $('#chatlist'); if (cl) cl.scrollTop = cl.scrollHeight;
  if (ui.drawer === 'chat') { const inp = $('#chatinput'); if (inp && ui.chatDraft) inp.value = ui.chatDraft; }
}

function renderSeat(snap, i) {
  const st = snap.state; const p = st.players[i]; const seat = snap.seats[i];
  const showFeeding = st.phase === 'feeding' || st.phase === 'ended';
  const hand = p.hand ? sortHand(p.hand).map(id => cardHtml(id, 'xs')).join('') : Array.from({ length: p.handCount }, (_, k) => cardBack('xs', `data-fly="hand-${i}-${k}"`)).join('');
  return `<div class="seat" data-seat="${i}">
    <div class="nameplate"><span class="dot ${seat?.connected ? 'on' : ''}"></span> ${esc(p.name)} ${st.current === i && st.phase === 'playing' ? '<span class="turnpill">their turn</span>' : ''} ${p.vpTokens ? `<span class="vp-tokens">${vpHtml()}×${p.vpTokens}</span>` : ''} ${showFeeding ? `<span class="tiny muted">${p.feedingDone ? 'done feeding' : 'feeding…'}</span>` : ''}</div>
    <div class="seat-row">
      <div class="tray" data-fly="tray-${i}"><span class="foodrow">${cubesHtml(p.food)}</span></div>
      <div class="cats cards">${p.cats.map(cat => catWithFeeding(cat, p, false, 'xs')).join('') || '<span class="muted tiny">no cats yet</span>'}</div>
      <div class="handfan small">${hand}</div>
      ${renderLastMove(snap, i)}
    </div>
  </div>`;
}

function renderLastMove(snap, seatIndex) {
  const st = snap.state; const lt = st.lastTake;
  if (!lt || lt.player !== seatIndex || st.phase !== 'playing') return '';
  const fresh = ui.lastMoveTurn !== lt.turn; ui.lastMoveTurn = lt.turn;
  return `<div class="lastmove ${fresh ? 'fresh' : ''}"><div class="pilelabel">${lt.player === snap.you ? 'You' : 'They'} took ${lineName(lt.line)}:</div>
    <div class="cards">${lt.cards.map(id => cardHtml(id, 'xs', `data-fly="last-${id}"`)).join('')}</div></div>`;
}

function renderBoard(snap) {
  const st = snap.state; const you = snap.you;
  const pickMode = ui.pick?.kind === 'spray' ? 'spray' : (st.phase === 'placeToken' && st.tokenPlacer === you) ? 'place' : (st.phase === 'playing' && st.current === you && !st.turn.taken) ? 'take' : null;
  const lineBtn = line => {
    const blocked = sameLine(line, st.token);
    const empty = !lineSlots(line).some(s => st.grid[s]);
    const can = pickMode && !blocked && (pickMode !== 'take' || !empty);
    const arrow = line.kind === 'row' ? '▸' : '▾';
    return `<button class="linebtn ${blocked ? 'blocked' : ''} ${can ? 'pick' : ''}" title="${blocked ? 'The cat token blocks this line' : lineName(line)}" data-line="${line.kind}:${line.index}" ${can ? '' : 'disabled'}>${blocked ? tokenHtml() : can ? '🐾' : arrow}</button>`;
  };
  const cells = ['<div></div>'];
  for (let c = 0; c < 3; c++) cells.push(lineBtn({ kind: 'col', index: c }));
  for (let r = 0; r < 3; r++) {
    cells.push(lineBtn({ kind: 'row', index: r }));
    for (let c = 0; c < 3; c++) { const i = r * 3 + c; const id = st.grid[i]; cells.push(`<div class="slot" data-slot="${i}">${id ? cardHtml(id) : '<div class="empty"></div>'}</div>`); }
  }
  ui.lastGrid = st.grid.slice();
  const deckLayers = Math.min(8, Math.ceil(st.deckCount / 8));
  return `<div class="boardwrap">
    <div class="piles">
      <div class="deck" data-fly="deck" style="--layers:${deckLayers}"><div class="stack">${Array.from({ length: Math.max(1, deckLayers) }, () => cardBack()).join('')}</div><div class="pilelabel">Deck · ${st.deckCount}</div></div>
      <div class="discard"><div class="stack">${st.discard.length ? cardHtml(st.discard[st.discard.length - 1], '', 'data-fly="discard-top"') : '<div class="empty card"></div>'}</div><div class="pilelabel">Discard · ${st.discard.length}</div></div>
      <div class="vp-pile">${vpHtml()}<div class="pilelabel">${st.vpTokensLeft} × 2 VP</div></div>
    </div>
    <div class="board">${cells.join('')}</div>
    <div class="strays">
      <div class="pilelabel">Stray cats <span class="tiny muted">(${st.strayDeckCount} more, not drawn)</span></div>
      <div class="cards">${st.strays.map(id => cardHtml(id, 'sm' + (ui.pick?.kind === 'stray' ? ' pickable' : ''), ui.pick?.kind === 'stray' ? `data-stray="${id}"` : '')).join('') || '<span class="muted tiny">All strays have been found.</span>'}</div>
      ${ui.pick?.kind === 'stray' ? '<button class="small" data-do="cancel">Cancel</button>' : ''}
    </div>
  </div>
  ${pickMode === 'take' ? '<div class="hint">Tap a paw to take that whole row or column. The grey cat token marks the line you cannot take.</div>' : ''}
  ${pickMode === 'place' ? '<div class="hint">Tap a paw to put the cat token there. That line cannot be taken on the first turn.</div>' : ''}
  ${pickMode === 'spray' ? '<div class="hint">Tap a paw to move the cat token there. <button class="small" data-do="cancel">Cancel</button></div>' : ''}`;
}

function renderMyArea(snap) {
  const st = snap.state; const you = snap.you; const p = st.players[you];
  const isTurn = st.phase === 'playing' && st.current === you;
  const lostCount = p.hand.filter(id => CARDS[id].type === 'lost').length;
  const canLost = isTurn && lostCount >= 2 && (st.vpTokensLeft > 0 || st.strays.length > 0);
  let actions = '';
  if (st.phase === 'playing' && isTurn) {
    const spray = hasCard(p, 'spray');
    actions = `<div class="actions">
      ${spray ? `<button data-do="spray">🧴 ${st.turn.taken ? 'Block a line for the next player' : 'Move the cat token'}</button>` : ''}
      ${lostCount >= 2 ? `<button data-do="lost-vp" ${canLost && st.vpTokensLeft > 0 ? '' : 'disabled'}>📋📋 → ${vpHtml()} 2 VP token</button><button data-do="lost-stray" ${canLost && st.strays.length > 0 ? '' : 'disabled'}>📋📋 → find a stray cat</button>` : ''}
      ${st.turn.taken ? `<button class="primary" data-do="end">Pass, I'm done</button>` : ''}
    </div>`;
  }
  if (st.phase === 'feeding') actions = `<div class="actions">
      ${p.feedingDone ? `<span class="muted">You are done. </span><button data-do="undone">Change my feeding</button>` : `<button data-do="autofeed">Auto-feed</button><button class="primary" data-do="done">Done feeding ✓</button>`}
      <span class="tiny muted">${st.players.filter(x => x.feedingDone).length}/${st.players.length} done</span></div>`;
  const feeding = st.phase === 'feeding';
  const canAlloc = st.phase === 'playing' && p.cats.length > 0;
  const need = stillNeeded(p); const needStr = FOOD_TYPES.filter(t => need[t]).map(t => `${need[t]} ${FOOD_ICON[t]}`).join('  ');
  return `<div class="myarea you">
    <div class="nameplate"><b>${esc(p.name)}</b> <span class="tiny muted">(you)</span> ${isTurn ? '<span class="turnpill">your turn</span>' : ''} ${p.vpTokens ? `<span class="vp-tokens">${vpHtml()}×${p.vpTokens}</span>` : ''}
      ${canAlloc ? `<button class="small ${ui.alloc ? 'on' : ''}" data-do="alloc-toggle">🍽 ${ui.alloc ? 'Done planning' : 'Plan feeding'}</button>` : ''}</div>
    ${actions}
    <div class="seat-row">
      <div class="tray" data-fly="tray-${you}"><div class="pilelabel">Food${feeding || ui.alloc ? ' unassigned' : ''}</div><span class="foodrow">${cubesHtml(p.food)}</span>
        ${p.cats.length && st.phase !== 'ended' ? `<div class="needline ${needStr ? 'short' : 'ok'}">${needStr ? 'Still need: ' + needStr : 'Every cat can be fed ✓'}</div>` : ''}</div>
      ${feeding ? '' : `<div class="cats cards">${p.cats.map(cat => catWithFeeding(cat, p, !!ui.alloc && st.phase === 'playing')).join('') || '<span class="muted tiny">Your cats will sit here.</span>'}</div>`}
      ${renderLastMove(snap, you)}
    </div>
    ${ui.alloc && st.phase === 'playing' ? '<div class="hint">Planning only: tap +food under a cat to set cubes aside for it, tap a cube to take it back. Nothing is final until the game ends, and you can do this at any time, even on the other player\'s turn.</div>' : ''}
  </div>`;
}

function renderHand(snap) {
  const st = snap.state; const p = st.players[snap.you];
  const hand = sortHand(p.hand); const n = hand.length;
  const counts = {}; for (const id of hand) { const t = CARDS[id].type; counts[t] = (counts[t] || 0) + 1; }
  const summary = Object.entries(counts).map(([t, c]) => `${c} ${t === 'lost' ? 'lost cat' : t === 'spray' ? 'spray bottle' : t}${c > 1 ? 's' : ''}`).join(' · ');
  return `<div class="handtray ${ui.handOpen === false ? 'closed' : ''}">
    <button class="handtoggle" data-do="hand-toggle" aria-expanded="${ui.handOpen !== false}">${ui.handOpen === false ? '▴' : '▾'} Your hand · ${n} card${n === 1 ? '' : 's'} <span class="tiny muted">${n ? summary : 'empty'} · hidden from the others</span></button>
    <div class="handrow">${hand.map(id => `<button class="handcard" data-peek="${id}" aria-label="${esc(CARDS[id].name)}">${cardHtml(id, '', 'data-fly="hand-me-' + id + '"')}</button>`).join('') || '<span class="muted tiny" style="padding:8px 14px">Toys, costumes, catnip, lost cats and spray bottles you take will appear here.</span>'}</div>
  </div>`;
}
function peekModal() {
  if (!ui.peek || !CARDS[ui.peek]) return '';
  const c = CARDS[ui.peek];
  const blurb = { toy: 'Toys stay in your hand. At the end you score per set of different toys: 1, 3, 5, 8 or 12 points for 1 to 5 unique toys, and you may score several sets.',
    costume: 'Costumes stay in your hand. Most costumes at the end: +6 VP (split on ties). No costume at all: −2 VP.',
    catnip: 'Catnip stays in your hand. Exactly one: −2 VP. Two or three: +1 VP per fed cat. Four or more: +2 VP per fed cat.',
    lost: 'On your turn, discard two lost cats to take a 2 VP token or to bring home one of the face-up stray cats.',
    spray: 'On your turn, discard it to move the cat token: unblock a line for yourself before taking, or block the next player after taking.' }[c.type] || c.text || '';
  return `<div class="modal-bg" data-do="peek-close"><div class="peek" onclick="event.stopPropagation()">${cardHtml(ui.peek, 'big', 'data-fly="peek"')}<p>${esc(blurb)}</p><button data-do="peek-close">Close</button></div></div>`;
}

function catWithFeeding(cat, p, editable, size = '') {
  const c = CARDS[cat.cardId];
  const info = catFedInfo(cat, p);
  const anyFood = Object.values(cat.food).some(x => x);
  const status = editable || anyFood || p.feedingDone ? (info.fed ? 'fedok' : 'hungry') : '';
  const chips = ['chicken', 'tuna', 'milk', 'wild'].flatMap(t => Array.from({ length: cat.food[t] }, () => `<span class="chip" ${editable ? `data-unfeed="${cat.cardId}:${t}" title="Take back"` : ''}><span class="cube ${t}"></span></span>`)).join('');
  let btns = '';
  if (editable) btns = `<div class="feedbtns">${['chicken', 'tuna', 'milk', 'wild'].map(t => `<button data-feed="${cat.cardId}:${t}" ${p.food[t] > 0 && canAssign(cat, t) ? '' : 'disabled'} title="Give ${FOOD_LABEL[t]}">+${FOOD_ICON[t]}</button>`).join('')}</div>`;
  let truffle = '';
  if (c.special === 'truffle' && (editable || anyFood) && cat.food.wild > 0) truffle = `<select data-truffle="${cat.cardId}" ${editable ? '' : 'disabled'}>${FOOD_TYPES.map(t => `<option value="${t}" ${cat.truffleType === t ? 'selected' : ''}>as ${FOOD_ICON[t]}</option>`).join('')}</select>`;
  const label = (editable || anyFood || p.feedingDone) ? `<span class="tiny ${info.fed ? 'okline' : 'muted'}">${info.fed ? '✓ fed' : (anyFood ? 'not full yet' : 'hungry −2')}</span>` : '';
  return `<div class="cardwrap">${cardHtml(cat.cardId, `${status} ${size}`)}${label}<div class="chips">${chips}</div>${truffle}${btns}</div>`;
}

function renderFeeding(snap) {
  const st = snap.state; const p = st.players[snap.you];
  let moon = '';
  if (!p.feedingDone && p.cats.some(c => CARDS[c.cardId].special === 'wilds')) {
    moon = `<div class="hint">🌙 Moonbeam: turn up to 2 food into wilds (${2 - p.moonbeamUsed} left):
      ${FOOD_TYPES.map(t => `<button class="small" data-moon="${t}" ${p.moonbeamUsed < 2 && p.food[t] > 0 ? '' : 'disabled'}>${FOOD_ICON[t]}→✨</button>`).join(' ')}
      ${p.moonbeamUsed > 0 && p.food.wild > 0 ? FOOD_TYPES.map(t => `<button class="small" data-moonundo="${t}">✨→${FOOD_ICON[t]}</button>`).join(' ') : ''}</div>`;
  }
  return `<div class="feedmat">
    <div class="pilelabel">Feed your cats <span class="tiny muted">— tap +food under a cat, tap a cube to take it back</span></div>
    ${moon}
    <div class="cards">${p.cats.map(cat => catWithFeeding(cat, p, !p.feedingDone)).join('') || '<span class="muted">You have no cats to feed.</span>'}</div>
  </div>`;
}
function renderFeedingWatch(snap) { return `<div class="feedmat"><div class="pilelabel">The players are feeding their cats…</div></div>`; }

const REVEAL_MS = 2600;
function renderResults(snap) {
  const r = snap.state.results; const you = snap.you;
  const labels = r.players[0].lines.map(l => l.label.replace(/\s*\(.*\)$/, ''));
  const nSteps = labels.length + 2; // intro, one per category, winner
  if (!ui.reveal || ui.reveal.game !== snap.gamesPlayed) ui.reveal = { game: snap.gamesPlayed, step: reduceMotion() ? nSteps - 1 : 0 };
  const step = ui.reveal.step;
  clearTimeout(ui.reveal.timer);
  if (step < nSteps - 1) ui.reveal.timer = setTimeout(() => { ui.reveal.step++; render({ silent: true }); }, step === 0 ? 1800 : REVEAL_MS);
  const shown = Math.min(step, labels.length); // categories revealed so far
  const running = r.players.map(p => p.lines.slice(0, shown).reduce((a, l) => a + l.vp, 0));
  const lead = Math.max(...running);
  const winnerStep = step >= nSteps - 1;
  const head = winnerStep ? (r.winners.length === 1 ? `🏆 ${esc(r.players[r.winners[0]].name)} wins!` : `🤝 It's a tie between ${r.winners.map(i => esc(r.players[i].name)).join(' and ')}!`) : step === 0 ? 'The cats are fed. Let\'s count the points…' : `${labels[shown - 1]}…`;
  const tieNote = winnerStep && r.winners.length === 1 && r.players.filter(p => p.total === r.players[r.winners[0]].total).length > 1 ? `<div class="tiny muted">Tied on points: ${esc(r.players[r.winners[0]].name)} fed more cats.</div>` : '';
  const confetti = winnerStep && !reduceMotion() ? `<div class="confetti" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<span style="--x:${(i / 28) * 100}%;--d:${(i % 7) * .12}s;--r:${(i * 37) % 360}deg">${['💗', '🐾', '✨', '🐈', '🎉'][i % 5]}</span>`).join('')}</div>` : '';
  return `<div class="results ${winnerStep ? 'final' : ''}">
    ${confetti}
    <div class="winner ${winnerStep ? 'big' : ''}">${head}</div>
    <table><thead><tr><th></th>${r.players.map((p, i) => `<th class="n ${winnerStep && r.winners.includes(i) ? 'champ' : ''}">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
      ${labels.map((lab, li) => li < shown ? `<tr class="${li === shown - 1 && !winnerStep ? 'justnow' : ''}"><td>${esc(lab)} <span class="tiny muted">${r.players.map(p => p.lines[li].label.match(/\((.*)\)/)?.[1]).filter(Boolean).length && li > 0 ? '' : ''}</span></td>${r.players.map(p => `<td class="n ${p.lines[li].vp < 0 ? 'neg' : p.lines[li].vp > 0 ? 'pos' : ''}" title="${esc(p.lines[li].label)}"><span class="countup" data-to="${p.lines[li].vp}">${p.lines[li].vp > 0 ? '+' : ''}${p.lines[li].vp}</span></td>`).join('')}</tr>` : `<tr class="pending"><td>${esc(lab)}</td>${r.players.map(() => '<td class="n">?</td>').join('')}</tr>`).join('')}
      <tr class="total"><td>${winnerStep ? 'Total' : 'So far'}</td>${r.players.map((p, i) => `<td class="n ${running[i] === lead && shown > 0 ? 'leading' : ''}"><span class="countup" data-to="${running[i]}">${running[i]}</span></td>`).join('')}</tr>
      ${winnerStep ? `<tr><td class="tiny muted">Fed cats (tiebreaker)</td>${r.players.map(p => `<td class="n tiny muted">${p.fedCount}</td>`).join('')}</tr>` : ''}
    </tbody></table>
    ${tieNote}
    ${winnerStep ? `<details><summary class="tiny">Cat by cat</summary>${r.players.map(p => `<div class="tiny"><b>${esc(p.name)}:</b> ${p.cats.map(c => `${esc(c.name)} ${c.fed ? '' : '(hungry) '}${c.vp >= 0 ? '+' : ''}${c.vp}`).join(', ') || 'no cats'}</div>`).join('')}</details>
      ${you === 0 ? '<p><button class="primary" data-do="again">Play again</button></p>' : '<p class="muted tiny">The host can start a new game.</p>'}`
    : `<p class="actions"><button class="small" data-do="reveal-next">Next ▸</button><button class="small" data-do="reveal-skip">Skip to the winner</button></p>`}
  </div>`;
}

function rulesModal() {
  if (!ui.showRules) return '';
  return `<div class="modal-bg" data-do="closerules"><div class="modal" onclick="event.stopPropagation()"><h2>How to play</h2>
  <ul>
    <li><b>Your turn:</b> take all the cards in one row or column of the 3×3 grid. You cannot take the line the cat token is next to. The token then moves to the line you took, and the line refills from the deck.</li>
    <li><b>Cats</b> sit in front of you. At the end you must feed each one the food shown on its card, or lose 2 VP. Fed cats score their number.</li>
    <li><b>Food</b> cards give you a cube of that type (x2 cards give two). Wild cubes count as any food. The player with the most leftover food at the end loses 2 VP.</li>
    <li><b>Toys, costumes and catnip</b> stay in your hand. Toys score per set of different toys: 1/3/5/8/12 for 1–5 unique toys, and you can score several sets. Most costumes: +6 VP (split on ties); no costume: −2. Catnip: exactly one is −2; two or three give +1 per fed cat; four or more give +2 per fed cat.</li>
    <li><b>Lost cats:</b> on your turn discard two of them to take a 2 VP token or one of the three stray cats (they have special powers and must also be fed).</li>
    <li><b>Spray bottle:</b> on your turn discard it to move the cat token anywhere: before you take, to unblock a line for yourself, or after you take, to block the next player.</li>
    <li><b>Game end:</b> when a line needs refilling and the deck is empty. Then feed your cats and score. Ties go to whoever fed the most cats.</li>
  </ul><button data-do="closerules">Close</button></div></div>`;
}

// ---------- flight animations (FLIP with screen-space ghosts) ----------
function snapshotRects() {
  const m = new Map();
  for (const el of app.querySelectorAll('[data-fly]')) { const r = el.getBoundingClientRect(); if (r.width) m.set(el.dataset.fly, { r, html: el.outerHTML, cls: el.className, zone: zoneOf(el) }); }
  return m;
}
const zoneOf = el => { const z = el.closest('.slot,.seat,.myarea,.strays,.lastmove,.handrow,.discard,.feedmat,.board'); return z ? (z.classList.contains('seat') ? 'seat' + z.dataset.seat : z.className.split(' ')[0]) : 'page'; };
function animateFlights(prev) {
  if (reduceMotion() || !prev.size) return;
  const layer = document.createElement('div'); layer.className = 'flightlayer'; document.body.appendChild(layer);
  const now = new Map();
  for (const el of app.querySelectorAll('[data-fly]')) { const r = el.getBoundingClientRect(); if (r.width) now.set(el.dataset.fly, { el, r, zone: zoneOf(el) }); }
  const deck = now.get('deck')?.r || prev.get('deck')?.r;
  let delay = 0; let any = false;
  const fly = (fromR, toR, html, opts = {}) => {
    const g = document.createElement('div'); g.className = 'ghost'; g.innerHTML = html;
    const inner = g.firstElementChild; if (inner) { inner.style.width = '100%'; inner.style.height = '100%'; inner.removeAttribute('data-fly'); }
    Object.assign(g.style, { left: fromR.left + 'px', top: fromR.top + 'px', width: fromR.width + 'px', height: fromR.height + 'px' });
    layer.appendChild(g);
    const dx = toR.left - fromR.left, dy = toR.top - fromR.top, sx = toR.width / fromR.width, sy = toR.height / fromR.height;
    const frames = opts.flip
      ? [{ transform: 'translate(0,0) rotateY(180deg) scale(1)', opacity: 1 }, { transform: `translate(${dx * .6}px,${dy * .6 - 40}px) rotateY(90deg) scale(${(1 + sx) / 2},${(1 + sy) / 2})`, opacity: 1, offset: .5 }, { transform: `translate(${dx}px,${dy}px) rotateY(0deg) scale(${sx},${sy})`, opacity: 1 }]
      : [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * .5}px,${dy * .5 - 60}px) scale(${(1 + sx) / 2 * 1.15},${(1 + sy) / 2 * 1.15})`, opacity: 1, offset: .5 }, { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: opts.fade ? 0 : 1 }];
    const anim = g.animate(frames, { duration: opts.duration || 650, delay: opts.delay || 0, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' });
    any = true;
    return anim.finished.then(() => g.remove()).catch(() => g.remove());
  };
  const hide = (el, ms) => { el.style.visibility = 'hidden'; setTimeout(() => { el.style.visibility = ''; }, ms); };
  const isCard = k => /^(cat|food|toy|costume|catnip|spray|lost)-\d+$/.test(k) || k.startsWith('hand-me-');
  for (const [k, cur] of now) {
    const old = prev.get(k);
    if (old) {
      const moved = Math.abs(old.r.left - cur.r.left) > 4 || Math.abs(old.r.top - cur.r.top) > 4;
      const changedZone = old.zone !== cur.zone;
      if (moved && ((isCard(k) && changedZone) || k === 'token')) { hide(cur.el, 700); fly(old.r, cur.r, old.html, { duration: k === 'token' ? 500 : 700 }); }
    } else if (isCard(k) && cur.el.closest('.slot') && deck) {
      hide(cur.el, 560 + delay); fly(deck, cur.r, cardBack(), { flip: true, duration: 560, delay }); delay += 90;
    }
  }
  // Food cards that were taken vanish into the taker's tray.
  for (const [k, old] of prev) {
    if (!now.has(k) && k.startsWith('food-') && old.cls.includes('card')) {
      const st = ui.snap?.state; const taker = st?.log?.length ? st.players.findIndex(p => st.log[st.log.length - 1].startsWith(p.name + ' took') || (st.log.length > 1 && st.log[st.log.length - 2].startsWith(p.name + ' took'))) : -1;
      const tray = now.get('tray-' + (taker >= 0 ? taker : (ui.snap?.you ?? 0)))?.r;
      if (tray) fly(old.r, { left: tray.left + tray.width / 2 - 20, top: tray.top + tray.height / 2 - 28, width: 40, height: 56 }, old.html, { fade: true, duration: 600 });
    }
  }
  if (any) setTimeout(() => layer.remove(), 1600); else layer.remove();
  // Count-up on totals

}

// ---------- events ----------
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-do],[data-line],[data-stray],[data-feed],[data-unfeed],[data-moon],[data-moonundo],[data-peek]');
  if (!t) return;
  const d = t.dataset;
  if (d.peek) { ui.peek = d.peek; render({ silent: true }); return; }
  if (d.line) {
    const [kind, index] = d.line.split(':'); const line = { kind, index: Number(index) };
    const st = ui.snap.state;
    if (ui.pick?.kind === 'spray') { ui.pick = null; act({ type: 'spray', ...line }); }
    else if (st.phase === 'placeToken') act({ type: 'placeToken', ...line });
    else act({ type: 'take', ...line });
    return;
  }
  if (d.stray) { ui.pick = null; act({ type: 'lostCats', choice: 'stray', cardId: d.stray }); return; }
  if (d.feed) { const [cardId, food] = d.feed.split(':'); act({ type: 'feed', cardId, food }); return; }
  if (d.unfeed) { const [cardId, food] = d.unfeed.split(':'); act({ type: 'unfeed', cardId, food }); return; }
  if (d.moon) { act({ type: 'moonbeam', food: d.moon }); return; }
  if (d.moonundo) { act({ type: 'moonbeam', food: d.moonundo, undo: true }); return; }
  switch (d.do) {
    case 'create': {
      saveName(); if (!myName) return toast('Please enter your name first.', true);
      let code;
      if (ui.mode === 'server') { try { code = (await (await fetch(relayBase() + '/api/new')).json()).code; } catch { return toast('Could not reach the server.', true); } }
      else { code = makeCode(); store.set('catlady:host:' + code, '1'); }
      history.pushState({}, '', '?room=' + code); connect(code); break;
    }
    case 'join': {
      saveName(); if (!myName) return toast('Please enter your name first.', true);
      const code = ($('#joincode').value || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{5}$/.test(code)) return toast('Room codes are 5 letters or numbers.', true);
      history.pushState({}, '', '?room=' + code); connect(code); break;
    }
    case 'copy': try { await navigator.clipboard.writeText(shareLink()); toast('Link copied!'); } catch { toast('Copy failed. Select the link and copy it by hand.', true); } break;
    case 'rename': saveName(); send({ type: 'rename', name: myName }); toast('Name updated.'); break;
    case 'start': { const v = $('#first')?.value; send({ type: 'start', startingPlayer: v === 'random' || v == null ? null : Number(v) }); break; }
    case 'again': send({ type: 'newGame' }); break;
    case 'spray': ui.pick = { kind: 'spray' }; render({ silent: true }); break;
    case 'lost-vp': act({ type: 'lostCats', choice: 'vp' }); break;
    case 'lost-stray': ui.pick = { kind: 'stray' }; render({ silent: true }); break;
    case 'cancel': ui.pick = null; render({ silent: true }); break;
    case 'end': act({ type: 'endTurn' }); break;
    case 'autofeed': act({ type: 'autoFeed' }); break;
    case 'done': act({ type: 'feedingDone' }); break;
    case 'undone': act({ type: 'feedingDone', undo: true }); break;
    case 'rules': ui.showRules = true; render({ silent: true }); break;
    case 'closerules': ui.showRules = false; render({ silent: true }); break;
    case 'drawer-log': ui.drawer = ui.drawer === 'log' ? null : 'log'; render({ silent: true }); break;
    case 'drawer-chat': ui.drawer = ui.drawer === 'chat' ? null : 'chat'; render({ silent: true }); $('#chatinput')?.focus(); break;
    case 'drawer-close': ui.drawer = null; render({ silent: true }); break;
    case 'hand-toggle': ui.handOpen = ui.handOpen === false; render({ silent: true }); break;
    case 'alloc-toggle': ui.alloc = !ui.alloc; render({ silent: true }); break;
    case 'reveal-next': if (ui.reveal) { ui.reveal.step++; render({ silent: true }); } break;
    case 'reveal-skip': if (ui.reveal) { ui.reveal.step = 99; render({ silent: true }); } break;
    case 'peek-close': ui.peek = null; render({ silent: true }); break;
  }
});
app.addEventListener('change', e => {
  const sel = e.target.closest('[data-truffle]');
  if (sel) act({ type: 'truffleType', cardId: sel.dataset.truffle, food: sel.value });
});
app.addEventListener('input', e => { if (e.target.id === 'chatinput') ui.chatDraft = e.target.value; });
app.addEventListener('submit', e => {
  if (e.target.id !== 'chatform') return;
  e.preventDefault();
  const input = $('#chatinput'); const text = input.value.trim(); if (!text) return;
  send({ type: 'chat', text }); input.value = ''; ui.chatDraft = '';
});
app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'joincode') $('[data-do=join]')?.click(); if (e.key === 'Enter' && e.target.id === 'name' && !ui.code) $('[data-do=create]')?.click(); });
function saveName() { const el = $('#name'); if (el) { myName = el.value.trim().slice(0, 20); store.set('catlady:name', myName); } }
window.addEventListener('beforeunload', e => { if (ui.mode === 'p2p' && ui.transport instanceof PeerHostTransport && ui.snap?.state && ui.snap.state.phase !== 'ended') { e.preventDefault(); e.returnValue = ''; } });

boot();
