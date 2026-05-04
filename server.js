const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(express.static('public'));
app.use(bodyParser.json());

// Simple in‑memory ledger
const markets = {}; // id -> {id, description, outcomes: {yes: amt, no: amt}}

// Bot management
const bots = {}; // botId -> {id, marketId, strategy, intervalId, lastPrice, ...}
let botCounter = 0;

// Game state (single player vs bots)
let game = null; // {marketId, round, human:{cash,contractsYes,contractsNo}, botIds:[]}

// Leaderboard (in‑memory, saved to file)
const fs = require('fs');
const leaderboardFile = 'leaderboard.json';
let leaderboard = [];
try { leaderboard = JSON.parse(fs.readFileSync(leaderboardFile, 'utf8')); } catch(e) { leaderboard = []; }
function saveLeaderboard() {
  fs.writeFileSync(leaderboardFile, JSON.stringify(leaderboard, null, 2));
}

// Helper: create a market with a constant‑product AMM
function createMarket(description) {
  const id = `market-${Date.now()}`;
  markets[id] = {
    id,
    description,
    // start with even smaller liquidity for bigger price swings
    outcomes: {yes: 1_000, no: 1_000}
  };
  return markets[id];
}

// Pricing via k = x * y constant product AMM
function getPrice(outcome, market) {
  const x = market.outcomes.yes;
  const y = market.outcomes.no;
  const k = x * y;
  // probability of YES = y / (x + y)
  const probYes = y / (x + y);
  const probNo = x / (x + y);
  return outcome === 'yes' ? probYes : probNo;
}

// Trade: user wants to buy `qty` contracts of outcome
app.post('/trade', (req, res)=>{
  const {marketId, outcome, qty, amount} = req.body;
  const market = markets[marketId];
  if(!market) return res.status(404).json({error:'Market not found'});
  // Simplified pricing: assume 1 contract = $1 * probability
  const price = getPrice(outcome, market);
  const cost = price * qty;
  if(amount < cost) return res.status(400).json({error:'Insufficient funds'});
  // Update liquidity pools
  if(outcome==='yes'){
    market.outcomes.yes += qty;
    market.outcomes.no  -= qty;
  }else{
    market.outcomes.no += qty;
    market.outcomes.yes -= qty;
  }
  res.json({market, cost, remaining: amount-cost});
});

app.get('/markets', (req,res)=>{res.json(Object.values(markets));});
app.post('/markets', (req,res)=>{const m=createMarket(req.body.description);res.json(m);});


// Bot strategy: Momentum trading
function startMomentumBot(marketId, checkIntervalMs = 5000, maxTrades = 200) {
  const market = markets[marketId];
  if (!market) return {error: 'Market not found'};
  let tradeCount = 0;
  
  const botId = `bot-${botCounter++}`;
  let lastPrice = getPrice('yes', market);
  
  const intervalId = setInterval(() => {
    tradeCount++;
    if (tradeCount >= maxTrades) {
      clearInterval(intervalId);
      return;
    }
    const currentPrice = getPrice('yes', market);
    const changePct = (currentPrice - lastPrice) / lastPrice;
    
    // Trade logic: buy YES if price up >2%, buy NO if down >2%
    if (changePct > 0.02) {
      // Price rising - buy YES
      fetch(`http://localhost:3000/trade`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({marketId, outcome: 'yes', qty: 10, amount: 1000})
      }).catch(e => console.error('Bot trade error:', e));
    } else if (changePct < -0.02) {
      // Price falling - buy NO
      fetch(`http://localhost:3000/trade`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({marketId, outcome: 'no', qty: 10, amount: 1000})
      }).catch(e => console.error('Bot trade error:', e));
    }
    
    lastPrice = currentPrice;
  }, checkIntervalMs);
  
  bots[botId] = {id: botId, marketId, strategy: 'momentum', intervalId, lastPrice};
  return {botId, marketId, strategy: 'momentum', checkIntervalMs};
}

// Bot API endpoints
app.post('/bots/start', (req, res) => {
  const {marketId, strategy} = req.body;
  if (strategy === 'momentum') {
    const bot = startMomentumBot(marketId);
    if (bot.error) return res.status(400).json(bot);
    res.json(bot);
  } else {
    res.status(400).json({error: 'Unknown strategy. Use: momentum'});
  }
});

