"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { changeClass, exchangeLabel, formatPct, formatQty, formatUsd } from "@/lib/format";
import type { BookLevel, Quote, Side } from "@/lib/types";

type Props = {
  quote: Quote;
  onPick: (price: number, side?: Side) => void;
  compact?: boolean;
};

export function OrderBook({ quote, onPick, compact = false }: Props) {
  const asks = saneLevels(quote, "ask");
  const bids = saneLevels(quote, "bid");
  const maxQty = Math.max(...asks.map((l) => l.qty), ...bids.map((l) => l.qty), 1);
  const last =
    quote.last ||
    (quote.bid && quote.ask ? (quote.bid + quote.ask) / 2 : quote.bid || quote.ask || 0);
  const resetKey = `${quote.stkCd}-${quote.stexTp}`;

  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <div className={`shrink-0 bg-ink-800/40 ${compact ? "px-2 py-1" : "px-3 py-2"}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-cream-500">호가창 · {exchangeLabel(quote.stexTp)}</p>
            <h2 className={`font-semibold ${compact ? "text-base" : "text-lg"}`}>
              {quote.stkCd} <span className="text-sm font-normal text-cream-300">{quote.stkNm}</span>
            </h2>
          </div>
          <p className={`text-[13px] ${quote.bookLive ? "text-brass-400" : "text-cream-500"}`}>
            {quote.bookLive ? "실시간 10호가" : asks.length || bids.length ? "10호가" : quote.source === "kiwoom" ? "실시간 호가 대기" : "목업 호가"}
          </p>
        </div>
        {!compact && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <Stat label="시가" value={formatUsd(quote.open)} />
            <Stat label="고가" value={formatUsd(quote.high)} />
            <Stat label="저가" value={formatUsd(quote.low)} />
            <Stat label="전일종가" value={formatUsd(quote.prevClose)} />
            <Stat label="매수호가" value={`${formatUsd(quote.bid)} · ${formatQty(quote.bidQty)}`} tone="down" />
            <Stat label="매도호가" value={`${formatUsd(quote.ask)} · ${formatQty(quote.askQty)}`} tone="up" />
            <Stat label="거래량" value={formatQty(quote.volume)} />
            <Stat label="스프레드" value={formatUsd(Math.max(0, quote.ask - quote.bid))} />
          </dl>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-[minmax(40px,1fr)_minmax(6.75rem,auto)_minmax(40px,1fr)] bg-ink-800 px-1 py-0.5 text-[12px] text-cream-500">
        <div className="text-right">매도</div>
        <div className="text-center">호가</div>
        <div>매수</div>
      </div>

      <StickPane stick="bottom" resetKey={resetKey}>
        {asks.length === 0 ? (
          <p className="px-2 py-4 text-center text-[13px] text-cream-500">{quote.bookNote || "매도호가 대기"}</p>
        ) : (
          asks.map((level) => (
            <BookRow
              key={`a-${level.price}`}
              kind="ask"
              level={level}
              base={quote.prevClose || quote.last}
              maxQty={maxQty}
              onPrice={() => onPick(level.price)}
              onQty={() => onPick(level.price, "sell")}
            />
          ))
        )}
      </StickPane>

      <button
        type="button"
        className="shrink-0 bg-ink-950 px-2 py-1 text-center"
        onClick={() => last && onPick(last)}
      >
        <span className="font-mono text-sm leading-none text-brass-400">{formatUsd(last)}</span>
        <span className={`ml-2 font-mono text-[13px] ${changeClass(quote.change)}`}>
          {formatUsd(quote.change)} {formatPct(quote.changePct)}
        </span>
      </button>

      <StickPane stick="top" resetKey={resetKey}>
        {bids.length === 0 ? (
          <p className="px-2 py-4 text-center text-[13px] text-cream-500">매수호가 대기</p>
        ) : (
          bids.map((level) => (
            <BookRow
              key={`b-${level.price}`}
              kind="bid"
              level={level}
              base={quote.prevClose || quote.last}
              maxQty={maxQty}
              onPrice={() => onPick(level.price)}
              onQty={() => onPick(level.price, "buy")}
            />
          ))
        )}
      </StickPane>
    </div>
  );
}

function StickPane({ stick, resetKey, children }: { stick: "top" | "bottom"; resetKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const keep = useRef(true);

  useEffect(() => {
    keep.current = true;
  }, [resetKey]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !keep.current) return;
    el.scrollTop = stick === "bottom" ? el.scrollHeight : 0;
  }, [children, stick]);

  return (
    <div
      ref={ref}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      onScroll={() => {
        const el = ref.current;
        if (!el) return;
        if (stick === "bottom") keep.current = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
        else keep.current = el.scrollTop < 12;
      }}
    >
      <div className={stick === "bottom" ? "mt-auto" : undefined}>{children}</div>
    </div>
  );
}

function saneLevels(quote: Quote, side: "ask" | "bid") {
  const rows = [...(side === "ask" ? quote.asks : quote.bids)].filter((row) => row.price > 0).sort((a, b) => b.price - a.price);
  const last = quote.last || (quote.bid && quote.ask ? (quote.bid + quote.ask) / 2 : quote.bid || quote.ask || 0);
  if (!last || rows.length === 0) return rows;
  const best = side === "ask" ? rows[rows.length - 1] : rows[0];
  if (Math.abs(best.price - last) / last > 0.15) return [];
  return rows;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-cream-50";
  return (
    <div>
      <dt className="text-cream-500">{label}</dt>
      <dd className={`font-mono ${color}`}>{value}</dd>
    </div>
  );
}

function BookRow({
  kind,
  level,
  base,
  maxQty,
  onPrice,
  onQty,
}: {
  kind: "ask" | "bid";
  level: BookLevel;
  base: number;
  maxQty: number;
  onPrice: () => void;
  onQty: () => void;
}) {
  const width = `${Math.max(8, (level.qty / maxQty) * 100)}%`;
  const bar = kind === "ask" ? "bg-up/20" : "bg-down/20";
  const qtyColor = kind === "ask" ? "text-up" : "text-down";
  const pct = base ? ((level.price - base) / base) * 100 : 0;
  const vs = changeClass(pct);
  return (
    <div className="grid grid-cols-[minmax(40px,1fr)_minmax(6.75rem,auto)_minmax(40px,1fr)] items-center px-1 hover:bg-ink-800">
      <div className="relative h-5">
        {kind === "ask" && (
          <button type="button" onClick={onQty} className="absolute inset-0 flex items-center justify-end">
            <span className={`absolute inset-y-0 right-0 ${bar}`} style={{ width }} />
            <span className={`relative pr-1 font-mono text-[12px] ${qtyColor}`}>{formatQty(level.qty)}</span>
          </button>
        )}
      </div>
      <button type="button" onClick={onPrice} className={`flex items-baseline justify-center gap-1 whitespace-nowrap ${vs}`}>
        <span className="font-mono text-xs">{level.price.toFixed(level.price < 1 ? 4 : 2)}</span>
        <span className="font-mono text-[12px]">{base ? formatPct(pct) : ""}</span>
      </button>
      <div className="relative h-5">
        {kind === "bid" && (
          <button type="button" onClick={onQty} className="absolute inset-0 flex items-center justify-start">
            <span className={`absolute inset-y-0 left-0 ${bar}`} style={{ width }} />
            <span className={`relative pl-1 font-mono text-[12px] ${qtyColor}`}>{formatQty(level.qty)}</span>
          </button>
        )}
      </div>
    </div>
  );
}
