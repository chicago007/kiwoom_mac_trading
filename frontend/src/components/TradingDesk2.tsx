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
import { changeClass, exchangeLabel, formatKrw, formatPct, formatUsd, sideLabel, trdeLabel } from "@/lib/format";
import { pushRecent } from "@/lib/recent";
import { sessionHint, sessionLabel, useUsSession } from "@/lib/session";
import { useStore } from "@/lib/store";
import { isExchange, resolveExchange } from "@/lib/symbols";
import { useLiveQuote } from "@/lib/useLiveQuote";
import type { Exchange, Side } from "@/lib/types";

type LeftTab = "watch" | "hold";

export function TradingDesk2() {
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
  const [leftTab, setLeftTab] = useState<LeftTab>("watch");
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
  const posQty =
    state.positions.find((p) => p.stkCd === stkCd && p.stexTp === stexTp)?.qty ||
    state.positions.find((p) => p.stkCd === stkCd)?.qty ||
    0;
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

  const fillsHere = state.fills.filter((f) => f.stkCd === stkCd).slice(0, 12);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto lg:overflow-hidden">
      <MarketStrip />
      <div className="grid min-h-[36rem] flex-[5] gap-1 lg:min-h-0 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)_minmax(190px,230px)_minmax(240px,280px)] lg:[&>*]:min-h-0">
        <section className="flex min-h-[18rem] min-w-0 flex-col overflow-hidden lg:min-h-0">
          <div className="flex shrink-0 bg-ink-800/40">
            {(
              [
                ["watch", "관심종목"],
                ["hold", "잔고"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`px-3 py-1 text-xs ${leftTab === id ? "bg-ink-700 text-brass-400" : "text-cream-300 hover:text-cream-50"}`}
                onClick={() => setLeftTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {leftTab === "watch" ? (
              <WatchlistPanel variant="list" onSymbol={pickSymbol} selected={{ stkCd, stexTp }} />
            ) : (
              <HoldingsPanel variant="list" selectOnClick onSymbol={pickSymbol} quote={quote} />
            )}
          </div>
        </section>

        <div className="flex min-h-[22rem] min-w-0 flex-col gap-1 lg:min-h-0">
          <div className="panel flex shrink-0 items-center gap-2 px-2 py-1.5">
            <div className="min-w-[12rem] flex-1">
              <TickerSearch
                showRecent
                value={stkCd}
                onChange={(next) => {
                  setStkCd(next);
                  setExManual(false);
                  const resolved = resolveExchange(next, { items: state.items, positions: state.positions });
                  if (resolved) setStexTp(resolved);
                }}
                onPick={(hit) => pickSymbol(hit.stkCd, hit.stexTp, hit.stkNm)}
              />
            </div>
            {quote && (
              <div className="hidden shrink-0 text-right sm:block">
                <div className="font-mono text-lg leading-none text-brass-400">{formatUsd(quote.last)}</div>
                <div className={`font-mono text-[12px] ${changeClass(quote.change)}`}>
                  {formatUsd(quote.change)} {formatPct(quote.changePct)}
                </div>
              </div>
            )}
          </div>
          <PriceChart
            stkCd={stkCd}
            stexTp={stexTp}
            last={quote?.last}
            quote={quote}
            onPick={(nextPrice) => {
              setPrice(nextPrice);
              setTrdeTp("00");
            }}
          />
        </div>

        <div className="flex min-h-[18rem] min-w-0 flex-col gap-1 lg:min-h-0">
          {quote ? (
            <OrderBook
              slim
              quote={quote}
              onPick={(nextPrice, nextSide) => {
                setPrice(nextPrice);
                setTrdeTp("00");
                if (nextSide) setSide(nextSide);
              }}
            />
          ) : (
            <div className="panel flex min-h-[12rem] items-center justify-center p-4 text-sm text-cream-500 lg:h-full lg:min-h-0">
              {quoteError || "현재가를 불러오는 중…"}
            </div>
          )}
          <section className="panel flex max-h-[10rem] min-h-[6rem] flex-col overflow-hidden lg:max-h-none lg:flex-[0.45]">
            <div className="shrink-0 bg-ink-800/40 px-2 py-1 text-xs font-medium">당일 체결</div>
            <div className="min-h-0 flex-1 overflow-auto">
              {fillsHere.length === 0 ? (
                <p className="px-2 py-3 text-center text-[12px] text-cream-500">이 종목 당일 체결이 없습니다.</p>
              ) : (
                fillsHere.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 border-b border-ink-800 px-2 py-0.5 font-mono text-[12px]">
                    <span className="text-cream-500">{f.at.includes("T") ? f.at.slice(11, 16) : f.at.slice(0, 5)}</span>
                    <span className={f.side === "buy" ? "text-up" : "text-down"}>{sideLabel(f.side)}</span>
                    <span className="ml-auto">{formatUsd(f.price)}</span>
                    <span className="text-cream-300">{f.qty}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <form
          className="panel flex min-h-[22rem] min-w-0 flex-col gap-2 overflow-auto p-2 lg:min-h-0"
          onSubmit={(e) => {
            e.preventDefault();
            if (blocked) return;
            setConfirmOpen(true);
          }}
        >
          <div>
            <p className="text-[12px] text-cream-500">
              {quote ? `${quote.stkCd} · ${exchangeLabel(quote.stexTp)}` : stkCd} · {sessionLabel(session)}
            </p>
            {quote ? (
              <>
                <p className="mt-0.5 font-mono text-2xl leading-none text-brass-400">{formatUsd(quote.last)}</p>
                <p className={`mt-1 font-mono text-[13px] ${changeClass(quote.change)}`}>
                  {formatUsd(quote.change)} {formatPct(quote.changePct)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-cream-500">{quoteError || "현재가 대기"}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              className={`py-2 text-sm font-medium ${side === "buy" ? "bg-up text-white" : "bg-ink-800 text-cream-300"}`}
              onClick={() => setSide("buy")}
            >
              매수
            </button>
            <button
              type="button"
              className={`py-2 text-sm font-medium ${side === "sell" ? "bg-down text-white" : "bg-ink-800 text-cream-300"}`}
              onClick={() => setSide("sell")}
            >
              매도
            </button>
          </div>
          <label className="block text-xs">
            <span className="mb-0.5 flex items-center justify-between text-[12px] text-cream-500">
              <span>수량</span>
              {side === "sell" && posQty > 0 ? (
                <button type="button" className="text-brass-400 hover:underline" onClick={() => setQty(posQty)}>
                  잔고 {posQty}주
                </button>
              ) : ableQty > 0 ? (
                <button type="button" className="text-brass-400 hover:underline" onClick={() => setQty(ableQty)}>
                  가능 {ableQty}주
                </button>
              ) : null}
            </span>
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
          <div className="bg-ink-950 px-2 py-1.5">
            <p className="text-[13px] text-cream-500">예상 총액{trdeTp === "03" ? " (시장가 기준)" : ""}</p>
            <p className="mt-0.5 whitespace-nowrap font-mono text-[13px] leading-tight text-brass-400">
              {notionalUsd ? formatUsd(notionalUsd) : "—"}
              {notionalKrw ? ` ${formatKrw(notionalKrw)}` : ""}
            </p>
            {side === "buy" && state.cashUsd > 0 && (
              <p className="mt-0.5 text-[12px] text-cream-500">예수금 {formatUsd(state.cashUsd)}</p>
            )}
          </div>
          {sessionNote && <p className="text-[12px] text-cream-500">{sessionNote}</p>}
          {overAble && <p className="text-[12px] text-up">가능수량 {ableQty}주를 넘습니다.</p>}
          {overCash && <p className="text-[12px] text-up">예수금보다 총액이 큽니다.</p>}
          <button
            className={`btn w-full py-2 text-sm disabled:pointer-events-none disabled:opacity-40 ${
              blocked ? "btn-ghost" : side === "buy" ? "bg-up text-white hover:brightness-110" : "bg-down text-white hover:brightness-110"
            }`}
            type="submit"
            disabled={blocked}
          >
            {blocked ? "킬스위치 — 주문 중지" : `${sideLabel(side)} 주문`}
          </button>
          {lastError && <p className="text-sm text-up">{lastError.message}</p>}
        </form>
      </div>

      <div className="min-h-[9rem] flex-[1.2] lg:min-h-0">
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