app.post('/bots/stop', (req, res) => {
  const {botId} = req.body;
  const bot = bots[botId];
  if (!bot) return res.status(404).json({error: 'Bot not found'});
  clearInterval(bot.intervalId);
  delete bots[botId];
  res.json({message: `Bot ${botId} stopped`});
});

app.get('/bots', (req, res) => {
  const botList = Object.values(bots).map(({id, marketId, strategy}) => ({id, marketId, strategy}));
  res.json(botList);
});

// Simulation endpoint: run a bot internally with cash tracking
app.post('/simulate/bot', (req, res) => {
  const {marketId, startCash, targetCash, maxRounds, strategy, loseAll} = req.body;
  const market = markets[marketId];
  if (!market) return res.status(404).json({error: 'Market not found'});

  // Strategy configurations
  const strategies = {
    aggressive: { tradeSize: 50, threshold: 0.001, name: 'Aggressive' },
    standard:   { tradeSize: 20, threshold: 0.005, name: 'Standard' },
    lowBets:    { tradeSize: 5,  threshold: 0.01,  name: 'Low Bets' }
  };
  const strat = strategies[strategy] || strategies.standard;
  
  let cash = startCash;
  let contractsYes = 0, contractsNo = 0;
  const history = [];
  let round = 0;
  let lastPrice = getPrice('yes', market);

  const condition = loseAll ? () => cash > 0 : () => round < maxRounds && cash < targetCash;

  while (condition()) {
    round++;
    const currentPrice = getPrice('yes', market);
    const changePct = (currentPrice - lastPrice) / lastPrice;
    const tradeQty = strat.tradeSize;
    const cost = getPrice('yes', market) * tradeQty;

    if (changePct > strat.threshold && cash >= cost) {
      // Buy YES
      market.outcomes.yes += tradeQty;
      market.outcomes.no -= tradeQty;
      contractsYes += tradeQty;
      cash -= cost;
      history.push(`Round ${round}: YES @${currentPrice.toFixed(4)} cost $${cost.toFixed(2)} cash left $${cash.toFixed(2)}`);
    } else if (changePct < -strat.threshold && cash >= cost) {
      // Buy NO
      market.outcomes.no += tradeQty;
      market.outcomes.yes -= tradeQty;
      contractsNo += tradeQty;
      cash -= cost;
      history.push(`Round ${round}: NO @${currentPrice.toFixed(4)} cost $${cost.toFixed(2)} cash left $${cash.toFixed(2)}`);
    } else {
      history.push(`Round ${round}: No trade (change ${changePct.toFixed(4)}) cash $${cash.toFixed(2)}`);
    }
    lastPrice = currentPrice;

    // Random price drift to simulate market movement (positive pools)
    const drift = (Math.random() - 0.5) * 2; // moderate random walk
    market.outcomes.yes = Math.max(1, market.outcomes.yes + Math.round(drift * 100));
    market.outcomes.no = Math.max(1, market.outcomes.no - Math.round(drift * 100));
  }

  res.json({
    strategy: strat.name,
    rounds: round,
    finalCash: cash.toFixed(2),
    finalContracts: {yes: contractsYes, no: contractsNo},
    history,
    reachedTarget: !loseAll && cash >= targetCash,
    lostAll: loseAll && cash <= 0
  });
});

app.post('/game/reset', (req, res) => {
  // Stop any running bots
  if (game && game.botIds) {
    game.botIds.forEach(id => {
      const bot = bots[id];
      if (bot && bot.intervalId) clearInterval(bot.intervalId);
      delete bots[id];
    });
  }
  // Clear market state
  for (const id in markets) { delete markets[id]; }
  // Reset game object
  game = null;
  res.json({message: 'Game reset. All markets and bots cleared.'});
});

// Get leaderboard (top scores)
app.get('/leaderboard', (req, res) => {
  // Sort by fastest rounds to $100k (ascending)
  const sorted = leaderboard.slice().sort((a,b)=>a.rounds - b.rounds);
  res.json(sorted);
});

app.listen(3000,()=>console.log('Prediction market simulator running on :3000'));
