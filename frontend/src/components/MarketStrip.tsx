"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { changeClass, formatNum, formatPct } from "@/lib/format";
import type { MarketItem } from "@/lib/types";

function formatMarket(row: MarketItem) {
  if (row.unit === "krw") return `${formatNum(row.last, 2)}원`;
  if (row.unit === "pct") return `${formatNum(row.last, 3)}%`;
  if (row.id === "dji" || row.id === "spx" || row.id === "ixic") return formatNum(row.last, 2);
  return `$${formatNum(row.last, 2)}`;
}

export function MarketStrip() {
  const [rows, setRows] = useState<MarketItem[]>([]);

  useEffect(() => {
    let live = true;
    const load = () => {
      api
        .markets()
        .then((data) => {
          if (live) setRows(data.markets || []);
        })
        .catch(() => {
          /* 지수 실패는 주문화면을 막지 않음 */
        });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!rows.length) return null;

  return (
    <div className="flex shrink-0 gap-3 overflow-x-auto bg-ink-900 px-2 py-1">
      {rows.map((row) => (
        <div key={row.id} className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap text-[12px]" title={row.hint}>
          <span className="text-cream-500">{row.label}</span>
          <span className="font-mono">{formatMarket(row)}</span>
          <span className={`font-mono ${changeClass(row.change || row.changePct)}`}>
            {row.change > 0 ? "+" : ""}
            {row.unit === "krw" ? formatNum(row.change, 2) : formatNum(row.change, row.unit === "pct" ? 3 : 2)} {formatPct(row.changePct)}
          </span>
        </div>
      ))}
    </div>
  );
}
