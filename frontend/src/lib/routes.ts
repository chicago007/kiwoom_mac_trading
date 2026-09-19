import type { Exchange } from "./types";

export function orderPath(stkCd: string, stexTp: Exchange) {
  return `/trade?stk=${encodeURIComponent(stkCd)}&ex=${stexTp}`;
}
