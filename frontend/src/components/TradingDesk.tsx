"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ActivityPanel } from "@/components/ActivityPanel";
import { HoldingsPanel } from "@/components/HoldingsPanel";
import { OrderBook } from "@/components/OrderBook";
import { PriceChart } from "@/components/PriceChart";
import { TickerSearch } from "@/components/TickerSearch";
import { MarketStrip } from "@/components/MarketStrip";
import { WatchlistPanel } from "@/components/WatchlistPanel";
import { api } from "@/lib/api";
import { exchangeLabel, formatKrw, formatUsd, sideLabel, trdeLabel } from "@/lib/format";
import { pushRecent } from "@/lib/recent";
import { sessionHint, sessionLabel, useUsSession } from "@/lib/session";
import { useStore } from "@/lib/store";
import { isExchange, resolveExchange } from "@/lib/symbols";
import { useLiveQuote } from "@/lib/useLiveQuote";
import type { Exchange, Side } from "@/lib/types";

export function TradingDesk() {
  const search = useSearchParams();
  const { state, dispatch } = useStore();
  const initialStk = (search.get("stk") || "NVDA").toUpperCase();
  const initialEx = isExchange(search.get("ex")) ? (search.get("ex") as Exchange) : null;

  const [stkCd, setStkCd] = useState(initialStk);
  const [stexTp, setStexTp] = useState<Exchange>(
    initialEx ?? resolveExchange(initialStk, { items: state.items, positions: state.positions }) ?? "ND",
  );
  const [exManual, setExManual] = useState(false);
  const [side, setSide] = useState<Side>("buy");
  const [qty, setQty] = useState(1);
  const [trdeTp, setTrdeTp] = useState("00");
  const [price, setPrice] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [modifyId, setModifyId] = useState<string | null>(null);
  const [modifyPrice, setModifyPrice] = useState(0);
  const [able, setAble] = useState<{ able: number; cashUsd: number; holdQty: number } | null>(null);
  const primedRef = useRef("");
  const session = useUsSession();
  const sessionNote = sessionHint(session);

  const { quote, quoteError } = useLiveQuote(stkCd, stexTp, exManual, (ex) => {
    if (!exManual) setStexTp(ex);
  });

  useEffect(() => {
    const stk = (search.get("stk") || stkCd).toUpperCase();
    const fromQuery = isExchange(search.get("ex")) ? (search.get("ex") as Exchange) : null;
    const resolved = resolveExchange(stk, { items: state.items, positions: state.positions });
    setStkCd(stk);
    setStexTp(fromQuery ?? resolved ?? stexTp);
    setExManual(false);
    primedRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!quote) return;
    const key = `${quote.stkCd}-${quote.stexTp}`;
    if (primedRef.current !== key) {
      primedRef.current = key;
      setPrice(quote.ask || quote.last || 0);
    }
  }, [quote]);

  const fx = quote?.fxUsdKrw || state.fxUsdKrw || 0;
  const unitPrice =
    trdeTp === "03"
      ? side === "buy"
        ? quote?.ask || quote?.last || 0
        : quote?.bid || quote?.last || 0
      : price;
  const notionalUsd = Math.max(0, qty) * (unitPrice || 0);
  const notionalKrw = fx ? notionalUsd * fx : 0;
  const lastError = state.logs.find((row) => row.level === "error");
  const posQty = state.positions.find((p) => p.stkCd === stkCd && p.stexTp === stexTp)?.qty || 0;
  const cashAble = unitPrice > 0 ? Math.floor(state.cashUsd / unitPrice) : 0;
  const ableQty = able?.able ?? (side === "sell" ? posQty : cashAble);
  const overAble = ableQty > 0 && qty > ableQty;
  const overCash = side === "buy" && notionalUsd > 0 && state.cashUsd > 0 && notionalUsd > state.cashUsd;
  const blocked = state.killSwitch;
  const confirmBody = `종목 ${stkCd} (${exchangeLabel(stexTp)})\n${sideLabel(side)} ${qty}주 · ${trdeLabel(trdeTp)}${
    trdeTp === "03" ? "" : ` · ${formatUsd(price)}`
  }\n총액 ${formatUsd(notionalUsd)}${notionalKrw ? ` · ${formatKrw(notionalKrw)}` : ""}${
    fx ? `\n환율 ${fx.toFixed(2)}원/$` : ""
  }\n세션 ${sessionLabel(session)}${
    sessionNote ? `\n${sessionNote}` : ""
  }\n모드 ${state.mode.toUpperCase()}${state.ordersLive ? "\n키움 실주문입니다." : "\n주문은 아직 목업입니다."}${
    overAble ? `\n가능수량 ${ableQty}주를 넘습니다.` : ""
  }${overCash ? "\n예수금보다 총액이 큽니다." : ""}`;

  useEffect(() => {
    if (!stkCd || unitPrice <= 0) {
      setAble(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      api
        .orderable(stkCd, stexTp, unitPrice, side)
        .then((next) => {
          if (live) setAble(next);
        })
        .catch(() => {
          if (live) setAble(null);
        });
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [stkCd, stexTp, unitPrice, side]);

  function pickSymbol(next: string, ex: Exchange, name?: string) {
    pushRecent({ stkCd: next, stexTp: ex, stkNm: name || next });
    setStkCd(next);
    setStexTp(ex);
    setExManual(false);
    primedRef.current = "";
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto lg:overflow-hidden">
      <MarketStrip />
      <div className="grid min-h-[36rem] flex-[3] gap-1 lg:min-h-0 lg:grid-cols-[minmax(260px,320px)_minmax(280px,320px)_minmax(0,1fr)] lg:[&>*]:min-h-0">
        {quote ? (
          <OrderBook
            compact
            quote={quote}
            onPick={(nextPrice, nextSide) => {
              setPrice(nextPrice);
              setTrdeTp("00");
              if (nextSide) setSide(nextSide);
            }}
          />
        ) : (
          <div className="panel flex min-h-[22rem] items-center justify-center p-6 text-sm text-cream-500 lg:h-full lg:min-h-0">
            {quoteError || "현재가를 불러오는 중…"}
          </div>
        )}

        <div className="flex min-h-[22rem] min-w-0 flex-col gap-1 lg:min-h-0">
          <form
            className="panel flex shrink-0 flex-col gap-1.5 overflow-visible p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (blocked) return;
              setConfirmOpen(true);
            }}
          >
          <div className="min-w-0 text-xs">
            <span className="mb-0.5 block truncate text-[12px] text-cream-500">
              티커{quote ? ` · ${exchangeLabel(quote.stexTp)}` : ""} · {sessionLabel(session)}
            </span>
            <TickerSearch
              showRecent
              value={stkCd}
              onChange={(next) => {
                setStkCd(next);
                setExManual(false);
                const resolved = resolveExchange(next, { items: state.items, positions: state.positions });
                if (resolved) setStexTp(resolved);
              }}
              onPick={(hit) => {
                setStkCd(hit.stkCd);
                setStexTp(hit.stexTp);
                setExManual(false);
                primedRef.current = "";
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <label className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="w-8 shrink-0 text-[12px] text-cream-500">구분</span>
              <select className="field min-w-0 flex-1" value={side} onChange={(e) => setSide(e.target.value as Side)}>
                <option value="buy">매수</option>
                <option value="sell">매도</option>
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="w-8 shrink-0 text-[12px] text-cream-500">수량</span>
              <input className="field min-w-0 flex-1" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
              {ableQty > 0 && (
                <button type="button" className="shrink-0 text-[12px] text-brass-400 hover:underline" onClick={() => setQty(ableQty)}>
                  {ableQty}
                </button>
              )}
            </label>
            <label className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="w-8 shrink-0 text-[12px] text-cream-500">유형</span>
              <select className="field min-w-0 flex-1" value={trdeTp} onChange={(e) => setTrdeTp(e.target.value)}>
                <option value="00">지정가</option>
                <option value="03">시장가</option>
                <option value="30">LOC</option>
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="w-8 shrink-0 text-[12px] text-cream-500">가격</span>
              <input
                className="field min-w-0 flex-1"
                type="number"
                step="0.01"
                disabled={trdeTp === "03"}
                value={trdeTp === "03" ? "" : price}
                placeholder={trdeTp === "03" ? "시장가" : undefined}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1 bg-ink-950 px-2 py-1">
              <p className="truncate font-mono text-[13px] leading-tight text-brass-400">
                {notionalUsd ? formatUsd(notionalUsd) : "—"}
                {notionalKrw ? ` ${formatKrw(notionalKrw)}` : ""}
                {fx ? ` · ${fx.toFixed(2)}원/$` : ""}
                {trdeTp === "03" ? " · 시장가" : ""}
              </p>
              {side === "buy" && state.cashUsd > 0 && (
                <p className="truncate text-[12px] text-cream-500">예수금 {formatUsd(state.cashUsd)}</p>
              )}
              {side === "sell" && posQty > 0 && <p className="truncate text-[12px] text-cream-500">보유 {posQty}주</p>}
            </div>
            <button className="btn btn-primary shrink-0 px-4 disabled:pointer-events-none disabled:opacity-40" type="submit" disabled={blocked}>
              {blocked ? "킬스위치 — 주문 중지" : "주문"}
            </button>
          </div>
          {sessionNote && <p className="text-[12px] text-cream-500">{sessionNote}</p>}
          {overAble && <p className="text-[12px] text-up">가능수량 {ableQty}주를 넘습니다.</p>}
          {overCash && <p className="text-[12px] text-up">예수금보다 총액이 큽니다.</p>}
          {lastError && <p className="text-sm text-up">{lastError.message}</p>}
        </form>
        <PriceChart
          stkCd={stkCd}
          stexTp={stexTp}
          last={quote?.last}
          onPick={(nextPrice) => {
            setPrice(nextPrice);
            setTrdeTp("00");
          }}
        />
        </div>

        <HoldingsPanel compact selectOnClick onSymbol={pickSymbol} quote={quote} />
      </div>

      <div className="grid min-h-[14rem] flex-[2] gap-1 lg:min-h-0 lg:grid-cols-2 lg:[&>*]:min-h-0">
        <WatchlistPanel onSymbol={pickSymbol} selected={{ stkCd, stexTp }} />
        <ActivityPanel
          fallbackPrice={quote?.last || 0}
          onModify={(id, nextPrice) => {
            setModifyId(id);
            setModifyPrice(nextPrice);
          }}
          onCancel={setCancelId}
        />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="이 주문을 접수할까요?"
        body={confirmBody}
        confirmLabel="접수"
        danger={state.ordersLive && state.mode === "real"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          dispatch({
            type: "placeOrder",
            order: {
              stkCd,
              stexTp,
              stkNm: quote?.stkNm || stkCd,
              side,
              qty,
              price: trdeTp === "03" ? null : price,
              trdeTp,
            },
          });
          setConfirmOpen(false);
        }}
      />
      <ConfirmDialog
        open={Boolean(modifyId)}
        title="주문 단가를 정정할까요?"
        body="키움 미국주식 정정은 원주문 단가 정정입니다. 새 주문번호가 발급됩니다."
        confirmLabel="정정"
        extra={
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-cream-500">정정 단가 (USD)</span>
            <input className="field" type="number" step="0.01" value={modifyPrice} onChange={(e) => setModifyPrice(Number(e.target.value))} />
          </label>
        }
        onCancel={() => setModifyId(null)}
        onConfirm={() => {
          if (modifyId && modifyPrice > 0) dispatch({ type: "modifyOrder", id: modifyId, price: modifyPrice });
          setModifyId(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(cancelId)}
        title="미체결을 취소할까요?"
        body="키움 미국주식 취소는 원주문 전량 취소입니다."
        confirmLabel="전량 취소"
        danger
        onCancel={() => setCancelId(null)}
        onConfirm={() => {
          if (cancelId) dispatch({ type: "cancelOrder", id: cancelId });
          setCancelId(null);
        }}
      />
    </div>
  );
}
