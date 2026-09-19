"use client";

import { useMemo, useState } from "react";
import { changeClass, formatKrw, formatPct, formatUsd } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Exchange, Position, Quote } from "@/lib/types";

type Currency = "USD" | "KRW";
type PosKey = "stkCd" | "qty" | "avgPrice" | "last" | "value" | "pnl" | "pct";

type Props = {
  compact?: boolean;
  onSymbol?: (stkCd: string, stexTp: Exchange) => void;
  selectOnClick?: boolean;
  quote?: Quote | null;
};

export function HoldingsPanel({ compact = false, onSymbol, selectOnClick = false, quote = null }: Props) {
  const { state } = useStore();
  const [currency, setCurrency] = useState<Currency>("USD");
  const [sortKey, setSortKey] = useState<PosKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const fx = state.fxUsdKrw || 0;

  const rows = useMemo(() => {
    const mapped = state.positions.map((p) => rowOf(p, fx, quote));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...mapped].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [state.positions, fx, sortKey, sortDir, quote]);

  const totalUsd = rows.reduce((sum, r) => sum + r.value, 0);
  const totalKrw = rows.reduce((sum, r) => sum + r.valueKrw, 0);
  const money = (usd: number, krw: number) => (currency === "KRW" ? formatKrw(krw || usd * fx) : formatUsd(usd));
  const cashKrwFromUsd = fx ? state.cashUsd * fx : 0;
  const netUsd = state.cashUsd + totalUsd;
  const netKrw = cashKrwFromUsd + totalKrw;

  function toggle(key: PosKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "stkCd" ? "asc" : "desc");
    }
  }

  const mark = (key: PosKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <section className={`panel flex min-h-0 flex-col overflow-hidden ${compact ? "h-full min-h-[18rem] xl:min-h-0" : "flex-1"}`}>
      <div className="flex shrink-0 items-center gap-2 bg-ink-800/40 px-2 py-1">
        <span className="shrink-0 font-medium">잔고</span>
        <p className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[13px] text-cream-500">
          예수금{" "}
          <span className="text-brass-400">
            {currency === "KRW" && cashKrwFromUsd ? formatKrw(cashKrwFromUsd) : formatUsd(state.cashUsd)}
          </span>
          {" · "}주식총평가금액 {money(totalUsd, totalKrw)}
          {" · "}합계 {money(netUsd, netKrw)}
        </p>
        <div className="flex shrink-0 gap-1">
          {(["USD", "KRW"] as const).map((code) => (
            <button
              key={code}
              type="button"
              className={`px-1.5 py-0.5 text-[12px] ${currency === code ? "bg-brass-500 text-ink-950" : "bg-ink-800 text-cream-300"}`}
              onClick={() => setCurrency(code)}
            >
              {code === "USD" ? "달러" : "원화"}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={`data ${compact ? "tight" : ""} w-full table-fixed`}>
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[8%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-ink-800">
            <tr>
              <SortHead label="종목" mark={mark("stkCd")} onClick={() => toggle("stkCd")} />
              <SortHead label="수량" mark={mark("qty")} onClick={() => toggle("qty")} align="right" />
              <SortHead label="편입가" mark={mark("avgPrice")} onClick={() => toggle("avgPrice")} align="right" />
              <SortHead label="현재가" mark={mark("last")} onClick={() => toggle("last")} align="right" />
              <SortHead label="평가" mark={mark("value")} onClick={() => toggle("value")} align="right" />
              <SortHead label="손익" mark={mark("pnl")} onClick={() => toggle("pnl")} align="right" />
              <SortHead label="수익률" mark={mark("pct")} onClick={() => toggle("pct")} align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.stexTp}-${r.stkCd}`}
                className={onSymbol ? "cursor-pointer hover:bg-ink-800" : undefined}
                onClick={selectOnClick && onSymbol ? () => onSymbol(r.stkCd, r.stexTp) : undefined}
                onDoubleClick={!selectOnClick && onSymbol ? () => onSymbol(r.stkCd, r.stexTp) : undefined}
                title={onSymbol ? (selectOnClick ? "클릭하면 주문 종목으로" : "더블클릭하면 주문") : undefined}
              >
                <td className="max-w-0">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className="shrink-0 font-medium">{r.stkCd}</span>
                    <span className="min-w-0 truncate text-[13px] text-cream-500">{r.stkNm}</span>
                    <span className={`shrink-0 font-mono text-[13px] ${changeClass(r.lastPct)}`}>{formatPct(r.lastPct)}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap !text-right font-mono">{r.qty}</td>
                <td className="whitespace-nowrap !text-right font-mono">{money(r.avgPrice, r.avgPriceKrw)}</td>
                <td className="whitespace-nowrap !text-right font-mono text-brass-400">{money(r.last, r.lastKrw)}</td>
                <td className="whitespace-nowrap !text-right font-mono">{money(r.value, r.valueKrw)}</td>
                <td className={`whitespace-nowrap !text-right font-mono ${changeClass(currency === "KRW" ? r.pnlKrw : r.pnl)}`}>
                  {money(r.pnl, r.pnlKrw)}
                </td>
                <td className={`whitespace-nowrap !text-right font-mono ${changeClass(currency === "KRW" ? r.pctKrw : r.pct)}`}>
                  {formatPct(currency === "KRW" ? r.pctKrw : r.pct)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-cream-500">
                  보유 종목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortHead({ label, mark, onClick, align = "left" }: { label: string; mark: string; onClick: () => void; align?: "left" | "right" }) {
  return (
    <th className={align === "right" ? "!text-right" : undefined}>
      <button
        type="button"
        className={`cursor-pointer font-medium hover:text-brass-400 ${align === "right" ? "w-full text-right" : "text-left"}`}
        onClick={onClick}
      >
        {label}
        {mark}
      </button>
    </th>
  );
}

function rowOf(p: Position, fx: number, quote?: Quote | null) {
  const live = quote && quote.stkCd === p.stkCd && quote.last ? quote : null;
  const last = live?.last || p.last;
  const deltaQty = (last - p.last) * p.qty;
  const booked = p.pnl ?? (p.last - p.avgPrice) * p.qty;
  const pnl = booked + deltaQty;
  const rate = p.fxUsdKrw || fx;
  const avgKrw = p.avgPriceKrw || p.avgPrice * rate;
  const lastKrw = last * rate;
  const bookedKrw = p.pnlKrw ?? booked * rate;
  const pnlKrw = bookedKrw + deltaQty * rate;
  const cost = p.avgPrice * p.qty;
  const pct = cost ? (pnl / cost) * 100 : p.plRt || 0;
  const costKrw = avgKrw * p.qty;
  const pctKrw = costKrw ? (pnlKrw / costKrw) * 100 : pct;
  const prev = live?.prevClose || p.prevClose || 0;
  const lastPct = prev ? ((last - prev) / prev) * 100 : live?.changePct || p.changePct || 0;
  const value = p.qty * last;
  return {
    ...p,
    last,
    value,
    pnl,
    pct,
    pctKrw,
    lastPct,
    avgPriceKrw: avgKrw,
    lastKrw,
    valueKrw: value * rate,
    pnlKrw,
  };
}
