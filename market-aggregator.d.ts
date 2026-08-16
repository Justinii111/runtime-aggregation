export interface Trade {
  timestamp_ms: number;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  sequence?: number;
  trade_id?: string | number;
}
export interface Candle {
  unix: number;
  open: number;
  high: number;
  low: number;
  close: number;
  vbuy: number;
  vsell: number;
  final: boolean;
}
export interface Footprint {
  unix: number;
  timeframe: number;
  prices: number[];
  buys: number[];
  sells: number[];
  final: boolean;
}
export interface AggregateResult { candles: Candle[]; footprints: Footprint[]; }
export interface AggregationClientOptions {
  integrity?: string | null;
  requestTimeoutMs?: number;
  workerUrl?: string | URL;
}
export class AggregationRuntimeError extends Error { readonly code: string; }
export class AggregationClient {
  static create(source: string | URL | Response | ArrayBuffer | ArrayBufferView, options?: AggregationClientOptions): Promise<AggregationClient>;
  health(): Promise<{ status: 'ready' }>;
  replace(stream: string, config: { symbol: string; tick_size: number; timeframe: number }, trades: Trade[]): Promise<AggregateResult>;
  append(stream: string, symbol: string, trades: Trade[]): Promise<AggregateResult>;
  restart(): Promise<void>;
  close(): void;
}
