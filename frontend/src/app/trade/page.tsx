"use client";

import { Suspense } from "react";
import { TradingDesk } from "@/components/TradingDesk";

export default function TradePage() {
  return (
    <div className="h-full min-h-0">
      <Suspense fallback={<p className="p-4 text-sm text-cream-500">종합 화면을 불러오는 중…</p>}>
        <TradingDesk />
      </Suspense>
    </div>
  );
}
