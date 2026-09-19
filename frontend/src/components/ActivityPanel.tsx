"use client";

import { useState } from "react";
import { FillsPanel } from "@/components/FillsPanel";
import { OrdersPanel } from "@/components/OrdersPanel";
import { TradesPanel } from "@/components/TradesPanel";

type Tab = "orders" | "fills" | "trades";

type Props = {
  fallbackPrice?: number;
  onModify: (id: string, price: number) => void;
  onCancel: (id: string) => void;
};

export function ActivityPanel({ fallbackPrice = 0, onModify, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 bg-ink-800/40">
        {(
          [
            ["orders", "주문내역"],
            ["fills", "당일 체결"],
            ["trades", "거래내역"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`px-3 py-1 text-xs ${tab === id ? "bg-ink-700 text-brass-400" : "text-cream-300 hover:text-cream-50"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "orders" ? (
          <OrdersPanel compact bare fallbackPrice={fallbackPrice} onModify={onModify} onCancel={onCancel} />
        ) : tab === "fills" ? (
          <FillsPanel compact bare />
        ) : (
          <TradesPanel />
        )}
      </div>
    </section>
  );
}
