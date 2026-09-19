import type { AppState } from "./store";
import type { ChartInterval, ChartPayload, Exchange, MarketItem, Mode, Quote, Settings, TradeRow, WatchlistItem } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const body = JSON.parse(text) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep text */
    }
    throw new Error(detail || `${init?.method ?? "GET"} ${path} ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ version: string; kiwoom: string; error?: string; orders?: string; note?: string }>("/api/health"),
  state: () => request<AppState>("/api/state"),
  addWatchlist: (name: string) => request<AppState>("/api/watchlists", { method: "POST", body: JSON.stringify({ name }) }),
  removeWatchlist: (id: string) => request<AppState>(`/api/watchlists/${id}`, { method: "DELETE" }),
  addItem: (watchlistId: string, item: Omit<WatchlistItem, "id" | "watchlistId" | "enabled">) =>
    request<AppState>(`/api/watchlists/${watchlistId}/items`, { method: "POST", body: JSON.stringify(item) }),
  removeItem: (watchlistId: string, itemId: string) =>
    request<AppState>(`/api/watchlists/${watchlistId}/items/${itemId}`, { method: "DELETE" }),
  toggleItem: (watchlistId: string, itemId: string) =>
    request<AppState>(`/api/watchlists/${watchlistId}/items/${itemId}/toggle`, { method: "POST" }),
  importKiwoom: (watchlistId: string) =>
    request<AppState>(`/api/watchlists/${watchlistId}/import-kiwoom`, { method: "POST" }),
  saveWatchlist: (watchlistId: string) =>
    request<AppState>(`/api/watchlists/${watchlistId}/save`, { method: "POST" }),
  searchSymbols: (q: string) => request<{ results: Array<Omit<WatchlistItem, "id" | "watchlistId" | "enabled">> }>(`/api/symbols/search?q=${encodeURIComponent(q)}`),
  quote: (stkCd: string, stexTp: Exchange, lite = false) =>
    request<Quote>(`/api/quotes?stk_cd=${encodeURIComponent(stkCd)}&stex_tp=${stexTp}${lite ? "&lite=true" : ""}`),
  liveQuote: (stkCd: string, stexTp: Exchange) =>
    request<Quote>(`/api/quotes/live?stk_cd=${encodeURIComponent(stkCd)}&stex_tp=${stexTp}`),
  chart: (stkCd: string, stexTp: Exchange, interval: ChartInterval) =>
    request<ChartPayload>(
      `/api/charts?stk_cd=${encodeURIComponent(stkCd)}&stex_tp=${stexTp}&interval=${interval}`,
    ),
  markets: () => request<{ markets: MarketItem[]; at: number }>("/api/markets"),
  trades: (from: string, to: string, tp = "0", stexTp = "", stkCd = "") =>
    request<{ rows: TradeRow[]; buySum: number; sellSum: number; from: string; to: string; note?: string }>(
      `/api/trades?strt_dt=${from}&end_dt=${to}&tp=${encodeURIComponent(tp)}&stex_tp=${stexTp}&stk_cd=${encodeURIComponent(stkCd)}`,
    ),
  orderable: (stkCd: string, stexTp: Exchange, price: number, side: "buy" | "sell") =>
    request<{ able: number; cashUsd: number; holdQty: number; source: string }>(
      `/api/orders/able?stk_cd=${encodeURIComponent(stkCd)}&stex_tp=${stexTp}&price=${price}&side=${side}`,
    ),
  placeOrder: (order: {
    stkCd: string;
    stexTp: Exchange;
    stkNm?: string;
    side: "buy" | "sell";
    qty: number;
    price: number | null;
    trdeTp: string;
  }) => request<AppState>("/api/orders", { method: "POST", body: JSON.stringify(order) }),
  cancelOrder: (ordNo: string) => request<AppState>(`/api/orders/${ordNo}/cancel`, { method: "POST" }),
  modifyOrder: (ordNo: string, price: number) =>
    request<AppState>(`/api/orders/${ordNo}/modify`, { method: "POST", body: JSON.stringify({ price }) }),
  toggleKill: () => request<AppState>("/api/system/kill", { method: "POST" }),
  setMode: (mode: Mode) => request<AppState>("/api/system/mode", { method: "POST", body: JSON.stringify({ mode }) }),
  updateSettings: (settings: Partial<Settings>) =>
    request<AppState>("/api/system/settings", { method: "PATCH", body: JSON.stringify(settings) }),
};
