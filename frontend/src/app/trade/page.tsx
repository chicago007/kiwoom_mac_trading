"use client";

import { Suspense } from "react";
import { TradingDesk } from "@/components/TradingDesk";

export default function TradePage() {
  return (
    <Suspense fallback={<p className="text-sm text-cream-500">종합 화면을 불러오는 중…</p>}>
      <TradingDesk />
    </Suspense>
  );
}
