"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FillsPanel } from "@/components/FillsPanel";
import { HoldingsPanel } from "@/components/HoldingsPanel";
import { OrderBook } from "@/components/OrderBook";
import { OrdersPanel } from "@/components/OrdersPanel";
import { PriceChart } from "@/components/PriceChart";
import { exchangeLabel, formatKrw, formatUsd, sideLabel, trdeLabel } from "@/lib/format";
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
  const primedRef = useRef("");

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
  const confirmBody = `종목 ${stkCd} (${exchangeLabel(stexTp)})\n${sideLabel(side)} ${qty}주 · ${trdeLabel(trdeTp)}${
    trdeTp === "03" ? "" : ` · ${formatUsd(price)}`
  }\n총액 ${formatUsd(notionalUsd)}${notionalKrw ? ` · ${formatKrw(notionalKrw)}` : ""}${
    fx ? `\n환율 ${fx.toFixed(2)}원/$` : ""
  }\n모드 ${state.mode.toUpperCase()}${state.ordersLive ? "\n키움 실주문입니다." : "\n주문은 아직 목업입니다."}${
    state.killSwitch ? "\n킬스위치가 켜져 있으면 접수가 거절됩니다." : ""
  }`;
  const lastError = state.logs.find((row) => row.level === "error");

  function pickSymbol(next: string, ex: Exchange) {
    setStkCd(next);
    setStexTp(ex);
    setExManual(false);
    primedRef.current = "";
  }

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col gap-1 md:h-[calc(100dvh-3.25rem)]">
      <div className="grid min-h-0 flex-[1.35] gap-1 xl:grid-cols-[minmax(240px,300px)_330px_minmax(0,1fr)] xl:[&>*]:min-h-0">
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
          <div className="panel flex h-full min-h-[18rem] items-center justify-center p-6 text-sm text-cream-500 xl:min-h-0">
            {quoteError || "현재가를 불러오는 중…"}
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-col gap-1">
          <form
            className="panel flex shrink-0 flex-col gap-1.5 overflow-hidden p-2"
            onSubmit={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
          <label className="block text-xs">
            <span className="mb-0.5 block text-[12px] text-cream-500">티커</span>
            <input
              className="field uppercase"
              value={stkCd}
              onChange={(e) => {
                const next = e.target.value.toUpperCase();
                setStkCd(next);
                setExManual(false);
                const resolved = resolveExchange(next, { items: state.items, positions: state.positions });
                if (resolved) setStexTp(resolved);
              }}
            />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block text-xs">
              <span className="mb-0.5 block text-[12px] text-cream-500">구분</span>
              <select className="field" value={side} onChange={(e) => setSide(e.target.value as Side)}>
                <option value="buy">매수</option>
                <option value="sell">매도</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-[12px] text-cream-500">수량</span>
              <input className="field" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-[12px] text-cream-500">유형</span>
              <select className="field" value={trdeTp} onChange={(e) => setTrdeTp(e.target.value)}>
                <option value="00">지정가</option>
                <option value="03">시장가</option>
                <option value="30">LOC</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-[12px] text-cream-500">가격 (USD)</span>
              <input
                className="field"
                type="number"
                step="0.01"
                disabled={trdeTp === "03"}
                value={trdeTp === "03" ? "" : price}
                placeholder={trdeTp === "03" ? "시장가" : undefined}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="bg-ink-950 px-2 py-1.5">
            <p className="text-[13px] text-cream-500">예상 총액{trdeTp === "03" ? " (시장가 기준)" : ""}</p>
            <p className="mt-0.5 whitespace-nowrap font-mono text-[13px] leading-tight text-brass-400">
              {notionalUsd ? formatUsd(notionalUsd) : "—"}
              {notionalKrw ? ` ${formatKrw(notionalKrw)}` : ""}
              {fx ? ` · ${fx.toFixed(2)}원/$` : ""}
            </p>
          </div>
          {quote && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className="btn btn-ghost !py-1 !text-down"
                onClick={() => {
                  setSide("buy");
                  setPrice(quote.bid);
                  setTrdeTp("00");
                }}
              >
                매수 {formatUsd(quote.bid)}
              </button>
              <button
                type="button"
                className="btn btn-ghost !py-1 !text-up"
                onClick={() => {
                  setSide("sell");
                  setPrice(quote.ask);
                  setTrdeTp("00");
                }}
              >
                매도 {formatUsd(quote.ask)}
              </button>
            </div>
          )}
          <button className="btn btn-primary w-full" type="submit">
            주문 검토
          </button>
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

      <div className="grid min-h-0 flex-1 gap-1 lg:grid-cols-2 lg:[&>*]:min-h-0">
        <OrdersPanel
          compact
          fallbackPrice={quote?.last || 0}
          onModify={(id, nextPrice) => {
            setModifyId(id);
            setModifyPrice(nextPrice);
          }}
          onCancel={setCancelId}
        />
        <FillsPanel compact />
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
