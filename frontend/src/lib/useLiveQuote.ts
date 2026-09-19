"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { isExchange } from "@/lib/symbols";
import type { Exchange, Quote } from "@/lib/types";

const TICKER = /^[A-Z][A-Z0-9.]{0,9}$/;

export function useLiveQuote(stkCd: string, stexTp: Exchange, exManual: boolean, onResolvedEx?: (ex: Exchange) => void) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const onResolvedExRef = useRef(onResolvedEx);
  onResolvedExRef.current = onResolvedEx;
  const stexRef = useRef(stexTp);
  stexRef.current = stexTp;

  useEffect(() => {
    let live = true;
    let stream: EventSource | null = null;
    const code = stkCd.trim().toUpperCase();
    if (!TICKER.test(code)) {
      setQuote(null);
      setQuoteError(code ? "종목코드를 영문으로 입력하세요." : "");
      return () => {
        live = false;
      };
    }

    setQuote((prev) => (prev?.stkCd === code ? prev : null));
    setQuoteError("");

    const apply = (data: Quote) => {
      if (!live) return;
      const incoming = String(data.stkCd || code).toUpperCase();
      if (incoming && incoming !== code) return;
      data = { ...data, stkCd: code };
      setQuote((prev) => mergeQuote(prev, data));
      if (data.last || data.asks?.length || data.bids?.length) setQuoteError("");
      if (!exManual && isExchange(data.stexTp) && data.stexTp !== stexRef.current) {
        onResolvedExRef.current?.(data.stexTp);
      }
    };

    api
      .quote(code, stexRef.current)
      .then(apply)
      .catch((err: Error) => {
        if (!live) return;
        setQuoteError(err.message || "현재가를 불러오지 못했습니다.");
      });

    const poll = () => {
      api
        .liveQuote(code, stexRef.current)
        .then(apply)
        .catch(() => {
          /* REST/FT 폴링 실패는 스트림이 메움 */
        });
    };
    poll();
    const timer = window.setInterval(poll, 800);

    stream = new EventSource(`http://127.0.0.1:8010/api/quotes/stream?stk_cd=${encodeURIComponent(code)}&stex_tp=${stexRef.current}`);
    stream.onmessage = (event) => {
      try {
        apply(JSON.parse(event.data) as Quote);
      } catch {
        /* ignore */
      }
    };

    return () => {
      live = false;
      window.clearInterval(timer);
      stream?.close();
    };
    // Auto-detected exchange must not reopen the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stkCd, exManual ? stexTp : "auto"]);

  return { quote, quoteError };
}

function mergeQuote(prev: Quote | null, data: Quote): Quote {
  if (!prev || prev.stkCd !== data.stkCd) return data;
  const incomingBook = Boolean(data.asks?.length || data.bids?.length);
  const prevBook = Boolean(prev.asks?.length || prev.bids?.length);
  if (!incomingBook && prevBook) {
    const mid = prev.ask && prev.bid ? (prev.ask + prev.bid) / 2 : prev.last;
    if (data.last && mid && Math.abs(mid - data.last) / data.last > 0.15) return data;
    return {
      ...data,
      last: data.last || prev.last,
      asks: prev.asks,
      bids: prev.bids,
      bid: prev.bid,
      ask: prev.ask,
      bidQty: prev.bidQty,
      askQty: prev.askQty,
      bookLive: prev.bookLive,
      bookNote: prev.bookNote,
    };
  }
  return {
    ...data,
    last: data.last || prev.last,
    open: data.open || prev.open,
    high: data.high || prev.high,
    low: data.low || prev.low,
    prevClose: data.prevClose || prev.prevClose,
  };
}
