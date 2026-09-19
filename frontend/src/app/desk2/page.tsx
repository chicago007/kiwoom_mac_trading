"use client";

import { Suspense } from "react";
import { TradingDesk2 } from "@/components/TradingDesk2";

export default function Desk2Page() {
  return (
    <div className="h-full min-h-0">
      <Suspense fallback={<p className="p-4 text-sm text-cream-500">종합2 화면을 불러오는 중…</p>}>
        <TradingDesk2 />
      </Suspense>
    </div>
  );
}
