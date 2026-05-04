# Polymarket Simulator

A lightweight **prediction‑market simulator** that lets you race against three automated bots (aggressive, standard, low‑bets) to reach **$100 000** the fastest.

## Features
- **Binary market** with a constant‑product AMM (yes / no outcomes).  
- **Three bot strategies** that trade automatically based on price movement.  
- **Human player UI** (`/game.html`) where you can place trades, track cash, and see live prices.  
- **Game flow**: start a fresh market, race the bots, and reset for a new round.  
- **Leaderboard** persisted in `leaderboard.json` (top scores by rounds).  
- **Memory‑safe**: bots stop after a configurable number of trades, preventing heap blow‑ups.  
- **Simulation scripts** (`simulate.js`, `simulate-lose.js`) for automated testing.

## Quick start
```bash
# Clone the repo
git clone https://github.com/aicloudtop-spec/polymarket-simulator.git
cd polymarket-simulator

# Install dependencies (once)
npm install

# Run the server (limited to 256 MB heap to stay safe)
node --max-old-space-size=256 server.js &
```
The server will listen on `http://localhost:3000`.

## Play the game
1. Open your browser to `http://localhost:3000/game.html`.
2. Click **Start Game** – a fresh market is created and three bots start trading.
3. Use the **Buy YES** / **Buy NO** buttons to place trades (default quantity = 10).  Your cash updates after each trade.
4. The goal is to reach **$100 000** before the bots do.  When you hit the target the UI declares you the winner.
5. Click **Reset** (now available) to clear the market, stop bots, and start a new race.
6. View the **Leaderboard** (via the button on the page or `GET /leaderboard`) to see the fastest wins.

## Scripts
- `simulate.js` – runs all three bots from $1 000 up to $100 k and reports rounds taken.
- `simulate-lose.js` – runs each bot starting with $100 k and reports which bot loses its money first.

## Customisation
- **Bot aggressiveness** – edit `startMomentumBot` in `server.js` to change `maxTrades`, trade size, or price‑change thresholds.
- **Leaderboard** – the JSON file `leaderboard.json` can be edited manually or a UI can be added to submit a player name.
- **Memory limits** – adjust the `--max-old-space-size` flag when launching the server.

## License
MIT – feel free to fork, modify, and share!
