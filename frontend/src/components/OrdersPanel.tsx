"use client";

import { exchangeLabel, formatUsd, sideLabel } from "@/lib/format";
import { useStore } from "@/lib/store";

const STATUS: Record<string, string> = {
  pending: "미체결",
  partial: "부분체결",
  filled: "체결",
  cancelled: "취소",
  rejected: "거절",
};

type Props = {
  compact?: boolean;
  bare?: boolean;
  onModify: (id: string, price: number) => void;
  onCancel: (id: string) => void;
  fallbackPrice?: number;
};

export function OrdersPanel({ compact = false, bare = false, onModify, onCancel, fallbackPrice = 0 }: Props) {
  const { state } = useStore();

  return (
    <section className={`${bare ? "" : "panel "}flex h-full min-h-0 flex-col overflow-hidden`}>
      {!bare && <div className="shrink-0 bg-ink-800/40 px-2 py-1 text-xs font-medium">주문 내역 {state.orders.length}건</div>}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={`data ${compact ? "tight" : ""}`}>
          <thead className="sticky top-0 bg-ink-800">
            <tr>
              <th>주문번호</th>
              <th>종목</th>
              <th>구분</th>
              <th>수량</th>
              <th>가격</th>
              <th>상태</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.orders.map((o) => (
              <tr key={o.id}>
                <td className="font-mono text-xs">{o.ordNo}</td>
                <td>
                  {o.stkCd}
                  <span className="ml-1 text-xs text-cream-500">{exchangeLabel(o.stexTp)}</span>
                </td>
                <td className={o.side === "buy" ? "text-up" : "text-down"}>{sideLabel(o.side)}</td>
                <td className="font-mono">{o.qty}</td>
                <td className="font-mono">{o.price ? formatUsd(o.price) : "시장가"}</td>
                <td>{STATUS[o.status]}</td>
                <td>
                  {(o.status === "pending" || o.status === "partial") && (
                    <div className="flex gap-2">
                      {o.trdeTp !== "03" && (
                        <button
                          className="text-xs text-brass-400 hover:text-brass-400/80"
                          type="button"
                          onClick={() => onModify(o.id, o.price || fallbackPrice)}
                        >
                          정정
                        </button>
                      )}
                      <button className="text-xs text-cream-300 hover:text-up" type="button" onClick={() => onCancel(o.id)}>
                        취소
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {state.orders.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-cream-500">
                  주문 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
