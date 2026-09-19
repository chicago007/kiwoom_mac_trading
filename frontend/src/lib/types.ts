export type Mode = "real" | "demo";
export type Side = "buy" | "sell";
export type Exchange = "ND" | "NY" | "NA";
export type OrderStatus = "pending" | "partial" | "filled" | "cancelled" | "rejected";

export type Watchlist = {
  id: string;
  name: string;
  source: "app" | "kiwoom_import" | "holdings";
  gcod?: string;
};

export type WatchlistItem = {
  id: string;
  watchlistId: string;
  stkCd: string;
  stexTp: Exchange;
  stkNm: string;
  last: number;
  prevClose: number;
  open: number;
  changePct: number;
  enabled: boolean;
};

export type Order = {
  id: string;
  ordNo: string;
  stkCd: string;
  stexTp: Exchange;
  stkNm: string;
  side: Side;
  qty: number;
  price: number | null;
  trdeTp: string;
  status: OrderStatus;
  createdAt: string;
};

export type Position = {
  stkCd: string;
  stexTp: Exchange;
  stkNm: string;
  qty: number;
  avgPrice: number;
  last: number;
  prevClose?: number;
  fxUsdKrw?: number;
  avgPriceKrw?: number;
  lastKrw?: number;
  valueKrw?: number;
  pnl?: number;
  pnlKrw?: number;
  plRt?: number;
  changePct?: number;
};

export type Fill = {
  id: string;
  ordNo: string;
  stkCd: string;
  stkNm: string;
  side: Side;
  qty: number;
  price: number;
  at: string;
};

export type LogLevel = "info" | "warn" | "block" | "error";

export type AppLog = {
  id: string;
  at: string;
  level: LogLevel;
  source: string;
  message: string;
  code?: string;
};

export type Settings = {
  dailyLossLimitUsd: number;
  maxQtyPerSymbol: number;
  maxNotionalUsd: number;
  notifyTelegram: boolean;
};

export type BookLevel = {
  price: number;
  qty: number;
};

export type Quote = {
  stkCd: string;
  stkNm: string;
  stexTp: Exchange;
  last: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  asks: BookLevel[];
  bids: BookLevel[];
  source?: "kiwoom" | "mock";
  bookNote?: string;
  halted?: boolean;
  bookLive?: boolean;
  fxUsdKrw?: number;
};

export type ChartInterval = "1" | "5" | "D";

export type ChartBar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type ChartPayload = {
  stkCd: string;
  stexTp: Exchange;
  interval: string;
  source?: "kiwoom" | "mock";
  bars: ChartBar[];
  note?: string;
};

export type MarketItem = {
  id: string;
  label: string;
  hint: string;
  stkCd?: string;
  stexTp?: Exchange;
  last: number;
  change: number;
  changePct: number;
  unit: "usd" | "krw" | "pct";
  source?: string;
};

export type TradeRow = {
  dealDt: string;
  procTime: string;
  kind: string;
  remark: string;
  stkCd: string;
  stkNm: string;
  qty: number;
  priceFx: number;
  amountUsd: number;
  amountKrw: number;
  feeUsd: number;
  taxUsd: number;
  taxKrw: number;
  settleUsd: number;
  settleKrw: number;
  cashUsd: number;
  cashKrw: number;
  media: string;
  dealNo: string;
  stexNm: string;
  crnc: string;
};
