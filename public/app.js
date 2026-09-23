import { CARDS, FOOD_TYPES, TOY_TYPES } from './cards.js';
import { LINES, lineSlots, sameLine, availableLines, catFedInfo, canAssign, lineName } from './engine.js';
import { detectMode, relayBase, ServerTransport, PeerHostTransport, PeerGuestTransport } from './net.js';
import { makeCode } from './room.js';

const $ = sel => document.querySelector(sel);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FOOD_ICON = { chicken: '🍗', tuna: '🐟', milk: '🥛', wild: '✨' };
const FOOD_LABEL = { chicken: 'chicken', tuna: 'tuna', milk: 'milk', wild: 'wild' };
const TOY_ICON = { mouse: '🐭', yarn: '🧶', feather: '🪶', tower: '🪜', post: '🪵' };
const COSTUME_ICON = { Bunny: '🐰', Pirate: '🏴‍☠️', Superhero: '🦸', 'Alien Suit': '👽', 'Sailor Outfit': '⚓', 'Fancy Suit': '🎩', Crown: '👑', Frog: '🐸', 'Duck Hat': '🦆' };
const COLOR_FILL = { B: '#4a4a52', O: '#f0a030', W: '#f7f2ea' };

// ---------- local session ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
let token = store.get('catlady:token', '');
if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('catlady:token', token); }
let myName = store.get('catlady:name', '');

const ui = { mode: null, code: null, transport: null, status: 'connecting', snap: null, pick: null, showRules: false, lastLogLen: 0 };

// ---------- boot ----------
async function boot() {
  ui.mode = await detectMode(n => { app.innerHTML = `<div class="loading"><div style="font-size:22px">🐈</div><p>Waking up the game server… (${n * 10}s)</p><p class="tiny muted">Free hosting naps when nobody is playing. This usually takes under a minute.</p></div>`; });
  const code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (/^[A-Z0-9]{5}$/.test(code)) connect(code); else renderHome();
}
window.addEventListener('popstate', () => { ui.transport?.close(); ui.transport = null; ui.snap = null; boot(); });

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
    if (msg.type === 'state') { ui.snap = msg; if (ui.pick && ui.pick.kind === 'spray' && !hasCard(me(), 'spray')) ui.pick = null; render(); }
    else if (msg.type === 'error') toast(msg.message, true);
    else if (msg.type === 'pong') { /* heartbeat */ }
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

// ---------- home ----------
function renderHome() {
  app.innerHTML = `
  <div class="home">
    <div class="hero"><div><h1 class="logo">Cat Lady</h1></div><div class="fan">${cardHtml(sampleId('cat', 'Sir Cuddleface'), 'sm')}${cardHtml(sampleId('toy'), 'sm')}${cardHtml(sampleId('costume', 'Pirate'), 'sm')}</div></div>
    <div class="sub">The card-drafting game, playable live with someone far away. ${ui.mode === 'server' ? '' : '<span class="tiny">(Peer-to-peer mode: the game lives in the creator\'s browser tab.)</span>'}</div>
    <div class="box">
      <h2>Your name</h2>
      <input id="name" type="text" maxlength="20" placeholder="e.g. Marie Antoinette" value="${esc(myName)}">
    </div>
    <div class="box">
      <h2>Start a new game</h2>
      <p class="muted tiny">You get a link to send to the people you want to play with. 2 to 4 players.</p>
      <button class="primary" data-do="create">Create game</button>
    </div>
    <div class="box">
      <h2>Join a game</h2>
      <div class="row"><input id="joincode" type="text" maxlength="5" placeholder="Room code" style="text-transform:uppercase"><button data-do="join">Join</button></div>
    </div>
    <p class="tiny muted">Cat Lady is a game by Josh Wood, published by AEG. This fan-made version is for playing with people you love.</p>
  </div>`;
}

