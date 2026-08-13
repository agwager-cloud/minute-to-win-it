# Minute to Win It — Classroom King of the Court

**Version 0.1.0** — first deployable foundation based on the proven Dodeca-Gems classroom architecture.

## Playable now
- **Lights Out** — five F1-style starts, local `performance.now()` timing, median reaction shown to 0.001 s; each false start adds a 0.200 s match penalty.
- **Time Stop** — three shared random targets from 3.00 s to under 15.00 s; clock disappears after 1 second; lowest total absolute error wins.

The other 12 planned games are already visible in the sliding selector as **Coming Soon** cards.

## Multiplayer foundation
- 5-digit rooms and up to 40 players
- duplicate-name/device protection
- asynchronous King of the Court promotion/relegation
- every match win = +1 point; championship crown tracked separately
- host participation logic and solo Host vs **Minute Bot** testing
- late-join waiting queue and live read-only spectating
- host player removal
- 20-second reconnect grace during an active match
- touch/pointer-first responsive UI for phones, iPads and laptops

## Timing fairness
Reaction and stopwatch timing are measured **on the player's device** with `performance.now()`. Render receives only progress and completed results; network round-trip time is not part of the measured reaction result.

## Local development
```bash
npm install
npm run dev
```
Client: `http://localhost:5173`  
Server: `ws://localhost:3001`

## Production server
The included `render.yaml` creates a free Node web service in Singapore named:

`minute-to-win-it-classroom-260813-a7f3`

Expected secure WebSocket URL:

`wss://minute-to-win-it-classroom-260813-a7f3.onrender.com`

The client connects/retries directly over WebSocket; it does not require an HTTP `/health` wake check.
