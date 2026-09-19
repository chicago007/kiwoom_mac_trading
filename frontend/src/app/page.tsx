"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { changeClass, formatPct, formatUsd, sideLabel } from "@/lib/format";
import { api } from "@/lib/api";
import { isExchange } from "@/lib/symbols";
import { orderPath } from "@/lib/routes";
import { useStore } from "@/lib/store";
import type { MarketItem } from "@/lib/types";

function statusLabel(status: string) {
  return { pending: "미체결", partial: "부분체결", filled: "체결", cancelled: "취소", rejected: "거절" }[status] ?? status;
}

export default function DashboardPage() {
  const { state } = useStore();
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const enabledItems = state.items.filter((i) => i.enabled);
  const openOrders = state.orders.filter((o) => o.status === "pending" || o.status === "partial");
  const equity = state.positions.reduce((sum, p) => sum + p.qty * p.last, 0);

  useEffect(() => {
    let live = true;
    const load = () => {
      api
        .markets()
        .then((data) => {
          if (live) setMarkets(data.markets || []);
        })
        .catch(() => {
          if (live) setMarkets([]);
        });
    };
    load();
    const timer = window.setInterval(load, 120000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">오늘 장 요약</h1>
        <p className="mt-1 text-sm text-cream-300">
          키움증권 맥북용 매매시스템 0.1. 시세·잔고는 키움입니다. 주문은 확인 후 나갑니다. 자동매매 전략은 없습니다.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="달러 예수금" value={formatUsd(state.cashUsd)} hint={`원화 ${state.cashKrw.toLocaleString("ko-KR")}원`} valueClass="text-brass-400" />
        <Stat
          label="당일 손익"
          value={formatUsd(state.dailyPnl)}
          hint="실현 + 평가"
          valueClass={changeClass(state.dailyPnl)}
        />
        <Stat label="평가금액" value={formatUsd(equity)} hint={`보유 ${state.positions.length}종목`} />
        <Stat
          label="운영 상태"
          value={state.killSwitch ? "주문 중지" : "대기"}
          hint={`${state.mode.toUpperCase()} · 수동 매매`}
          valueClass={state.killSwitch ? "text-up" : "text-brass-400"}
        />
      </section>

      <section>
        <h2 className="mb-3 font-medium">시장 지표</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {markets.map((row) => {
            const inner = (
              <>
                <p className="text-xs uppercase tracking-wide text-cream-500">{row.label}</p>
                <p className={`mt-2 font-mono text-2xl ${row.unit === "krw" ? "text-cream-50" : changeClass(row.change)}`}>
                  {row.unit === "krw"
                    ? `${row.last.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원/$`
                    : formatUsd(row.last)}
                </p>
                <p className={`mt-1 text-xs ${row.unit === "krw" ? "text-cream-500" : changeClass(row.change)}`}>
                  {row.unit === "krw"
                    ? row.hint
                    : `${formatUsd(row.change)} ${formatPct(row.changePct)} · ${row.hint}`}
                </p>
              </>
            );
            const className = "panel block p-4";
            if (row.stkCd && isExchange(row.stexTp)) {
              return (
                <Link key={row.id} href={orderPath(row.stkCd, row.stexTp)} className={`${className} hover:bg-ink-800`}>
                  {inner}
                </Link>
              );
            }
            return (
              <div key={row.id} className={className}>
                {inner}
              </div>
            );
          })}
          {markets.length === 0 && <p className="text-sm text-cream-500">시장 지표를 불러오는 중…</p>}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">최근 주문</h2>
            <Link href="/trade" className="text-sm text-brass-400 hover:text-brass-400/80">
              종합 화면
            </Link>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>종목</th>
                  <th>구분</th>
                  <th>수량</th>
                  <th>가격</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {state.orders.slice(0, 5).map((o) => (
                  <tr key={o.id}>
                    <td className="font-mono text-cream-300">{o.createdAt.slice(11, 16)} ET</td>
                    <td>
                      <span className="font-medium">{o.stkCd}</span>
                      <span className="ml-2 text-cream-500">{o.stkNm}</span>
                    </td>
                    <td className={o.side === "buy" ? "text-up" : "text-down"}>{sideLabel(o.side)}</td>
                    <td className="font-mono">{o.qty}</td>
                    <td className="font-mono">{o.price ? formatUsd(o.price) : "시장가"}</td>
                    <td>{statusLabel(o.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <h2 className="mb-3 font-medium">관심종목 등락</h2>
            <ul className="space-y-2 text-sm">
              {enabledItems.slice(0, 5).map((i) => (
                <li key={i.id}>
                  <Link href={orderPath(i.stkCd, i.stexTp)} className="flex items-center justify-between px-1 py-0.5 hover:bg-ink-800">
                    <span className="font-medium">{i.stkCd}</span>
                    <span className={`font-mono ${changeClass(i.changePct)}`}>
                      {formatUsd(i.last)} {formatPct(i.changePct)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">미체결 {openOrders.length}건</h2>
          <Link href="/trade" className="text-sm text-brass-400">
            정정·취소
          </Link>
        </div>
        {openOrders.length === 0 ? (
          <p className="text-sm text-cream-500">미체결 주문이 없습니다.</p>
        ) : (
          <p className="text-sm text-cream-100">
            {openOrders.map((o) => `${o.stkCd} ${o.qty}주`).join(" · ")}
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wide text-cream-500">{label}</p>
      <p className={`mt-2 font-mono text-2xl ${valueClass ?? ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-cream-500">{hint}</p>}
    </div>
  );
}
