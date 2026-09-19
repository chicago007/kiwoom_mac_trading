"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatNum, formatUsd } from "@/lib/format";
import type { TradeRow } from "@/lib/types";

const TYPES = [
  ["0", "전체"],
  ["3", "매매"],
  ["4", "매수"],
  ["5", "매도"],
  ["1", "입출금"],
  ["F", "환전"],
] as const;

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymd(iso: string) {
  return iso.replaceAll("-", "");
}

function dashDate(ymd8: string) {
  if (ymd8.length !== 8) return ymd8;
  return `${ymd8.slice(0, 4)}-${ymd8.slice(4, 6)}-${ymd8.slice(6, 8)}`;
}

function remarkClass(remark: string) {
  if (remark.includes("매수") || remark.includes("입금")) return "text-up";
  if (remark.includes("매도") || remark.includes("출금")) return "text-down";
  return "";
}

function saveCsv(rows: TradeRow[], from: string, to: string) {
  const header = [
    "거래일자",
    "처리시간",
    "거래종류",
    "적요",
    "종목코드",
    "종목명",
    "거래수량",
    "거래단가/환율",
    "거래금액(외)",
    "수수료(외)",
    "거래세(외)",
    "정산금액(외)",
    "외화예수금",
    "예수금",
    "매체",
    "거래번호",
    "거래소",
    "통화",
  ];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        dashDate(row.dealDt),
        row.procTime,
        row.kind,
        row.remark,
        row.stkCd,
        row.stkNm,
        row.qty,
        row.priceFx,
        row.amountUsd,
        row.feeUsd,
        row.taxUsd,
        row.settleUsd,
        row.cashUsd,
        row.cashKrw,
        row.media,
        row.dealNo,
        row.stexNm,
        row.crnc,
      ]
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(","),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `거래내역_${ymd(from)}_${ymd(to)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TradesPanel() {
  const [from, setFrom] = useState(isoDate(-30));
  const [to, setTo] = useState(isoDate(0));
  const [tp, setTp] = useState("0");
  const [stkCd, setStkCd] = useState("");
  const [applied, setApplied] = useState({ from: isoDate(-30), to: isoDate(0), tp: "0", stkCd: "" });
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [buySum, setBuySum] = useState(0);
  const [sellSum, setSellSum] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setNote("");
    api
      .trades(ymd(applied.from), ymd(applied.to), applied.tp, "", applied.stkCd)
      .then((data) => {
        if (!live) return;
        setRows(data.rows || []);
        setBuySum(data.buySum || 0);
        setSellSum(data.sellSum || 0);
        setNote(data.note || "");
      })
      .catch((err: unknown) => {
        if (!live) return;
        setRows([]);
        setNote(err instanceof Error ? err.message : "거래내역을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [applied]);

  function apply(next = { from, to, tp, stkCd: stkCd.trim().toUpperCase() }) {
    setFrom(next.from);
    setTo(next.to);
    setTp(next.tp);
    setStkCd(next.stkCd);
    setApplied(next);
  }

  function preset(days: number | "year") {
    const nextTo = isoDate(0);
    const nextFrom = days === "year" ? `${new Date().getFullYear()}-01-01` : isoDate(-days);
    apply({ from: nextFrom, to: nextTo, tp, stkCd: stkCd.trim().toUpperCase() });
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <form
        className="flex shrink-0 flex-wrap items-center gap-1 px-2 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <input className="field !w-[8.2rem]" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-cream-500">~</span>
        <input className="field !w-[8.2rem]" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <select className="field !w-auto" value={tp} onChange={(e) => setTp(e.target.value)}>
          {TYPES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="field !w-20 uppercase"
          placeholder="종목"
          value={stkCd}
          onChange={(e) => setStkCd(e.target.value.toUpperCase())}
        />
        <div className="flex gap-1">
          {(
            [
              [7, "1주"],
              [30, "1개월"],
              [90, "3개월"],
              ["year", "올해"],
            ] as const
          ).map(([days, label]) => (
            <button key={label} className="btn btn-ghost !px-1.5 !py-0.5" type="button" onClick={() => preset(days)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn btn-primary !px-2 !py-0.5" type="submit" disabled={busy}>
          {busy ? "조회…" : "조회"}
        </button>
        <button className="btn btn-ghost !px-2 !py-0.5" type="button" disabled={!rows.length} onClick={() => saveCsv(rows, from, to)}>
          저장
        </button>
        <span className="ml-auto text-[12px] text-cream-500">
          {rows.length}건
          {buySum ? ` · 매수 ${formatUsd(buySum)}` : ""}
          {sellSum ? ` · 매도 ${formatUsd(sellSum)}` : ""}
        </span>
      </form>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="data tight min-w-[1100px]">
          <thead className="sticky top-0 bg-ink-800">
            <tr>
              <th>거래일자</th>
              <th>시간</th>
              <th>종류</th>
              <th>적요</th>
              <th>종목</th>
              <th className="!text-right">수량</th>
              <th className="!text-right">단가/환율</th>
              <th className="!text-right">거래금액</th>
              <th className="!text-right">수수료</th>
              <th className="!text-right">거래세</th>
              <th className="!text-right">정산금액</th>
              <th className="!text-right">외화잔고</th>
              <th>매체</th>
              <th>번호</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.dealDt}-${row.dealNo}-${row.stkCd}-${i}`}>
                <td className="font-mono">{dashDate(row.dealDt)}</td>
                <td className="font-mono text-cream-300">{row.procTime}</td>
                <td>{row.kind}</td>
                <td className={remarkClass(row.remark)}>{row.remark}</td>
                <td>
                  <span className="font-medium">{row.stkCd}</span>
                  {row.stkNm && row.stkNm !== row.stkCd ? <span className="ml-1 text-cream-500">{row.stkNm}</span> : null}
                </td>
                <td className="!text-right font-mono">{row.qty ? formatNum(row.qty, 0) : "—"}</td>
                <td className="!text-right font-mono">{row.priceFx ? formatNum(row.priceFx, 4) : "—"}</td>
                <td className="!text-right font-mono">{row.amountUsd ? formatUsd(row.amountUsd) : row.amountKrw ? `${formatNum(row.amountKrw, 0)}원` : "—"}</td>
                <td className="!text-right font-mono text-cream-300">{row.feeUsd ? formatUsd(row.feeUsd) : "—"}</td>
                <td className="!text-right font-mono text-cream-300">{row.taxUsd ? formatUsd(row.taxUsd) : "—"}</td>
                <td className="!text-right font-mono">{row.settleUsd ? formatUsd(row.settleUsd) : "—"}</td>
                <td className="!text-right font-mono text-cream-300">{row.cashUsd ? formatUsd(row.cashUsd) : "—"}</td>
                <td className="text-cream-500">{row.media}</td>
                <td className="font-mono text-cream-500">{row.dealNo}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="py-6 text-center text-cream-500">
                  {busy ? "조회 중…" : note || "해당 기간 거래내역이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {note && rows.length > 0 && <p className="shrink-0 px-2 py-1 text-[12px] text-cream-500">{note}</p>}
    </section>
  );
}
