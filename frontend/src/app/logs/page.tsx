"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { LogLevel } from "@/lib/types";

const LEVELS: { id: "all" | LogLevel; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "info", label: "정보" },
  { id: "warn", label: "경고" },
  { id: "block", label: "차단" },
  { id: "error", label: "오류" },
];

function levelClass(level: LogLevel) {
  switch (level) {
    case "info":
      return "text-cream-100";
    case "warn":
      return "text-brass-400";
    case "block":
      return "text-up";
    case "error":
      return "text-up";
  }
}

export default function LogsPage() {
  const { state } = useStore();
  const [filter, setFilter] = useState<(typeof LEVELS)[number]["id"]>("all");
  const rows = state.logs.filter((l) => filter === "all" || l.level === filter);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">로그</h1>
        <p className="mt-1 text-sm text-cream-300">주문·차단·API 응답을 시간순으로 남깁니다.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setFilter(l.id)}
            className={`px-3 py-1 text-sm ${filter === l.id ? "bg-brass-500 text-ink-950" : "bg-ink-800 text-cream-300"}`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <ol className="panel divide-y divide-ink-800">
        {rows.map((log) => (
          <li key={log.id} className="grid gap-2 px-4 py-3 md:grid-cols-[140px_90px_1fr_80px]">
            <span className="font-mono text-xs text-cream-500">{log.at.replace("T", " ").slice(0, 16)}</span>
            <span className="text-xs uppercase tracking-wide text-cream-500">{log.source}</span>
            <span className={`text-sm ${levelClass(log.level)}`}>{log.message}</span>
            <span className="font-mono text-xs text-cream-500">{log.code ?? ""}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="px-4 py-8 text-center text-cream-500">해당 로그가 없습니다.</li>}
      </ol>
    </div>
  );
}
