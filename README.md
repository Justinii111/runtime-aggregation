# Market Aggregation WASM

独立的逐笔行情聚合运行时。输入逐笔成交，输出 K 线和足迹数据。

发行目录仅包含运行所需文件，不包含源码、构建脚本、Git 元数据、
Source Map、工具链路径、数据源连接器、API 凭证或产品服务地址。

## 文件

| 文件 | 用途 |
| --- | --- |
| `market-aggregator.wasm` | 聚合运行时 |
| `market-aggregator.js` | 浏览器和 Node.js 客户端 |
| `market-aggregator.worker.js` | 隔离执行 WASM，支持超时重建 |
| `market-aggregator.d.ts` | 最小 TypeScript 类型 |
| `SHA256SUMS` | 发行文件完整性校验 |

底层二进制 ABI 不随发行包提供。宿主应使用本目录中的 JavaScript 客户端。

## 浏览器使用

建议通过 HTTP(S) 提供这些文件，并保持三个运行文件位于同一目录。

```js
import { AggregationClient } from './market-aggregator.js';

const aggregator = await AggregationClient.create(
  new URL('./market-aggregator.wasm', import.meta.url),
  { requestTimeoutMs: 10_000 },
);

console.log(await aggregator.health());
// { status: 'ready' }

const initial = await aggregator.replace(
  'chart-1',
  {
    symbol: '688825.SH',
    tick_size: 0.01,
    timeframe: 60,
  },
  historyTrades,
);

chart.replaceCandles(initial.candles);
chart.replaceFootprints(initial.footprints);

const realtime = await aggregator.append(
  'chart-1',
  '688825.SH',
  newTrades,
);

chart.appendCandles(realtime.candles);
chart.appendFootprints(realtime.footprints);
```

不再使用时释放 Worker：

```js
aggregator.close();
```

## Node.js 使用

客户端是 ES Module。Node.js 项目需使用 `type: module`，或使用 `.mjs` 文件。

```js
import { readFile } from 'node:fs/promises';
import { AggregationClient } from './market-aggregator.js';

const bytes = await readFile(
  new URL('./market-aggregator.wasm', import.meta.url),
);

const aggregator = await AggregationClient.create(bytes);
const status = await aggregator.health();
```

Node.js 同样在独立 Worker 中执行 WASM，不阻塞主线程。

## 接口

### `AggregationClient.create(source, options?)`

创建客户端并验证、加载 WASM。

- `source`：WASM URL、`Response`、`ArrayBuffer` 或 TypedArray。
- `options.integrity`：可选 SHA-256。发行客户端默认内嵌配套 WASM 的哈希。
- `options.requestTimeoutMs`：单次请求超时，默认 10 秒。
- `options.workerUrl`：可选自定义 Worker URL。

### `health()`

运行时可用时只返回：

```ts
{ status: 'ready' }
```

不会公开内部容量或实现信息。

### `replace(stream, config, trades)`

初始化或完整替换一个数据流。整批数据会先验证，只有全部合法才一次提交。

```ts
type AggregationConfig = {
  symbol: string;
  tick_size: number;
  timeframe: number; // 秒
};
```

首次加载、修改品种、修改 tick size、修改周期或 Worker 重建后必须调用。

### `append(stream, symbol, trades)`

增量追加逐笔数据。批次应按时间向后推进；重复成交会被去重。非法批次不会
部分写入。

历史数据较大时，先用一个 `replace` 初始化，再按时间顺序分批 `append`。

### `restart()`

主动销毁并重建 Worker。重建会清空内存状态，之后必须重新调用 `replace`。

### `close()`

终止 Worker 并释放客户端资源。关闭后的实例不可复用。

## 数据类型

逐笔时间使用毫秒，输出 K 线和足迹时间使用 Unix 秒。

```ts
type Trade = {
  timestamp_ms: number;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  sequence?: number;
  trade_id?: string | number;
};

type Candle = {
  unix: number;
  open: number;
  high: number;
  low: number;
  close: number;
  vbuy: number;
  vsell: number;
  final: boolean;
};

type Footprint = {
  unix: number;
  timeframe: number;
  prices: number[];
  buys: number[];
  sells: number[];
  final: boolean;
};

type AggregateResult = {
  candles: Candle[];
  footprints: Footprint[];
};
```

`prices`、`buys`、`sells` 长度始终相同。当前未结束周期的 Candle 和
Footprint 都会返回 `final: false`。

## 错误处理

运行时只返回稳定短错误码，不返回内部诊断字符串。

```js
try {
  await aggregator.append('chart-1', '688825.SH', trades);
} catch (error) {
  console.error(error.code); // 例如 E104
}
```

| 错误码 | 调用方处理 |
| --- | --- |
| `E101` | 请求或运行时状态无效，检查输入并重新初始化 |
| `E102` | 请求或响应过大，缩小批次 |
| `E103` | 数据流尚未初始化，先调用 `replace` |
| `E104` | 追加数据早于当前流末尾，改用 `replace` 回补历史 |
| `E105` | 品种与数据流不一致 |
| `E106` | 成交值、tick size 或周期无效 |
| `E107` | 达到运行时资源边界，缩小保留范围或拆分实例 |
| `E108` | 协议或操作不兼容，确保 JS 与 WASM 来自同一发行版 |
| `E109` | Worker 已重建，重新调用 `replace` |
| `E110` | 请求超时；Worker 会被销毁并自动重建 |

## 增量和线程规则

- 一个 `stream` 对应一个独立的品种和周期状态。
- 同一数据流的调用应串行 `await`，不要并发追加。
- 新交易日或实时成交使用 `append`，无需重复完整历史。
- 修订早于流末尾的数据时，调用 `replace` 重建该流。
- Worker 超时或异常退出后状态不会恢复，必须重新 `replace`。

## 完整性校验

发行版中的 JS 客户端内嵌配套 WASM 的 SHA-256，加载时会验证一致性。
也可手动检查整个目录：

```bash
# Linux
sha256sum -c SHA256SUMS

# macOS
shasum -a 256 -c SHA256SUMS
```

必须从同一发行版本获取 `.wasm`、`.js`、Worker 和类型文件，禁止混用。

## 安全边界

运行时不包含数据源和凭证，不主动联网，也没有 WASM imports。公开产物已剥离
符号、源码路径、工具链路径和详细错误文本。

任何在用户设备执行的 WASM 都可能被反汇编或通过黑盒测试研究。混淆和剥离
只能提高恢复成本，不能提供数学意义上的不可逆保证。需要隐藏到不可交付给客户
的核心逻辑，应部署在受控服务端。
