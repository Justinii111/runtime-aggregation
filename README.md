
Aggregator WASM
Ticks → Candles

Usage
js
import { AggregationClient } from './market-aggregator.js';

const client = await AggregationClient.create(
  new URL('./market-aggregator.wasm', import.meta.url)
);

// Init
const data = await client.replace('stream-1', config, historyTrades);

// Append
const update = await client.append('stream-1', '688825.SH', newTrades);

client.close();
API
Method	Description
create(source)	Load WASM
health()	→ { status: 'ready' }
replace(stream, config, trades)	Full init / rebuild
append(stream, symbol, trades)	Incremental append
restart()	Rebuild Worker
close()	Release resources
Types
Input

ts
Trade { timestamp_ms, price, quantity, side: 'buy' | 'sell' }
Output

ts
Candle { unix, open, high, low, close, vbuy, vsell, final }

Errors
Code	Reason	Action
E103	Stream not initialized	Call replace first
E104	Data older than current tail	Use replace to backfill
E105	Symbol mismatch	Check symbol
E109	Worker rebuilt	Re-call replace
E110	Timeout	Auto-rebuild, retry

Notes
Serialize calls per stream

