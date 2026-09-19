import type { Exchange, Side } from "./types";

export function formatUsd(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(value))}원`;
}

export function formatQty(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatSignedUsd(value: number, digits = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatUsd(value, digits)}`;
}

export function formatVol(value: number) {
  if (!value) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatQty(value);
}

export function formatNum(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function changeClass(value: number) {
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-cream-300";
}

export function exchangeLabel(code: Exchange) {
  return { ND: "NASDAQ", NY: "NYSE", NA: "AMEX" }[code];
}

export function sideLabel(side: Side) {
  return side === "buy" ? "매수" : "매도";
}

export function trdeLabel(code: string) {
  const map: Record<string, string> = {
    "00": "지정가",
    "03": "시장가",
    "30": "LOC",
    "33": "MOC",
  };
  return map[code] ?? code;
}

export const PRESET_META = {
  close_loc: { group: "종가", name: "종가 지정 매수 (LOC)" },
  close_breakout: { group: "종가", name: "전일 종가 상향 돌파" },
  close_breakdown: { group: "종가", name: "전일 종가 하향 이탈" },
  open_market: { group: "시초가", name: "시초 시장가" },
  gap_up_buy: { group: "시초가", name: "갭상승 매수" },
  gap_down_buy: { group: "시초가", name: "갭하락 매수" },
} as const;
