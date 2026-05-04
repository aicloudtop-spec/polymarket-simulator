const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(express.static('public'));
app.use(bodyParser.json());

// Simple in‑memory ledger
const markets = {};
const bots = {};
let botCounter = 0;
let game = null;

function createMarket(description) {
  const id = `market-${Date.now()}`;
  markets[id] = {
    id,
    description,
    outcomes: {yes: 1_000, no: 1_000}
  };
  return markets[id];
}

function getPrice(outcome, market) {
  const x = market.outcomes.yes;
  const y = market.outcomes.no;
  const probYes = y / (x + y);
  const probNo = x / (x + y);
  return outcome === 'yes' ? probYes : probNo;
}

// Start a momentum bot (used by game)
function startMomentumBot(marketId) {
  const market = markets[marketId];
  if (!market) return null;
  const botId = `bot-${botCounter++}`;
  let lastPrice = getPrice('yes', market);
  const intervalId = setInterval(() => {
    const currentPrice = getPrice('yes', market);
    const changePct = (currentPrice - lastPrice) / lastPrice;
    if (changePct > 0.02) {
      // Buy YES
      market.outcomes.yes += 10;
      market.outcomes.no -= 10;
    } else if (changePct < -0.02) {
      market.outcomes.no += 10;
      market.outcomes.yes -= 10;
    }
    lastPrice = currentPrice;
    // Drift
    const drift = (Math.random() - 0.5) * 2;
    market.outcomes.yes = Math.max(1, market.outcomes.yes + Math.round(drift * 100));
    market.outcomes.no = Math.max(1, market.outcomes.no - Math.round(drift * 100));
  }, 5000);
  bots[botId] = {id: botId, marketId, intervalId, lastPrice};
  return botId;
}

// --- Game endpoints ---
app.post('/game/start', (req, res) => {
  const market = createMarket('Human vs Bots race');
  game = {
    marketId: market.id,
    round: 0,
    human: { cash: 1000, contractsYes: 0, contractsNo: 0 },
    botIds: []
  };
  // Start three bots
  for (let i = 0; i < 3; i++) {
    const botId = startMomentumBot(market.id);
    if (botId) game.botIds.push(botId);