// ---------- shared bits ----------
function sampleId(type, name) { const c = Object.values(CARDS).find(c => c.type === type && (!name || c.name === name)); return c.id; }
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
function needHtml(need) {
  if (!need) return '?';
  return FOOD_TYPES.filter(t => need[t]).map(t => `${need[t]} ${FOOD_ICON[t]}`).join(' ');
}
function vpLabel(c) { if (c.special === 'mostFed') return '7/3'; return c.vp == null ? '✱' : c.vp; }
function cardHtml(id, cls = '', attrs = '') {
  const c = CARDS[id];
  const mark = c.minPlayers > 2 ? `<span class="mark">${c.minPlayers === 3 ? '3+' : '4'}</span>` : '';
  if (c.type === 'cat') {
    return `<div class="card cat ${c.stray ? 'stray' : ''} ${c.text ? 'hastext' : ''} ${cls}" data-id="${id}" title="${esc(c.name)}${c.text ? ': ' + esc(c.text) : ''}" ${attrs}>
      <span class="colors">${c.colors.join('+')}</span>${mark}
      <div class="name">${esc(c.name)}</div>${c.stray ? '<div class="sub">Stray Cat</div>' : ''}
      <div class="vp">${vpLabel(c)}</div>
      <div class="art">${catSvg(c.colors)}</div>
      ${c.text ? `<div class="txt">${esc(c.text)}</div>` : ''}
      <div class="foot">${needHtml(c.need)}</div></div>`;
  }
  if (c.type === 'food') {
    const icon = c.food === 'wild' ? '🍗🐟🥛' : FOOD_ICON[c.food];
    return `<div class="card food ${c.food} ${cls}" data-id="${id}" ${attrs}>${mark}<div class="name">${esc(c.name)}</div><div class="art" style="font-size:${c.food === 'wild' ? 18 : 30}px">${icon}</div><div class="foot">${c.amount === 2 ? 'x2 ' : ''}food</div></div>`;
  }
  if (c.type === 'toy') return `<div class="card toy ${cls}" data-id="${id}" ${attrs}>${mark}<div class="name">${esc(c.name)}</div><div class="art">${TOY_ICON[c.toy]}</div><div class="foot">toy<br><span class="tiny">1/3/5/8/12</span></div></div>`;
  if (c.type === 'costume') return `<div class="card costume ${cls}" data-id="${id}" ${attrs}>${mark}<div class="name">${esc(c.name)}</div><div class="art">${COSTUME_ICON[c.name] || '🎭'}</div><div class="foot">costume<br><span class="tiny">Most: 6 · None: −2</span></div></div>`;
  if (c.type === 'catnip') return `<div class="card catnip ${cls}" data-id="${id}" ${attrs}>${mark}<div class="name">Catnip</div><div class="art">🌿</div><div class="foot tiny">1) −2 · 2-3) +1/cat · 4) +2/cat</div></div>`;
  if (c.type === 'spray') return `<div class="card spray ${cls}" data-id="${id}" ${attrs}>${mark}<div class="name">Spray Bottle</div><div class="art">🧴</div><div class="foot tiny">Discard to move the cat token</div></div>`;
  if (c.type === 'lost') return `<div class="card lost ${cls}" data-id="${id}" ${attrs}>${mark}<div class="name">Lost Cat</div><div class="art">📋</div><div class="foot tiny">Discard 2: 2 VP or a stray cat</div></div>`;
  return '';
}
const cardBack = (cls = '') => `<div class="card back ${cls}">🐈</div>`;
function cubesHtml(food, showZero = false) {
  return ['chicken', 'tuna', 'milk', 'wild'].filter(t => showZero || food[t]).map(t => `<span class="f"><span class="cube ${t}"></span>${food[t]} ${FOOD_LABEL[t]}</span>`).join('') || '<span class="muted tiny">no food</span>';
}

// ---------- main render ----------
function render() {
  if (!ui.code) return renderHome();
  const snap = ui.snap;
  if (!snap) { app.innerHTML = `<div class="loading"><div style="font-size:22px">🐈</div><p>Room <b>${esc(ui.code)}</b></p><p>${statusText()}</p><p class="tiny muted">Keep this page open. <a href="${esc(location.pathname)}">Back to start</a></p></div>`; return; }
  if (!snap.state) return renderLobby(snap);
  renderGame(snap);
}
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

