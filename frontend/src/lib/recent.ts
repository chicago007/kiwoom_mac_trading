import type { Exchange } from "./types";

export type RecentSymbol = {
  stkCd: string;
  stexTp: Exchange;
  stkNm: string;
};

const KEY = "kmt-recent";
const LIMIT = 6;

export function readRecent(): RecentSymbol[] {
  try {
    const raw = localStorage.getItem(KEY);
    const rows = raw ? (JSON.parse(raw) as RecentSymbol[]) : [];
    return Array.isArray(rows) ? rows.slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function pushRecent(hit: RecentSymbol) {
  const code = hit.stkCd.trim().toUpperCase();
  if (!code) return [];
  const next = [{ ...hit, stkCd: code }, ...readRecent().filter((row) => !(row.stkCd === code && row.stexTp === hit.stexTp))].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
