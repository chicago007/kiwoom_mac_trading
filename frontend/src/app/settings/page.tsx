"use client";

import { useStore } from "@/lib/store";

export default function SettingsPage() {
  const { state, dispatch } = useStore();
  const s = state.settings;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">설정</h1>
        <p className="mt-1 text-sm text-cream-300">계좌 모드와 한도입니다. 헤더에 현재 모드가 항상 보입니다.</p>
      </div>

      <section className="panel space-y-4 p-5">
        <h2 className="font-medium">계좌 모드</h2>
        <div className="flex gap-2">
          {(["real", "demo"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => dispatch({ type: "setMode", mode })}
              className={`px-4 py-2 text-sm ${
                state.mode === mode ? "bg-brass-500 text-ink-950" : "bg-ink-800 text-cream-300"
              }`}
            >
              {mode === "real" ? "운영 (real)" : "모의 (demo)"}
            </button>
          ))}
        </div>
        <p className="text-xs leading-5 text-cream-500">
          운영은 api.kiwoom.com, 모의는 mockapi.kiwoom.com입니다. 미국주식 모의주문 가능 여부는 포털에서 확인하세요.
        </p>
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="font-medium">리스크 한도</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-cream-500">일일 손실 한도 (USD)</span>
            <input
              className="field"
              type="number"
              value={s.dailyLossLimitUsd}
              onChange={(e) => dispatch({ type: "updateSettings", settings: { dailyLossLimitUsd: Number(e.target.value) } })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-cream-500">종목당 최대 수량</span>
            <input
              className="field"
              type="number"
              value={s.maxQtyPerSymbol}
              onChange={(e) => dispatch({ type: "updateSettings", settings: { maxQtyPerSymbol: Number(e.target.value) } })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-cream-500">1회 최대 금액 (USD)</span>
            <input
              className="field"
              type="number"
              value={s.maxNotionalUsd}
              onChange={(e) => dispatch({ type: "updateSettings", settings: { maxNotionalUsd: Number(e.target.value) } })}
            />
          </label>
        </div>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-medium">알림</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.notifyTelegram}
            onChange={(e) => dispatch({ type: "updateSettings", settings: { notifyTelegram: e.target.checked } })}
          />
          텔레그램 알림 (후순위)
        </label>
      </section>
    </div>
  );
}