function renderLobby(snap) {
  const isHost = snap.you === 0;
  const canStart = isHost && snap.seats.length >= 2;
  app.innerHTML = `
  <div class="lobby">
    <h1 class="logo">Cat Lady</h1>
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

function renderGame(snap) {
  const st = snap.state; const you = snap.you; const meP = st.players[you];
  const mine = you >= 0;
  const isTurn = mine && st.phase === 'playing' && st.current === you;
  let status = '';
  if (st.phase === 'placeToken') status = st.tokenPlacer === you ? 'Place the cat token next to a row or column to block it.' : `Waiting for ${esc(st.players[st.tokenPlacer].name)} to place the cat token.`;
  else if (st.phase === 'playing') status = isTurn ? (st.turn.taken ? 'You took cards. Play a spray bottle or lost cats, or end your turn.' : 'Your turn: take a row or column.') : `${esc(st.players[st.current].name)}'s turn.`;
  else if (st.phase === 'feeding') status = mine && !meP.feedingDone ? 'Game over! Feed your cats, then press Done.' : 'Waiting for everyone to finish feeding…';
  else status = 'Final scores';
  const picking = ui.pick;
  if (picking?.kind === 'spray') status = 'Spray bottle: choose where the cat token goes.';
  if (picking?.kind === 'stray') status = 'Choose a stray cat to bring home.';

  const offline = ui.status !== 'connected';
  app.innerHTML = `
  <div class="game ${offline ? 'offline' : ''}">
    ${offline ? `<div class="offline-bar">${statusText()} — your moves are paused until the connection is back.</div>` : ''}
    <div class="topbar">
      <span class="logo small">Cat Lady</span>
      <span class="status ${isTurn || (st.phase === 'placeToken' && st.tokenPlacer === you) ? 'mine' : ''}">${status}</span>
      <span class="tiny muted">Room ${snap.code} · turn ${st.turnNumber} · ${statusText()}</span>
      <button class="small" data-do="rules">Rules</button>
    </div>
    <div class="main">
      ${st.phase === 'ended' ? renderResults(snap) : ''}
      ${st.players.map((p, i) => i === you ? '' : renderOther(snap, i)).join('')}
      ${st.phase === 'feeding' || st.phase === 'ended' ? '' : renderBoard(snap)}
      ${mine ? renderMe(snap) : ''}
    </div>
    <div class="side">
      ${renderStrays(snap)}
      <div class="panel"><h3>Game log</h3><div class="log">${st.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div></div>
      <div class="panel"><h3>Chat</h3><div class="chatlist" id="chatlist">${snap.chat.map(c => `<div><b>${esc(c.from)}:</b> ${esc(c.text)}</div>`).join('') || '<span class="muted tiny">Say hi 💕</span>'}</div>
        <form id="chatform" class="row"><input id="chatinput" type="text" maxlength="300" placeholder="Message…" autocomplete="off"><button class="small" type="submit">Send</button></form></div>
    </div>
  </div>${rulesModal()}`;
  const cl = $('#chatlist'); if (cl) cl.scrollTop = cl.scrollHeight;
}

function renderBoard(snap) {
  const st = snap.state; const you = snap.you;
  const pickMode = ui.pick?.kind === 'spray' ? 'spray' : (st.phase === 'placeToken' && st.tokenPlacer === you) ? 'place' : (st.phase === 'playing' && st.current === you && !st.turn.taken) ? 'take' : null;
  const lineBtn = line => {
    const blocked = sameLine(line, st.token);
    const empty = !lineSlots(line).some(s => st.grid[s]);
    const can = pickMode && !blocked && (pickMode !== 'take' || !empty);
    const arrow = line.kind === 'row' ? '▸' : '▾';
    return `<button class="linebtn ${blocked ? 'blocked' : ''} ${can ? 'pick' : ''}" title="${blocked ? 'The cat token blocks this line' : lineName(line)}" data-line="${line.kind}:${line.index}" ${can ? '' : 'disabled'}>${blocked ? tokenSvg : can ? '🐾' : arrow}</button>`;
  };
  const cells = [];
  cells.push('<div></div>');
  for (let c = 0; c < 3; c++) cells.push(lineBtn({ kind: 'col', index: c }));
  for (let r = 0; r < 3; r++) {
    cells.push(lineBtn({ kind: 'row', index: r }));
    for (let c = 0; c < 3; c++) { const i = r * 3 + c; const id = st.grid[i]; const fresh = ui.lastGrid && ui.lastGrid[i] !== id; cells.push(`<div class="slot ${fresh ? 'fresh' : ''}" data-slot="${i}">${id ? cardHtml(id) : '<div class="empty"></div>'}</div>`); }
  }
  ui.lastGrid = st.grid.slice();
  return `<div class="panel tablepanel"><div class="boardwrap">
    <div class="board">${cells.join('')}</div>
    <div class="boardside">
      <div class="piles"><span class="pile">Deck: ${st.deckCount}</span><span class="pile">Discard: ${st.discard.length}</span><span class="pile">VP tokens: ${st.vpTokensLeft} × 💗2</span></div>
      ${pickMode === 'take' ? '<div class="hint">Tap a paw to take that whole row or column. The grey cat token marks the line you cannot take.</div>' : ''}
      ${pickMode === 'place' ? '<div class="hint">Tap a paw to put the cat token there. That line cannot be taken on the first turn.</div>' : ''}
      ${pickMode === 'spray' ? '<div class="hint">Tap a paw to move the cat token there. <button class="small" data-do="cancel">Cancel</button></div>' : ''}
    </div></div></div>`;
}

