"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { formatKrw, formatUsd } from "@/lib/format";
import { sessionClass, sessionLabel, useUsSession } from "@/lib/session";
import { APP_VERSION } from "@/lib/version";

const NAV = [
  { href: "/", label: "종합" },
  { href: "/logs", label: "로그" },
  { href: "/settings", label: "설정" },
];

function isDeskPath(pathname: string) {
  return pathname === "/" || pathname === "/trade";
}

function useClock() {
  const [text, setText] = useState("—");
  useEffect(() => {
    const tick = () => {
      const ny = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "America/New_York",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      const seoul = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      setText(`NY ${ny} · 서울 ${seoul}`);
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return text;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const desk = isDeskPath(pathname);
  const { state, dispatch } = useStore();
  const clock = useClock();
  const session = useUsSession();
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 bg-ink-900">
        <div className={`mx-auto flex items-center gap-3 ${desk ? "max-w-[1680px] px-2 py-1.5" : "max-w-[1400px] px-4 py-2"}`}>
          <Link href="/" className="shrink-0 leading-tight">
            <div className="text-sm font-semibold">Mac용 키움 REST API 기반 미국주식 수동매매</div>
            <div className="text-[12px] text-cream-500">개인용 웹앱 · v{APP_VERSION}</div>
          </Link>

          <nav className="hidden flex-1 items-center gap-0 md:flex">
            {NAV.map((item) => {
              const active = item.href === "/" ? desk : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2.5 py-1 text-xs ${
                    active ? "bg-ink-800 text-brass-400" : "text-cream-300 hover:bg-ink-800 hover:text-cream-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 text-[13px]">
            <span className="hidden text-cream-500 lg:inline">{clock}</span>
            <span className={`px-1.5 py-0.5 font-medium ${sessionClass(session)}`}>{sessionLabel(session)}</span>
            <span
              className={`px-1.5 py-0.5 font-medium ${
                state.kiwoom === "connected" ? "bg-brass-500/20 text-brass-400" : "bg-ink-800 text-cream-500"
              }`}
              title={state.kiwoomError || ""}
            >
              {state.kiwoom === "connected" ? "키움 연결" : "키움 끊김"}
            </span>
            <span
              className={`px-1.5 py-0.5 font-medium ${
                state.mode === "real" ? "bg-up/15 text-up" : "bg-down/15 text-down"
              }`}
            >
              {state.mode === "real" ? "REAL" : "DEMO"}
            </span>
            <span className="bg-ink-800 px-1.5 py-0.5 text-cream-100">
              {state.killSwitch ? "주문 중지" : "수동 매매"}
            </span>
            <span
              className={`px-1.5 py-0.5 font-medium ${
                state.ordersLive ? "bg-up/15 text-up" : "bg-ink-800 text-cream-500"
              }`}
            >
              {state.ordersLive ? "실주문" : "주문 목업"}
            </span>
            <span className="hidden bg-ink-800 px-1.5 py-0.5 font-mono text-brass-400 sm:inline">
              {formatUsd(state.cashUsd)}
              {state.cashKrw ? ` · ${formatKrw(state.cashKrw)}` : ""}
            </span>
            <button
              type="button"
              onClick={() => dispatch({ type: "toggleKill" })}
              className={`btn ${state.killSwitch ? "btn-ghost" : "btn-danger"} !px-2 !py-0.5 text-[13px]`}
            >
              {state.killSwitch ? "킬스위치 해제" : "킬스위치"}
            </button>
          </div>
        </div>
        <nav className="flex gap-0 overflow-x-auto bg-ink-950 px-2 py-1 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 px-2.5 py-1 text-xs ${
                (item.href === "/" ? desk : pathname === item.href) ? "bg-ink-800 text-brass-400" : "text-cream-300"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className={`mx-auto min-h-0 w-full flex-1 ${desk ? "max-w-[1680px] overflow-hidden px-1 pb-1" : "max-w-[1400px] overflow-auto px-4 py-4"}`}>
        {children}
      </main>
    </div>
  );
}
