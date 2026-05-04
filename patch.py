import re

with open('/home/cloudtop/.openclaw/workspace/prediction-market/server.js', 'r') as f:
    content = f.read()

# 1. Add maxTrades parameter
content = re.sub(
    r'function startMomentumBot\(marketId, checkIntervalMs = 5000\) \{',
    r'function startMomentumBot(marketId, checkIntervalMs = 5000, maxTrades = 200) {',
    content
)

# 2. Add tradeCount variable after market check
content = re.sub(
    r'(if \(!market\) return \{error: \'Market not found\'\};)',
    r'\1\n  let tradeCount = 0;',
    content
)

# 3. Inside the interval, add tradeCount check at the beginning
# We need to find the arrow function body and insert after the opening brace.
# Replace the line containing "const intervalId = setInterval(() => {" with a modified version that includes tradeCount logic.
# We'll replace the whole interval block with a new one.

old_interval_start = '''  const intervalId = setInterval(() => {
    const currentPrice = getPrice('yes', market);'''

new_interval_start = '''  const intervalId = setInterval(() => {
    tradeCount++;
    if (tradeCount >= maxTrades) {
      clearInterval(intervalId);
      return;
    }
    const currentPrice = getPrice('yes', market);'''

content = content.replace(old_interval_start, new_interval_start)

with open('/home/cloudtop/.openclaw/workspace/prediction-market/server.js', 'w') as f:
    f.write(content)

print("Patched server.js")
