"use client";

import { exchangeLabel, formatUsd, sideLabel } from "@/lib/format";
import { useStore } from "@/lib/store";

export function FillsPanel({ compact = false }: { compact?: boolean }) {
  const { state } = useStore();

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 bg-ink-800/40 px-2 py-1 text-xs font-medium">당일 체결 {state.fills.length}건</div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={`data ${compact ? "tight" : ""}`}>
          <thead className="sticky top-0 bg-ink-800">
            <tr>
              <th>시각</th>
              <th>주문번호</th>
              <th>종목</th>
              <th>구분</th>
              <th>수량</th>
              <th>체결가</th>
            </tr>
          </thead>
          <tbody>
            {state.fills.map((f) => (
              <tr key={f.id}>
                <td className="font-mono text-cream-300">{f.at.includes("T") ? f.at.slice(11, 16) : f.at.slice(0, 5)}</td>
                <td className="font-mono text-xs">{f.ordNo}</td>
                <td>
                  {f.stkCd}
                  <span className="ml-1 text-cream-500">{f.stkNm}</span>
                </td>
                <td className={f.side === "buy" ? "text-up" : "text-down"}>{sideLabel(f.side)}</td>
                <td className="font-mono">{f.qty}</td>
                <td className="font-mono">{formatUsd(f.price)}</td>
              </tr>
            ))}
            {state.fills.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-cream-500">
                  당일 체결이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