function renderStrays(snap) {
  const st = snap.state; const picking = ui.pick?.kind === 'stray';
  return `<div class="panel"><h3>Stray cats <span class="tiny muted">(${st.strayDeckCount} more in the deck, not drawn)</span></h3>
    <div class="strays">${st.strays.map(id => cardHtml(id, (picking ? 'pickable' : ''), picking ? `data-stray="${id}" style="cursor:pointer;outline:3px solid var(--ok)"` : '')).join('') || '<span class="muted tiny">All strays have been found.</span>'}</div>
    ${picking ? '<p><button class="small" data-do="cancel">Cancel</button></p>' : ''}</div>`;
}

function renderMe(snap) {
  const st = snap.state; const you = snap.you; const p = st.players[you];
  const isTurn = st.phase === 'playing' && st.current === you;
  const lostCount = p.hand.filter(id => CARDS[id].type === 'lost').length;
  const canLost = isTurn && lostCount >= 2 && (st.vpTokensLeft > 0 || st.strays.length > 0);
  const feeding = st.phase === 'feeding';
  let actions = '';
  if (st.phase === 'playing') actions = `<div class="actions">
      <button data-do="spray" ${isTurn && hasCard(p, 'spray') ? '' : 'disabled'}>🧴 Use spray bottle</button>
      <button data-do="lost-vp" ${canLost && st.vpTokensLeft > 0 ? '' : 'disabled'}>📋📋 → 💗 2 VP token</button>
      <button data-do="lost-stray" ${canLost && st.strays.length > 0 ? '' : 'disabled'}>📋📋 → find a stray cat</button>
      <button class="primary" data-do="end" ${isTurn && st.turn.taken ? '' : 'disabled'}>End turn</button></div>`;
  if (feeding) actions = `<div class="actions">
      ${p.feedingDone ? `<span class="muted">You are done. </span><button data-do="undone">Change my feeding</button>` : `<button data-do="autofeed">Auto-feed</button><button class="primary" data-do="done">Done feeding ✓</button>`}
      <span class="tiny muted">${st.players.filter(x => x.feedingDone).length}/${st.players.length} done</span></div>`;
  const cats = p.cats.map(cat => catWithFeeding(cat, p, feeding && !p.feedingDone)).join('') || '<span class="muted tiny">No cats yet.</span>';
  let moon = '';
  if (feeding && !p.feedingDone && p.cats.some(c => CARDS[c.cardId].special === 'wilds')) {
    moon = `<div class="hint">🌙 Moonbeam: turn up to 2 food into wilds (${2 - p.moonbeamUsed} left):
      ${FOOD_TYPES.map(t => `<button class="small" data-moon="${t}" ${p.moonbeamUsed < 2 && p.food[t] > 0 ? '' : 'disabled'}>${FOOD_ICON[t]}→✨</button>`).join(' ')}
      ${p.moonbeamUsed > 0 && p.food.wild > 0 ? FOOD_TYPES.map(t => `<button class="small" data-moonundo="${t}">✨→${FOOD_ICON[t]}</button>`).join(' ') : ''}</div>`;
  }
  return `<div class="panel you">
    <div class="player-head"><h3>${esc(p.name)} <span class="muted tiny">(you)</span></h3> ${isTurn ? '<span class="turnpill">your turn</span>' : ''} <span class="tiny muted">${p.vpTokens ? '💗×' + p.vpTokens : ''}</span></div>
    ${actions}
    <div class="label">Food${feeding ? ' left to give' : ''} <span class="foodrow" style="display:inline-flex">${cubesHtml(p.food)}</span></div>
    ${moon}
    <div class="label">Cats</div><div class="cards" style="margin-bottom:6px">${cats}</div>
    <div class="label">Hand <span class="muted">(toys, costumes, catnip, lost cats and spray bottles stay hidden from the others)</span></div>
    <div class="cards">${sortHand(p.hand).map(id => cardHtml(id, 'sm')).join('') || '<span class="muted tiny">Empty.</span>'}</div>
  </div>`;
}
function sortHand(hand) { const order = { toy: 0, costume: 1, catnip: 2, lost: 3, spray: 4 }; return hand.slice().sort((a, b) => (order[CARDS[a].type] - order[CARDS[b].type]) || CARDS[a].name.localeCompare(CARDS[b].name)); }

