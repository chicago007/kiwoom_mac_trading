"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { TickerSearch } from "@/components/TickerSearch";
import { changeClass, formatPct, formatSignedUsd, formatUsd, formatVol } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Exchange, Quote } from "@/lib/types";

type SortKey = "stkCd" | "last" | "change" | "pct" | "volume";

type Props = {
  onSymbol: (stkCd: string, stexTp: Exchange) => void;
  selected?: { stkCd: string; stexTp: Exchange };
  variant?: "table" | "list";
};

export function WatchlistPanel({ onSymbol, selected, variant = "table" }: Props) {
  const { state, dispatch } = useStore();
  const groups = state.watchlists.filter((w) => w.source === "kiwoom_import");
  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [stkCd, setStkCd] = useState("");
  const [stexTp, setStexTp] = useState<Exchange>("ND");
  const [stkNm, setStkNm] = useState("");
  const [note, setNote] = useState("");
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [sortKey, setSortKey] = useState<SortKey>("stkCd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!groupId && groups[0]) setGroupId(groups[0].id);
    if (groupId && !groups.some((g) => g.id === groupId) && groups[0]) setGroupId(groups[0].id);
  }, [groupId, groups]);

  const items = useMemo(() => state.items.filter((i) => i.watchlistId === groupId), [state.items, groupId]);
  const rows = useMemo(() => {
    const mapped = items.map((row) => {
        const q = quotes[`${row.stexTp}-${row.stkCd}`];
        const last = q?.last || row.last;
        const change = q?.change ?? (last && row.prevClose ? last - row.prevClose : 0);
        const pct = q?.changePct ?? row.changePct;
        const volume = q?.volume || 0;
        return { row, last, change, pct, volume };
      });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...mapped].sort((a, b) => {
      if (sortKey === "stkCd") return a.row.stkCd.localeCompare(b.row.stkCd) * dir;
      return (Number(a[sortKey]) - Number(b[sortKey])) * dir;
    });
  }, [items, quotes, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "stkCd" ? "asc" : "desc");
    }
  }

  const mark = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  useEffect(() => {
    let live = true;
    const load = () => {
      items.slice(0, 20).forEach((row) => {
        api
          .quote(row.stkCd, row.stexTp, true)
          .then((quote) => {
            if (live) setQuotes((prev) => ({ ...prev, [`${row.stexTp}-${row.stkCd}`]: quote }));
          })
          .catch(() => {
            /* 시세 실패는 목록을 유지 */
          });
      });
    };
    load();
    const timer = window.setInterval(load, 20000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [items]);

  function addTicker(next?: { stkCd: string; stexTp: Exchange; stkNm: string }) {
    const code = (next?.stkCd || stkCd).trim().toUpperCase();
    if (!code || !groupId) return;
    dispatch({
      type: "addItem",
      item: {
        watchlistId: groupId,
        stkCd: code,
        stexTp: next?.stexTp || stexTp,
        stkNm: next?.stkNm || stkNm || code,
        last: 0,
        prevClose: 0,
        open: 0,
        changePct: 0,
        enabled: true,
      },
    });
    setStkCd("");
    setStkNm("");
    setNote("");
  }

  return (
    <section className="panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 bg-ink-800/40 px-2 py-1">
        <span className="shrink-0 font-medium">관심종목</span>
        {groups.length > 1 ? (
          <select className="field !w-auto min-w-[7rem] !py-0.5" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : groups.length === 0 ? (
          <span className="truncate text-[13px] text-cream-500">키움 그룹 없음</span>
        ) : null}
        <button className="btn btn-ghost ml-auto !px-1.5 !py-0.5" type="button" onClick={() => dispatch({ type: "importKiwoom" })}>
          불러오기
        </button>
        <button
          className="btn btn-primary !px-1.5 !py-0.5"
          type="button"
          onClick={() => {
            void api
              .saveWatchlist(groupId)
              .then((next) => {
                dispatch({ type: "hydrate", state: next });
                setNote(next.watchlistNote || "저장했습니다.");
              })
              .catch((err: unknown) => {
                setNote(err instanceof Error ? err.message : "저장에 실패했습니다.");
              });
          }}
        >
          저장
        </button>
      </div>
      <form
        className="flex shrink-0 gap-1 px-2 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          addTicker();
        }}
      >
        <div className="min-w-0 flex-1">
          <TickerSearch
            value={stkCd}
            placeholder="티커 검색"
            onChange={setStkCd}
            onPick={(hit) => {
              setStkCd(hit.stkCd);
              setStexTp(hit.stexTp);
              setStkNm(hit.stkNm);
              addTicker(hit);
            }}
          />
        </div>
        <button className="btn btn-ghost shrink-0" type="submit">
          추가
        </button>
      </form>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {variant === "list" ? (
          <div className="min-w-0">
            <div className="desk2-list sticky top-0 bg-ink-800 py-1 text-[10px] leading-tight text-cream-500">
              <button type="button" className="truncate text-left hover:text-brass-400" onClick={() => toggleSort("stkCd")}>
                종목{mark("stkCd")}
              </button>
              <button type="button" className="truncate text-right hover:text-brass-400" onClick={() => toggleSort("last")}>
                현재가{mark("last")}
              </button>
              <button type="button" className="truncate text-right hover:text-brass-400" onClick={() => toggleSort("change")}>
                등락{mark("change")}
              </button>
              <button type="button" className="truncate text-right hover:text-brass-400" onClick={() => toggleSort("pct")}>
                %{mark("pct")}
              </button>
            </div>
            {rows.map(({ row, last, change, pct }) => {
              const active = selected && selected.stkCd === row.stkCd && selected.stexTp === row.stexTp;
              return (
                <div
                  key={row.id}
                  className={`desk2-list cursor-pointer border-b border-ink-800 py-1 hover:bg-ink-800 ${active ? "bg-ink-800" : ""}`}
                  onClick={() => onSymbol(row.stkCd, row.stexTp)}
                >
                  <div className="truncate text-[11px] font-medium">{row.stkCd}</div>
                  <div className="truncate text-right font-mono text-[11px]">{last ? formatUsd(last) : "—"}</div>
                  <div className={`truncate text-right font-mono text-[11px] ${last ? changeClass(change) : "text-cream-500"}`}>
                    {last ? formatSignedUsd(change) : "—"}
                  </div>
                  <div className={`truncate text-right font-mono text-[11px] ${last ? changeClass(pct) : "text-cream-500"}`}>
                    {last ? formatPct(pct) : "—"}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="px-2 py-6 text-center text-[13px] text-cream-500">키움 관심종목이 없습니다. 영웅문에 있는 그룹을 불러오세요.</p>
            )}
          </div>
        ) : (
        <table className="data tight">
          <thead className="sticky top-0 bg-ink-800">
            <tr>
              <th>
                <button type="button" className="hover:text-brass-400" onClick={() => toggleSort("stkCd")}>
                  종목{mark("stkCd")}
                </button>
              </th>
              <th className="!text-right">
                <button type="button" className="w-full text-right hover:text-brass-400" onClick={() => toggleSort("last")}>
                  현재가{mark("last")}
                </button>
              </th>
              <th className="!text-right">
                <button type="button" className="w-full text-right hover:text-brass-400" onClick={() => toggleSort("change")}>
                  등락{mark("change")}
                </button>
              </th>
              <th className="!text-right">
                <button type="button" className="w-full text-right hover:text-brass-400" onClick={() => toggleSort("volume")}>
                  거래량{mark("volume")}
                </button>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, last, change, pct, volume }) => {
              const active = selected && selected.stkCd === row.stkCd && selected.stexTp === row.stexTp;
              return (
                <tr
                  key={row.id}
                  className={`cursor-pointer hover:bg-ink-800 ${active ? "bg-ink-800" : ""}`}
                  onClick={() => onSymbol(row.stkCd, row.stexTp)}
                >
                  <td>
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className="font-medium">{row.stkCd}</span>
                      <span className="truncate text-[12px] text-cream-500">{row.stkNm !== row.stkCd ? row.stkNm : ""}</span>
                    </div>
                  </td>
                  <td className="!text-right font-mono">{last ? formatUsd(last) : "—"}</td>
                  <td className={`whitespace-nowrap !text-right font-mono ${changeClass(change || pct)}`}>
                    {last ? `${formatSignedUsd(change)} ${formatPct(pct)}` : "—"}
                  </td>
                  <td className="!text-right font-mono text-cream-300">{formatVol(volume)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="text-[12px] text-cream-500 hover:text-up" type="button" onClick={() => dispatch({ type: "removeItem", id: row.id })}>
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-cream-500">
                  키움 관심종목이 없습니다. 영웅문에 있는 그룹을 불러오세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        )}
      </div>
      {note && <p className="shrink-0 px-2 py-1 text-[12px] text-cream-500">{note}</p>}
    </section>
  );
}
