import type { Exchange, Position, WatchlistItem } from "./types";

const KNOWN_EXCHANGE: Record<string, Exchange> = {
  NVDA: "ND",
  AAPL: "ND",
  MSFT: "ND",
  AMZN: "ND",
  META: "ND",
  GOOGL: "ND",
  TSLA: "ND",
  AMD: "ND",
  "BRK.B": "NY",
  JPM: "NY",
};

export function isExchange(value: string | null | undefined): value is Exchange {
  return value === "ND" || value === "NY" || value === "NA";
}

export function resolveExchange(
  stkCd: string,
  sources: { items?: WatchlistItem[]; positions?: Position[]; quoteEx?: string | null } = {},
): Exchange | null {
  const code = stkCd.trim().toUpperCase();
  if (!code) return null;

  const items = sources.items?.filter((row) => row.stkCd.toUpperCase() === code) ?? [];
  const preferred = items.find((row) => row.watchlistId !== "wl-holdings") || items[0];
  if (preferred) return preferred.stexTp;

  const position = sources.positions?.find((row) => row.stkCd.toUpperCase() === code);
  if (position) return position.stexTp;

  if (isExchange(sources.quoteEx)) return sources.quoteEx;
  return KNOWN_EXCHANGE[code] ?? null;
}
