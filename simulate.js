// Run all three bot strategies and compare results
const http = require('http');

function api(path, method, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {'Content-Type': 'application/json'}
    };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const strategies = ['aggressive', 'standard', 'lowBets'];
const results = [];

async function runStrategy(strategy) {
  console.log(`\n=== Testing ${strategy.toUpperCase()} strategy ===`);
  // Create fresh market for each strategy
  const mkt = await api('/markets', 'POST', {description: `Market for ${strategy}`});
  const start = Date.now();
  
  const res = await api('/simulate/bot', 'POST', {
    marketId: mkt.id,
    startCash: 1000,
    targetCash: 100000,
    maxRounds: 2000,
    strategy
  });
  
  const elapsed = ((Date.now() - start)/1000).toFixed(1);
  
  if (res.error) {
    console.log(`Error: ${res.error}`);
    return null;
  }
  
  const result = {
    strategy: res.strategy,
    rounds: res.rounds,
    finalCash: res.finalCash.toFixed(2),
    elapsed,
    reachedTarget: res.reachedTarget
  };
  
  console.log(`Strategy: ${result.strategy}`);
  console.log(`Rounds: ${result.rounds}`);
  console.log(`Final cash: $${result.finalCash}`);
  console.log(`Time elapsed: ${result.elapsed}s`);
  console.log(`Reached $100k: ${result.reachedTarget}`);
  
  if (res.history && res.history.length > 0) {
    console.log('Last 3 rounds:');
    res.history.slice(-3).forEach(h => console.log('  ' + h));
  }
  
  return result;
}

async function runAll() {
  console.log('Starting comparison of three bot strategies...');
  console.log('Each starts with $1000, target $100,000\n');
  
  for (const strat of strategies) {
    const r = await runStrategy(strat);
    if (r) results.push(r);
  }
  
  console.log('\n=== COMPARISON SUMMARY ===');
  console.log('Strategy\tRounds\tFinal Cash\tTime(s)\tTarget Hit');
  results.forEach(r => {
    console.log(`${r.strategy}\t${r.rounds}\t$${r.finalCash}\t${r.elapsed}\t${r.reachedTarget}`);
  });
  
  process.exit(0);
}

// Wait for server
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function poll() {
  for (let i = 0; i < 30; i++) {
    try {
      await api('/markets', 'GET');
      console.log('Server ready.');
      return runAll();
    } catch(e) {
      await wait(1000);
    }
  }
  console.error('Server not ready');
  process.exit(1);
}
poll();
