"use client";

import { useEffect, useState } from "react";

export type UsSession = "pre" | "regular" | "after" | "closed";

export function usSession(now = new Date()): UsSession {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  if (weekday === "Sat" || weekday === "Sun") return "closed";
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  const mins = hour * 60 + minute;
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  if (mins >= 16 * 60 && mins < 20 * 60) return "after";
  return "closed";
}

export function sessionLabel(session: UsSession) {
  return { pre: "프리마켓", regular: "정규장", after: "애프터", closed: "휴장" }[session];
}

export function sessionClass(session: UsSession) {
  if (session === "regular") return "bg-brass-500/20 text-brass-400";
  if (session === "pre" || session === "after") return "bg-down/15 text-down";
  return "bg-ink-800 text-cream-500";
}

export function sessionHint(session: UsSession) {
  return {
    pre: "프리마켓 — 호가가 얇을 수 있습니다.",
    regular: "",
    after: "애프터 — 호가가 얇을 수 있습니다.",
    closed: "휴장 — 지금은 정규 거래 시간이 아닙니다.",
  }[session];
}

export function useUsSession() {
  const [session, setSession] = useState<UsSession>("closed");
  useEffect(() => {
    const tick = () => setSession(usSession());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return session;
}
