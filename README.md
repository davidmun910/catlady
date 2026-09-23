# Cat Lady Online

A faithful, playable web version of **Cat Lady** (the card game by Josh Wood, published by AEG) for 2 to 4 players
who are not in the same room. One person creates a game, shares the link, and everyone plays live in the browser.

**Play it here: https://davidmun910.github.io/catlady/** (deployed from `public/` by GitHub Actions on every push to `main`).

Cat Lady is © Alderac Entertainment Group. This is a fan-made implementation for private play; the card art is
replaced by simple drawings.

## Two ways to host it

### 1. Static hosting, no server (peer-to-peer)
Upload the `public/` folder anywhere that serves static files (GitHub Pages, Netlify, Cloudflare Pages, Vercel…)
or open it from any static web server. The game creator's browser tab runs the game; other players connect to it
directly over WebRTC (signalling through the free public PeerJS server, with Google STUN).

* The creator must keep their tab open while playing. If they refresh, the game is restored from their browser storage.
* Guests reconnect automatically and keep their seat (a token is saved in their browser).
* On rare networks where WebRTC cannot connect (some mobile carriers), use option 2.

### 2. Node server (WebSocket rooms) — recommended
```
npm install
npm start          # http://localhost:3000   (PORT env var to change)
```
One-click on Render: sign in at https://dashboard.render.com with GitHub, choose **New → Blueprint**, pick this repo;
`render.yaml` sets everything up (free plan). Then either share the Render URL directly, or put it in
`public/config.js` as `window.CATLADY_RELAY` so the GitHub Pages link uses the server as its relay (the page
wakes a sleeping free instance automatically).
Deploy the repo as a Node web service to Render, Railway, Fly.io, a VPS, etc. Rooms live in memory and are
mirrored to `data/rooms.json`, so a restart does not lose a game in progress. The page detects the server
automatically (`/api/ping`) and uses WebSockets instead of WebRTC.

## Playing
1. Enter your name and press **Create game**. Copy the link and send it.
2. Friends open the link, enter their name, and appear in the lobby. The host presses **Start game**
   (and can choose who goes first, e.g. whoever has the most cats in real life).
3. The player to the right of the starter places the cat token. Then, on your turn, click the arrow of a row or
   column to take all three cards. Use spray bottles and lost cats with the buttons in your area, then **End turn**.
4. When the deck cannot refill the grid, the game ends and everyone feeds their cats (Auto-feed does a sensible
   job; you can move cubes by hand). Press **Done feeding** and the final score table appears.

Hands (toys, costumes, catnip, lost cats, spray bottles) are hidden from other players until the end, as in the
physical game. Cats, food cubes and VP tokens are open information.

## Rules implemented
Everything in the official rulebook: row/column drafting with the blocking cat token, refills, spray bottles,
lost cats for VP tokens or strays (three strays face up, never replaced), feeding with wilds, end-game trigger,
and full scoring (cats, unfed −2, most leftover food −2 incl. ties, costumes most +6 split on ties / none −2,
catnip 1 = −2 / 2–3 = +1 per fed cat / 4+ = +2 per fed cat, toy sets 1/3/5/8/12 with multiple sets, VP tokens,
tiebreak by most fed cats). All 22 cats and all 13 stray cats with their abilities are included, plus the
player-count deck adjustments (cards marked 3+ and 4, then two random cards removed).

### Assumptions worth checking against your copy
Everything was reconstructed from the rulebook and photos of the cards; two details could not be verified:
* **Lily** (black, marked 3+): her value was not visible in any photo. She is set to 2 VP for 1 milk. Edit `public/cards.js`.
* **Which exact cards carry the 3+ / 4 markers.** The ones seen in photos are correct; the rest were distributed so
  that the deck is 66 cards for 2 players, 84 for 3 and 102 for 4. Adjust `minPlayers` in `public/cards.js`.
* Interpretations: Moonbeam lets you treat any 2 of your food cubes as wild (for any cat); Cow with no food is a
  hungry cat (−2); when nobody has leftover food, nobody takes the food penalty; multi-coloured cats count for
  each of their colours (rulebook), and a set for LeVar Purrton uses each cat once.

## Development
```
npm test           # rules engine tests (node:test)
```
* `public/cards.js` – every card in the game
* `public/engine.js` – pure rules engine (state in, state out) and scoring
* `public/room.js` – a game room (seats, chat, authoritative state); shared by server and browser host
* `public/net.js` – WebSocket and WebRTC transports
* `public/app.js`, `index.html`, `style.css` – the UI
* `server.js` – static file server + WebSocket rooms