function catWithFeeding(cat, p, editable) {
  const c = CARDS[cat.cardId];
  const info = catFedInfo(cat, p);
  const anyFood = Object.values(cat.food).some(x => x);
  const status = editable || anyFood || p.feedingDone ? (info.fed ? 'fedok' : 'hungry') : '';
  const chips = ['chicken', 'tuna', 'milk', 'wild'].flatMap(t => Array.from({ length: cat.food[t] }, () => `<span class="chip" ${editable ? `data-unfeed="${cat.cardId}:${t}" title="Take back"` : ''}><span class="cube ${t}"></span></span>`)).join('');
  let btns = '';
  if (editable) btns = `<div class="feedbtns">${['chicken', 'tuna', 'milk', 'wild'].map(t => `<button data-feed="${cat.cardId}:${t}" ${p.food[t] > 0 && canAssign(cat, t) ? '' : 'disabled'} title="Give ${FOOD_LABEL[t]}">+${FOOD_ICON[t]}</button>`).join('')}</div>`;
  let truffle = '';
  if (c.special === 'truffle' && (editable || anyFood) && cat.food.wild > 0) truffle = `<select data-truffle="${cat.cardId}" ${editable ? '' : 'disabled'}>${FOOD_TYPES.map(t => `<option value="${t}" ${cat.truffleType === t ? 'selected' : ''}>as ${FOOD_ICON[t]}</option>`).join('')}</select>`;
  const label = (editable || anyFood || p.feedingDone) ? `<span class="tiny ${info.fed ? '' : 'muted'}">${info.fed ? '✓ fed' : 'hungry −2'}</span>` : '';
  return `<div class="cardwrap">${cardHtml(cat.cardId, status)}${label}<div class="chips">${chips}</div>${truffle}${btns}</div>`;
}

function renderOther(snap, i) {
  const st = snap.state; const p = st.players[i]; const seat = snap.seats[i];
  const showFeeding = st.phase === 'feeding' || st.phase === 'ended';
  const hand = p.hand ? sortHand(p.hand).map(id => cardHtml(id, 'sm')).join('') : Array.from({ length: p.handCount }, () => cardBack('sm')).join('');
  return `<div class="panel">
    <div class="player-head"><span class="dot ${seat?.connected ? 'on' : ''}" title="${seat?.connected ? 'online' : 'offline'}"></span><h3>${esc(p.name)}</h3> ${st.current === i && st.phase === 'playing' ? '<span class="turnpill">their turn</span>' : ''} <span class="tiny muted">${p.vpTokens ? '💗×' + p.vpTokens : ''} ${showFeeding ? (p.feedingDone ? '· done feeding' : '· feeding…') : ''}</span></div>
    <div class="label">Food <span class="foodrow" style="display:inline-flex">${cubesHtml(p.food)}</span></div>
    <div class="label">Cats</div><div class="cards" style="margin-bottom:6px">${p.cats.map(cat => catWithFeeding(cat, p, false)).join('') || '<span class="muted tiny">No cats yet.</span>'}</div>
    <div class="label">Hand <span class="muted">(${p.hand ? p.hand.length : p.handCount} cards)</span></div><div class="cards">${hand || '<span class="muted tiny">Empty.</span>'}</div>
  </div>`;
}

