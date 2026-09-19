"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { changeClass, exchangeLabel, formatPct, formatUsd } from "@/lib/format";
import { orderPath } from "@/lib/routes";
import { useStore } from "@/lib/store";
import type { Exchange } from "@/lib/types";

const SEARCH_POOL = [
  { stkCd: "NVDA", stexTp: "ND" as Exchange, stkNm: "NVIDIA", last: 177.82, prevClose: 174.1, open: 175.4, changePct: 2.14 },
  { stkCd: "AAPL", stexTp: "ND" as Exchange, stkNm: "Apple", last: 228.4, prevClose: 226.9, open: 227.2, changePct: 0.66 },
  { stkCd: "MSFT", stexTp: "ND" as Exchange, stkNm: "Microsoft", last: 418.75, prevClose: 421.1, open: 420.0, changePct: -0.56 },
  { stkCd: "AMZN", stexTp: "ND" as Exchange, stkNm: "Amazon", last: 192.3, prevClose: 189.8, open: 190.4, changePct: 1.32 },
  { stkCd: "META", stexTp: "ND" as Exchange, stkNm: "Meta", last: 512.4, prevClose: 508.1, open: 509.0, changePct: 0.85 },
  { stkCd: "GOOGL", stexTp: "ND" as Exchange, stkNm: "Alphabet", last: 168.9, prevClose: 166.2, open: 167.1, changePct: 1.62 },
  { stkCd: "TSLA", stexTp: "ND" as Exchange, stkNm: "Tesla", last: 241.55, prevClose: 248.2, open: 246.0, changePct: -2.68 },
  { stkCd: "BRK.B", stexTp: "NY" as Exchange, stkNm: "Berkshire B", last: 498.2, prevClose: 495.0, open: 496.1, changePct: 0.65 },
  { stkCd: "JPM", stexTp: "NY" as Exchange, stkNm: "JPMorgan", last: 248.1, prevClose: 245.6, open: 246.2, changePct: 1.02 },
];

export default function WatchlistsPage() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const selected = state.watchlists.find((w) => w.id === state.selectedWatchlistId);
  const rows = state.items.filter((i) => i.watchlistId === state.selectedWatchlistId);
  const hits = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return SEARCH_POOL.filter((s) => s.stkCd.includes(q) || s.stkNm.toUpperCase().includes(q)).slice(0, 6);
  }, [query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">관심종목</h1>
          <p className="mt-1 text-sm text-cream-300">종목을 누르면 종합 화면으로 이동합니다. 키움 HTS 그룹은 가져오기만 합니다.</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={() => dispatch({ type: "importKiwoom" })}>
          키움 그룹 가져오기
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="panel p-3">
          <p className="mb-2 px-1 text-xs uppercase tracking-wide text-cream-500">그룹</p>
          <ul className="space-y-1">
            {state.watchlists.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "selectWatchlist", id: w.id })}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    w.id === state.selectedWatchlistId ? "bg-ink-700" : "hover:bg-ink-800"
                  }`}
                >
                  <span>{w.name}</span>
                  <span className="text-[13px] text-cream-500">
                    {w.source === "holdings" ? "보유" : w.source === "kiwoom_import" ? "HTS" : "앱"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newGroup.trim()) return;
              dispatch({ type: "addWatchlist", name: newGroup.trim() });
              setNewGroup("");
            }}
          >
            <input className="field" placeholder="새 그룹 이름" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
            <button className="btn btn-primary shrink-0" type="submit">
              추가
            </button>
          </form>
          {selected && selected.source === "app" && (
            <button
              className="mt-2 w-full text-left text-xs text-cream-500 hover:text-up"
              type="button"
              onClick={() => {
                if (confirm(`그룹 "${selected.name}"을 삭제할까요?`)) {
                  dispatch({ type: "removeWatchlist", id: selected.id });
                }
              }}
            >
              이 그룹 삭제
            </button>
          )}
        </aside>

        <section className="space-y-3">
          <div className="panel p-4">
            <p className="text-sm text-cream-300">
              {selected?.source === "app"
                ? "종목 검색 후 현재 그룹에 넣습니다. 거래소는 NASDAQ / NYSE / AMEX를 구분합니다."
                : selected?.source === "holdings"
                  ? "잔고에서 가져온 보유종목입니다. 종목을 누르면 종합 화면으로 이동합니다."
                  : "키움 HTS 관심그룹입니다. 가져오기만 하며 앱에서 수정하지 않습니다."}
            </p>
            <input
              className="field mt-3"
              placeholder="티커 또는 이름 · 예: NVDA, Apple"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {hits.length > 0 && (
              <ul className="mt-2 divide-y divide-ink-800 bg-ink-950">
                {hits.map((hit) => (
                  <li key={`${hit.stexTp}-${hit.stkCd}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{hit.stkCd}</span>
                      <span className="ml-2 text-cream-500">{hit.stkNm}</span>
                      <span className="ml-2 text-xs text-cream-500">{exchangeLabel(hit.stexTp)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost !py-1" type="button" onClick={() => router.push(orderPath(hit.stkCd, hit.stexTp))}>
                        주문
                      </button>
                      {selected?.source === "app" && (
                      <button
                        className="btn btn-primary !py-1"
                        type="button"
                        onClick={() => {
                          if (!state.selectedWatchlistId) return;
                          dispatch({
                            type: "addItem",
                            item: { ...hit, watchlistId: state.selectedWatchlistId, enabled: true },
                          });
                          setQuery("");
                        }}
                      >
                        담기
                      </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel overflow-hidden">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>사용</th>
                    <th>종목</th>
                    <th>거래소</th>
                    <th>현재가</th>
                    <th>시가</th>
                    <th>전일종가</th>
                    <th>등락</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer hover:bg-ink-800 ${row.enabled ? "" : "opacity-50"}`}
                      onClick={() => router.push(orderPath(row.stkCd, row.stexTp))}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={row.enabled} onChange={() => dispatch({ type: "toggleItem", id: row.id })} />
                      </td>
                      <td>
                        <div className="font-medium">{row.stkCd}</div>
                        <div className="text-xs text-cream-500">{row.stkNm}</div>
                      </td>
                      <td className="text-cream-300">{exchangeLabel(row.stexTp)}</td>
                      <td className="font-mono">{formatUsd(row.last)}</td>
                      <td className="font-mono text-cream-300">{formatUsd(row.open)}</td>
                      <td className="font-mono text-cream-300">{formatUsd(row.prevClose)}</td>
                      <td className={`font-mono ${changeClass(row.changePct)}`}>{formatPct(row.changePct)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="mr-2 text-xs text-brass-400 hover:text-brass-400/80" type="button" onClick={() => router.push(orderPath(row.stkCd, row.stexTp))}>
                          주문
                        </button>
                        {selected?.source === "app" && (
                        <button className="text-xs text-cream-500 hover:text-up" type="button" onClick={() => dispatch({ type: "removeItem", id: row.id })}>
                          제거
                        </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-cream-500">
                        이 그룹에 종목이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
