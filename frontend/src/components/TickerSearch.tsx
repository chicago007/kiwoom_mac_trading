"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { pushRecent, readRecent, type RecentSymbol } from "@/lib/recent";
import type { Exchange } from "@/lib/types";

export type TickerHit = {
  stkCd: string;
  stexTp: Exchange;
  stkNm: string;
};

type Props = {
  value: string;
  onChange: (stkCd: string) => void;
  onPick: (hit: TickerHit) => void;
  placeholder?: string;
  showRecent?: boolean;
};

export function TickerSearch({ value, onChange, onPick, placeholder = "티커 또는 이름", showRecent = false }: Props) {
  const [hits, setHits] = useState<TickerHit[]>([]);
  const [recents, setRecents] = useState<RecentSymbol[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecents(readRecent());
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      api
        .searchSymbols(q)
        .then((data) => {
          if (!live) return;
          setHits((data.results || []).map((row) => ({ stkCd: row.stkCd, stexTp: row.stexTp, stkNm: row.stkNm })));
        })
        .catch(() => {
          if (live) setHits([]);
        });
    }, 180);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(hit: TickerHit) {
    const next = pushRecent(hit);
    setRecents(next);
    onPick(hit);
    setOpen(false);
    inputRef.current?.blur();
    setFocused(false);
  }

  const menuOn = focused && open;
  const list = hits.length > 0 ? hits : showRecent && !value.trim() ? recents : [];

  return (
    <div ref={boxRef} className="relative min-w-0">
      <input
        ref={inputRef}
        type="text"
        className="field uppercase"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setFocused(true);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && list[0]) {
            e.preventDefault();
            pick(list[0]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {menuOn && list.length > 0 && (
        <ul className="absolute z-30 mt-0.5 max-h-48 w-full overflow-auto bg-ink-950 ring-1 ring-ink-700">
          {hits.length === 0 && showRecent && <li className="px-2 py-1 text-[11px] text-cream-500">최근</li>}
          {list.map((hit) => (
            <li key={`${hit.stexTp}-${hit.stkCd}`}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-xs hover:bg-ink-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(hit)}
              >
                <span className="font-medium">{hit.stkCd}</span>
                <span className="truncate text-cream-500">{hit.stkNm}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