function renderResults(snap) {
  const r = snap.state.results; const you = snap.you;
  const head = r.winners.length === 1 ? `🏆 ${esc(r.players[r.winners[0]].name)} wins!` : `🤝 It's a tie between ${r.winners.map(i => esc(r.players[i].name)).join(' and ')}!`;
  const labels = r.players[0].lines.map(l => l.label.replace(/\s*\(.*\)$/, ''));
  return `<div class="panel results">
    <div class="winner">${head}</div>
    <table><thead><tr><th></th>${r.players.map(p => `<th class="n">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
      ${labels.map((lab, li) => `<tr><td>${esc(lab)} <span class="tiny muted">${r.players.map(p => p.lines[li].label.match(/\((.*)\)/)?.[1] || '').filter(Boolean).length ? '' : ''}</span></td>${r.players.map(p => `<td class="n" title="${esc(p.lines[li].label)}">${p.lines[li].vp}</td>`).join('')}</tr>`).join('')}
      <tr><td class="tiny muted">Fed cats (tiebreaker)</td>${r.players.map(p => `<td class="n tiny muted">${p.fedCount}</td>`).join('')}</tr>
      <tr class="total"><td>Total</td>${r.players.map(p => `<td class="n">${p.total}</td>`).join('')}</tr>
    </tbody></table>
    <details style="margin-top:8px"><summary class="tiny">Cat by cat</summary>${r.players.map(p => `<div class="tiny"><b>${esc(p.name)}:</b> ${p.cats.map(c => `${esc(c.name)} ${c.fed ? '' : '(hungry) '}${c.vp >= 0 ? '+' : ''}${c.vp}`).join(', ') || 'no cats'}</div>`).join('')}</details>
    ${you === 0 ? '<p><button class="primary" data-do="again">Play again</button></p>' : '<p class="muted tiny">The host can start a new game.</p>'}
  </div>`;
}

function rulesModal() {
  if (!ui.showRules) return '';
  return `<div class="modal-bg" data-do="closerules"><div class="modal" onclick="event.stopPropagation()"><h2>How to play</h2>
  <ul>
    <li><b>Your turn:</b> take all the cards in one row or column of the 3×3 grid. You cannot take the line the 🐈 cat token is next to. The token then moves to the line you took, and the line refills from the deck.</li>
    <li><b>Cats</b> go in front of you. At the end you must feed each one the food shown on its card, or lose 2 VP. Fed cats score their number.</li>
    <li><b>Food</b> cards give you a cube of that type (x2 cards give two). Wild cubes count as any food. The player with the most leftover food at the end loses 2 VP.</li>
    <li><b>Toys, costumes and catnip</b> stay in your hand. Toys score per set of different toys: 1/3/5/8/12 for 1–5 unique toys, and you can score several sets. Most costumes: +6 VP (split on ties); no costume: −2. Catnip: exactly one is −2; two or three give +1 per fed cat; four or more give +2 per fed cat.</li>
    <li><b>Lost cats:</b> on your turn discard two of them to take a 2 VP token or one of the three stray cats (they have special powers and must also be fed).</li>
    <li><b>Spray bottle:</b> on your turn discard it to move the cat token anywhere, blocking your opponent or unblocking a line for yourself.</li>
    <li><b>Game end:</b> when a line needs refilling and the deck is empty. Then feed your cats and score. Ties go to whoever fed the most cats.</li>
  </ul><button data-do="closerules">Close</button></div></div>`;
}

// ---------- events ----------
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-do],[data-line],[data-stray],[data-feed],[data-unfeed],[data-moon],[data-moonundo]');
  if (!t) return;
  const d = t.dataset;
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
    case 'spray': ui.pick = { kind: 'spray' }; render(); break;
    case 'lost-vp': act({ type: 'lostCats', choice: 'vp' }); break;
    case 'lost-stray': ui.pick = { kind: 'stray' }; render(); break;
    case 'cancel': ui.pick = null; render(); break;
    case 'end': act({ type: 'endTurn' }); break;
    case 'autofeed': act({ type: 'autoFeed' }); break;
    case 'done': act({ type: 'feedingDone' }); break;
    case 'undone': act({ type: 'feedingDone', undo: true }); break;
    case 'rules': ui.showRules = true; render(); break;
    case 'closerules': ui.showRules = false; render(); break;
  }
});
app.addEventListener('change', e => {
  const sel = e.target.closest('[data-truffle]');
  if (sel) act({ type: 'truffleType', cardId: sel.dataset.truffle, food: sel.value });
});
app.addEventListener('submit', e => {
  if (e.target.id !== 'chatform') return;
  e.preventDefault();
  const input = $('#chatinput'); const text = input.value.trim(); if (!text) return;
  send({ type: 'chat', text }); input.value = '';
});
app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'joincode') $('[data-do=join]')?.click(); if (e.key === 'Enter' && e.target.id === 'name' && !ui.code) $('[data-do=create]')?.click(); });
function saveName() { const el = $('#name'); if (el) { myName = el.value.trim().slice(0, 20); store.set('catlady:name', myName); } }

// Warn the peer-to-peer host before leaving mid-game.
window.addEventListener('beforeunload', e => { if (ui.mode === 'p2p' && ui.transport instanceof PeerHostTransport && ui.snap?.state && ui.snap.state.phase !== 'ended') { e.preventDefault(); e.returnValue = ''; } });

boot();
