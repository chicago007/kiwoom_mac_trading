from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from threading import Lock, Thread

from app.config import KIWOOM_ENABLED, KIWOOM_MODE

_lock = Lock()
_status = {
    "connected": False,
    "mode": KIWOOM_MODE,
    "source": "mock",
    "error": "",
}


def to_float(value: object, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    text = str(value).replace(",", "").replace("+", "").strip()
    if text in {"", "-"}:
        return default
    try:
        return float(text)
    except ValueError:
        return default


def exchange_code(value: object, fallback: str = "ND") -> str:
    text = str(value or "").strip().upper()
    if text in {"ND", "NY", "NA"}:
        return text
    if "NASDAQ" in text:
        return "ND"
    if "NYSE" in text:
        return "NY"
    if "AMEX" in text:
        return "NA"
    return fallback


def status() -> dict:
    with _lock:
        return dict(_status)


def _set_status(*, connected: bool, error: str = "", source: str = "kiwoom") -> None:
    with _lock:
        _status["connected"] = connected
        _status["source"] = source if connected else "mock"
        _status["error"] = error
        _status["mode"] = KIWOOM_MODE


def _client():
    from kiwoom import get_client

    return get_client(KIWOOM_MODE)


def _call(api_id: str, path: str, body: dict | None = None) -> dict:
    client = _client()
    response = client.fetch_page(api_id=api_id, path=path, body=body or {})
    payload = response.body or {}
    code = payload.get("return_code")
    if code not in (None, 0, "0"):
        raise RuntimeError(str(payload.get("return_msg") or f"return_code={code}"))
    return payload


def ping() -> dict:
    if not KIWOOM_ENABLED:
        _set_status(connected=False, error="KIWOOM_ENABLED=false", source="mock")
        return status()
    return status()


def _exchange_try_order(stex_tp: str) -> list[str]:
    primary = exchange_code(stex_tp, "ND")
    ordered = [primary]
    for extra in ("ND", "NY", "NA"):
        if extra not in ordered:
            ordered.append(extra)
    return ordered


def _quote_from_body(body: dict, stex_tp: str, stk_cd: str) -> dict:
    last = abs(to_float(body.get("cur_prc")))
    prev = abs(to_float(body.get("base_close_pric") or last))
    open_px = abs(to_float(body.get("open_pric") or last))
    high = abs(to_float(body.get("high_pric") or max(last, open_px)))
    low = abs(to_float(body.get("low_pric") or min(last, open_px)))
    change = to_float(body.get("pred_pre"), last - prev)
    sig = str(body.get("pred_pre_sig") or "")
    if sig in {"4", "5"} or str(body.get("cur_prc") or "").startswith("-"):
        change = -abs(change)
    elif sig in {"1", "2"} or str(body.get("cur_prc") or "").startswith("+"):
        change = abs(change)
    change_pct = to_float(body.get("flu_rt"))
    if change_pct == 0 and prev:
        change_pct = round((change / prev) * 100, 2)
    return {
        "stkCd": str(body.get("stk_cd") or stk_cd).strip().upper(),
        "stkNm": body.get("stk_nm") or body.get("stk_enm") or stk_cd.strip().upper(),
        "stexTp": exchange_code(body.get("stex_tp") or stex_tp, stex_tp),
        "last": last,
        "open": open_px,
        "high": high,
        "low": low,
        "prevClose": prev,
        "change": change,
        "changePct": change_pct,
        "volume": int(to_float(body.get("acc_trde_qty"))),
        "bid": last,
        "ask": last,
        "bidQty": 0,
        "askQty": 0,
        "asks": [],
        "bids": [],
        "source": "kiwoom",
        "halted": str(body.get("trd_susp_tp") or "") not in {"", "0", "N", "n"},
        "fxUsdKrw": abs(to_float(body.get("base_exrt"))),
        "bookLive": False,
        "bookNote": "실시간 10호가 수신 중…",
    }


def _levels_from_20101(body: dict) -> tuple[list[dict], list[dict]]:
    asks = []
    for i in range(10, 0, -1):
        price = abs(to_float(body.get(f"sel_{i}bid")))
        qty = int(abs(to_float(body.get(f"sel_{i}bid_req"))))
        if price > 0:
            asks.append({"price": price, "qty": qty})
    bids = []
    for i in range(1, 11):
        price = abs(to_float(body.get(f"buy_{i}bid")))
        qty = int(abs(to_float(body.get(f"buy_{i}bid_req"))))
        if price > 0:
            bids.append({"price": price, "qty": qty})
    return asks, bids


def _attach_rest_book(quote: dict, stex_tp: str, stk_cd: str) -> dict:
    try:
        body = _call("usa20101", "/api/us/mrkcond", {"stex_tp": stex_tp, "stk_cd": stk_cd})
    except Exception:  # noqa: BLE001
        return quote
    asks, bids = _levels_from_20101(body)
    if not asks and not bids:
        return quote
    quote = dict(quote)
    quote["asks"] = asks
    quote["bids"] = bids
    quote["bid"] = bids[0]["price"] if bids else abs(to_float(body.get("fpr_buy_bid"), quote.get("bid") or 0))
    quote["ask"] = asks[-1]["price"] if asks else abs(to_float(body.get("fpr_sel_bid"), quote.get("ask") or 0))
    quote["bidQty"] = bids[0]["qty"] if bids else 0
    quote["askQty"] = asks[-1]["qty"] if asks else 0
    if not quote.get("bookLive"):
        quote["bookLive"] = False
        quote["bookNote"] = "현재가 10호가입니다. 호가 변동이 있으면 실시간으로 갱신됩니다."
    return quote


_quote_lock = Lock()
_quote_cache: dict[str, tuple[float, dict]] = {}
_quote_ex: dict[str, str] = {}
_usa20100_next = 0.0
_usa20100_block_until = 0.0
_QUOTE_TTL = 20.0
_USA20100_GAP = 0.25
_CODE_RE = re.compile(r"^[A-Z][A-Z0-9.]{0,9}$")


def _cached_quote(code: str) -> dict | None:
    hit = _quote_cache.get(code)
    if not hit:
        return None
    at, quote = hit
    if time.time() - at > _QUOTE_TTL:
        return None
    return dict(quote)


def _stale_quote(code: str) -> dict | None:
    hit = _quote_cache.get(code)
    return dict(hit[1]) if hit else None


def _call_usa20100(stex_tp: str, stk_cd: str) -> dict:
    global _usa20100_next, _usa20100_block_until
    now = time.time()
    if now < _usa20100_block_until:
        raise RuntimeError("usa20100 요청 한도 대기 중")
    wait = _usa20100_next - now
    if wait > 0:
        time.sleep(wait)
    _usa20100_next = time.time() + _USA20100_GAP
    try:
        return _call("usa20100", "/api/us/mrkcond", {"stex_tp": stex_tp, "stk_cd": stk_cd})
    except Exception as exc:  # noqa: BLE001
        if "429" in str(exc) or "1700" in str(exc) or "유량" in str(exc):
            _usa20100_block_until = time.time() + 12
        raise


def get_quote_lite(stex_tp: str, stk_cd: str) -> dict:
    code = stk_cd.strip().upper()
    if not _CODE_RE.fullmatch(code):
        raise RuntimeError("종목코드를 영문으로 입력하세요")
    with _quote_lock:
        cached = _cached_quote(code)
        if cached:
            return cached
        last_error: Exception | None = None
        known = _quote_ex.get(code)
        order = [known] if known else []
        for ex in _exchange_try_order(stex_tp):
            if ex not in order:
                order.append(ex)
        for ex in order:
            try:
                body = _call_usa20100(ex, code)
                _set_status(connected=True)
                quote = _quote_from_body(body, ex, code)
                quote["stexTp"] = exchange_code(quote.get("stexTp") or ex, ex)
                _quote_cache[code] = (time.time(), quote)
                _quote_ex[code] = str(quote["stexTp"])
                return dict(quote)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                text = str(exc)
                if "429" in text or "1700" in text or "유량" in text or "한도" in text:
                    stale = _stale_quote(code)
                    if stale:
                        stale["bookNote"] = "시세 한도 대기 중 · 직전 값을 보여줍니다."
                        return stale
                    raise
                if "1903" not in text and "종목" not in text:
                    raise
        stale = _stale_quote(code)
        if stale:
            return stale
        raise last_error or RuntimeError("시세를 불러오지 못했습니다")


def get_quote(stex_tp: str, stk_cd: str, *, book: bool = True) -> dict:
    quote = get_quote_lite(stex_tp, stk_cd)
    if not book:
        return quote
    try:
        from app import book_hub

        snap = book_hub.snapshot()
        if (
            snap
            and str(snap.get("stkCd") or "").upper() == str(quote.get("stkCd") or "").upper()
            and (snap.get("asks") or snap.get("bids"))
        ):
            return quote
    except Exception:  # noqa: BLE001
        pass
    return _attach_rest_book(quote, quote.get("stexTp") or stex_tp, quote.get("stkCd") or stk_cd)


def peek_quote(stk_cd: str) -> dict | None:
    return _stale_quote(stk_cd.strip().upper())


def merge_book(quote: dict, book: dict | None) -> dict:
    if not book:
        return quote
    if str(book.get("stkCd") or "").upper() != str(quote.get("stkCd") or "").upper():
        return quote
    asks = [row for row in (book.get("asks") or []) if row.get("price")]
    bids = [row for row in (book.get("bids") or []) if row.get("price")]
    if not asks and not bids:
        return quote
    asks = sorted(asks, key=lambda row: row["price"], reverse=True)
    bids = sorted(bids, key=lambda row: row["price"], reverse=True)
    last = float(quote.get("last") or 0)
    mid = 0.0
    if asks and bids:
        mid = (asks[-1]["price"] + bids[0]["price"]) / 2
    elif asks:
        mid = asks[-1]["price"]
    elif bids:
        mid = bids[0]["price"]
    if last and mid and abs(mid - last) / last > 0.15:
        return quote
    quote = dict(quote)
    if not last:
        last = abs(float(book.get("last") or 0)) or mid
        if last:
            quote["last"] = last
    quote["asks"] = asks
    quote["bids"] = bids
    quote["bid"] = bids[0]["price"] if bids else quote.get("bid") or 0
    quote["ask"] = asks[-1]["price"] if asks else quote.get("ask") or 0
    quote["bidQty"] = bids[0]["qty"] if bids else 0
    quote["askQty"] = asks[-1]["qty"] if asks else 0
    quote["bookLive"] = True
    quote["bookNote"] = "실시간 10호가(FT)입니다. 호가를 누르면 지정가, 잔량을 누르면 방향이 채워집니다."
    return quote


def orderable_qty(stex_tp: str, stk_cd: str, price: float) -> int:
    body = _call(
        "ust31490",
        "/api/us/ordr",
        {"stk_cd": stk_cd.strip().upper(), "uv": str(price), "stex_tp": stex_tp},
    )
    for key in ("min_ord_alowq", "ord_alowq_100", "ord_alowq_50"):
        qty = int(abs(to_float(body.get(key))))
        if qty > 0:
            return qty
    return 0


def place_order(payload: dict) -> dict:
    side = payload["side"]
    api_id = "ust20000" if side == "buy" else "ust20001"
    body: dict = {
        "stex_tp": payload["stexTp"],
        "stk_cd": payload["stkCd"],
        "ord_qty": str(int(payload["qty"])),
        "trde_tp": payload.get("trdeTp") or "00",
    }
    if body["trde_tp"] != "03" and payload.get("price"):
        body["ord_uv"] = str(payload["price"])
    result = _call(api_id, "/api/us/ordr", body)
    return {
        "ordNo": str(result.get("ord_no") or ""),
        "stkNm": result.get("stk_nm") or payload.get("stkNm") or payload["stkCd"],
        "returnMsg": str(result.get("return_msg") or "ok"),
    }


def cancel_order(ord_no: str, stex_tp: str, stk_cd: str) -> dict:
    last_error: Exception | None = None
    for ex in _exchange_try_order(stex_tp):
        try:
            result = _call(
                "ust20003",
                "/api/us/ordr",
                {"orig_ord_no": ord_no, "stex_tp": ex, "stk_cd": stk_cd},
            )
            return {"ordNo": ord_no, "returnMsg": str(result.get("return_msg") or "cancelled")}
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if "1903" not in str(exc) and "종목" not in str(exc):
                raise
    raise last_error or RuntimeError("취소에 실패했습니다")


def modify_order(ord_no: str, stex_tp: str, stk_cd: str, price: float) -> dict:
    last_error: Exception | None = None
    for ex in _exchange_try_order(stex_tp):
        try:
            result = _call(
                "ust20002",
                "/api/us/ordr",
                {"orig_ord_no": ord_no, "stex_tp": ex, "stk_cd": stk_cd, "mdfy_uv": str(price)},
            )
            return {
                "ordNo": str(result.get("ord_no") or ord_no),
                "returnMsg": str(result.get("return_msg") or "modified"),
            }
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if "1903" not in str(exc) and "종목" not in str(exc):
                raise
    raise last_error or RuntimeError("정정에 실패했습니다")


def get_deposit() -> dict:
    body = _call("ust21110", "/api/us/acnt", {})
    cash_krw = to_float(body.get("krw_entra"))
    cash_usd = 0.0
    for row in body.get("result_list") or []:
        if not isinstance(row, dict):
            continue
        code = str(row.get("crnc_code") or "").upper()
        if code in {"USD", "US"}:
            cash_usd = to_float(row.get("fc_ord_alowa") or row.get("fc_entra"))
            break
    if cash_usd == 0 and body.get("result_list"):
        first = body["result_list"][0]
        if isinstance(first, dict):
            cash_usd = to_float(first.get("fc_ord_alowa") or first.get("fc_entra"))
    _set_status(connected=True)
    return {"cashUsd": cash_usd, "cashKrw": cash_krw}


def get_positions() -> dict:
    body = _call("ust21070", "/api/us/acnt", {"stex_tp": "", "stk_cd": ""})
    positions = []
    daily_pnl = to_float(body.get("tdy_pl_amt"))
    for row in _result_rows(body):
        qty = to_float(row.get("poss_qty") or row.get("qty"))
        if qty <= 0:
            continue
        fx = abs(to_float(row.get("exch_rate")))
        last = abs(to_float(row.get("now_pric")))
        avg = abs(to_float(row.get("frgn_stk_book_uv")))
        last_krw = abs(to_float(row.get("now_pric_krw"))) or (last * fx if fx else 0)
        avg_krw = abs(to_float(row.get("frgn_stk_book_uv_krw"))) or (avg * fx if fx else 0)
        value_krw = abs(to_float(row.get("evlt_amt_krw"))) or (qty * last_krw)
        api_last = last
        pnl = to_float(row.get("pl_amt"))
        pnl_krw = to_float(row.get("pl_amt_krw"))
        pl_rt = to_float(row.get("pl_rt"))
        base = abs(to_float(row.get("base_pric") or row.get("pred_close_pric") or row.get("base_close_pric")))
        peek = peek_quote(str(row.get("stk_cd") or "").upper())
        if peek:
            if peek.get("last"):
                last = float(peek["last"])
            if peek.get("prevClose"):
                base = float(peek["prevClose"])
        delta = (last - api_last) * qty if api_last else 0.0
        if pnl == 0 and avg:
            pnl = (api_last - avg) * qty
        pnl += delta
        if pnl_krw == 0:
            pnl_krw = pnl * fx if fx else 0.0
        else:
            pnl_krw += delta * fx if fx else 0.0
        if avg and qty:
            pl_rt = round(pnl / (avg * qty) * 100, 2)
        change_pct = 0.0
        if peek and peek.get("changePct"):
            change_pct = float(peek["changePct"])
        if base and last:
            change_pct = round((last - base) / base * 100, 2)
        positions.append(
            {
                "stkCd": str(row.get("stk_cd") or "").upper(),
                "stexTp": exchange_code(row.get("stex_nm") or row.get("stex_tp")),
                "stkNm": row.get("frgn_stk_nm") or row.get("stk_cd"),
                "qty": qty,
                "avgPrice": avg,
                "last": last,
                "prevClose": base,
                "fxUsdKrw": fx,
                "avgPriceKrw": avg_krw,
                "lastKrw": last * fx if fx and last != api_last else last_krw,
                "valueKrw": qty * last * fx if fx and last != api_last else value_krw,
                "pnl": pnl,
                "pnlKrw": pnl_krw,
                "plRt": pl_rt,
                "changePct": change_pct,
            }
        )
    fx = next((p["fxUsdKrw"] for p in positions if p.get("fxUsdKrw")), 0)
    _set_status(connected=True)
    return {"positions": positions, "dailyPnl": daily_pnl, "fxUsdKrw": fx}


def _as_rows(payload: dict, list_key: str, fields: list[str]) -> list[dict]:
    block = payload.get(list_key)
    if isinstance(block, list):
        if not block:
            return []
        if isinstance(block[0], dict):
            return [row for row in block if isinstance(row, dict)]
    first = payload.get(fields[0]) if fields else None
    if isinstance(first, list):
        rows = []
        n = len(first)
        for i in range(n):
            row = {}
            for field in fields:
                values = payload.get(field)
                row[field] = values[i] if isinstance(values, list) and i < len(values) else None
            rows.append(row)
        return rows
    return []


def _result_rows(payload: dict) -> list[dict]:
    for key in ("result_list", "result_lsit"):
        block = payload.get(key)
        if isinstance(block, list):
            return [row for row in block if isinstance(row, dict)]
    return []


def _side_of(row: dict) -> str:
    text = str(row.get("slby_tp") or row.get("slby_tp_nm") or "")
    if text in {"1", "매도"} or "매도" in text:
        return "sell"
    return "buy"


def _trde_of(row: dict) -> str:
    text = str(row.get("frgn_trde_tp") or row.get("frgn_trde_nm") or "").strip()
    if text in {"00", "03", "26", "27", "30", "33", "34", "35", "36", "37"}:
        return text
    if "시장" in text:
        return "03"
    if "LOC" in text:
        return "30"
    if "MOC" in text:
        return "33"
    return "00"


def _stamp(clock: object) -> str:
    text = str(clock or "").strip()
    day = time.strftime("%Y-%m-%d")
    if not text:
        return f"{day}T00:00:00"
    if "T" in text:
        return text
    if len(text) == 6 and text.isdigit():
        text = f"{text[:2]}:{text[2:4]}:{text[4:6]}"
    return f"{day}T{text}"


def _order_status(row: dict) -> str:
    rem = to_float(row.get("ord_remnq"))
    filled = to_float(row.get("cntr_qty"))
    cancelled = to_float(row.get("cncl_qty"))
    stat = str(row.get("ord_stat") or row.get("ord_stat_nm") or "")
    if "거부" in stat or "거절" in stat:
        return "rejected"
    if "취소" in stat or (cancelled > 0 and rem <= 0 and filled <= 0):
        return "cancelled"
    if filled > 0 and rem > 0:
        return "partial"
    if filled > 0 and rem <= 0:
        return "filled"
    if "체결" in stat and rem <= 0:
        return "filled"
    return "pending"


def _order_from_row(row: dict, fallback: dict[str, str]) -> dict | None:
    code = str(row.get("stk_cd") or "").strip().upper()
    ord_no = str(row.get("ord_no") or "").strip()
    if not code or not ord_no:
        return None
    qty = int(abs(to_float(row.get("ord_qty"))))
    if qty <= 0:
        qty = int(abs(to_float(row.get("cntr_qty"))))
    price = abs(to_float(row.get("ord_uv") or row.get("mdfy_uv")))
    return {
        "id": f"o-{ord_no}",
        "ordNo": ord_no,
        "stkCd": code,
        "stexTp": exchange_code(row.get("stex_tp") or row.get("stex_nm"), fallback.get(code, "ND")),
        "stkNm": row.get("frgn_stk_nm") or row.get("stk_nm") or code,
        "side": _side_of(row),
        "qty": qty,
        "price": price or None,
        "trdeTp": _trde_of(row),
        "status": _order_status(row),
        "createdAt": _stamp(row.get("ord_time") or row.get("cntr_time")),
    }


def _fill_from_row(row: dict) -> dict | None:
    qty = int(abs(to_float(row.get("cntr_qty"))))
    price = abs(to_float(row.get("cntr_uv")))
    if qty <= 0 or price <= 0:
        return None
    code = str(row.get("stk_cd") or "").strip().upper()
    ord_no = str(row.get("ord_no") or "").strip()
    at = _stamp(row.get("cntr_time") or row.get("ord_time"))
    return {
        "id": f"f-{ord_no}-{at}",
        "ordNo": ord_no,
        "stkCd": code,
        "stkNm": row.get("frgn_stk_nm") or row.get("stk_nm") or code,
        "side": _side_of(row),
        "qty": qty,
        "price": price,
        "at": at,
    }


def get_today_activity(fallback: dict[str, str] | None = None) -> dict:
    lookup = fallback or {}
    try:
        today = _call(
            "ust21150",
            "/api/us/acnt",
            {"ord_dt": "", "query_tp": "1", "slby_tp": "0", "stex_tp": "", "stk_cd": "", "oppo_trde_tp": "%", "fr_ord_no": ""},
        )
    except Exception:  # noqa: BLE001
        today = _call(
            "ust21150",
            "/api/us/acnt",
            {"ord_dt": "", "query_tp": "1", "slby_tp": "0", "stex_tp": "", "stk_cd": ""},
        )
    try:
        open_body = _call("ust21050", "/api/us/acnt", {"ord_dt": "", "slby_tp": "0", "stex_tp": "", "stk_cd": ""})
    except Exception:  # noqa: BLE001
        open_body = {}
    rank = {"pending": 0, "partial": 1, "filled": 2, "cancelled": 2, "rejected": 2}
    by_no: dict[str, dict] = {}
    fills: list[dict] = []
    for row in _result_rows(today) + _result_rows(open_body):
        order = _order_from_row(row, lookup)
        if not order:
            continue
        prev = by_no.get(order["ordNo"])
        if prev is None or rank.get(order["status"], 0) >= rank.get(prev.get("status"), 0):
            by_no[order["ordNo"]] = order
        fill = _fill_from_row(row)
        if fill:
            fills.append(fill)
    seen = set()
    unique_fills = []
    for fill in fills:
        key = (fill["ordNo"], fill["qty"], fill["price"], fill["at"])
        if key in seen:
            continue
        seen.add(key)
        unique_fills.append(fill)
    orders = sorted(by_no.values(), key=lambda row: row.get("createdAt") or "", reverse=True)
    unique_fills.sort(key=lambda row: row.get("at") or "", reverse=True)
    _set_status(connected=True)
    return {"orders": orders, "fills": unique_fills}


def _ymd(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 8:
        raise RuntimeError("날짜는 YYYYMMDD로 입력하세요")
    return digits


def _trade_from_row(row: dict) -> dict | None:
    deal_dt = str(row.get("deal_dt") or "").strip()
    if not deal_dt:
        return None
    qty = to_float(row.get("deal_qty"))
    return {
        "dealDt": deal_dt,
        "procTime": str(row.get("proc_time") or "").strip(),
        "kind": str(row.get("deal_kind_nm") or "").strip(),
        "remark": str(row.get("rmrk_nm") or "").strip(),
        "stkCd": str(row.get("stk_cd") or "").strip().upper(),
        "stkNm": str(row.get("stk_nm") or "").strip(),
        "qty": qty,
        "priceFx": to_float(row.get("uv_exrt")),
        "amountUsd": to_float(row.get("fc_deal_amt")),
        "amountKrw": to_float(row.get("deal_amt")),
        "feeUsd": to_float(row.get("fc_cmsn")),
        "taxUsd": to_float(row.get("fc_deal_tax") or row.get("frgn_pay_txam")),
        "taxKrw": to_float(row.get("tax_tot_amt")),
        "settleUsd": to_float(row.get("fc_exct_amt")),
        "settleKrw": to_float(row.get("exct_amt")),
        "cashUsd": to_float(row.get("fc_entra")),
        "cashKrw": to_float(row.get("entra_remn")),
        "media": str(row.get("mdia_nm") or "").strip(),
        "dealNo": str(row.get("deal_no") or "").strip(),
        "stexNm": str(row.get("stex_nm") or "").strip(),
        "crnc": str(row.get("crnc_code") or "").strip().upper(),
    }


def get_trade_history(strt_dt: str, end_dt: str, tp: str = "0", stex_tp: str = "", stk_cd: str = "") -> dict:
    start = _ymd(strt_dt)
    end = _ymd(end_dt)
    if start > end:
        raise RuntimeError("시작일이 종료일보다 늦습니다")
    body = {
        "strt_dt": start,
        "end_dt": end,
        "tp": tp or "0",
        "stex_tp": stex_tp or "",
        "stk_cd": (stk_cd or "").strip().upper(),
        "krw_repl_skip_yn": "N",
    }
    rows: list[dict] = []
    buy_sum = 0.0
    sell_sum = 0.0
    client = _client()
    for page in client.iterate_pages(api_id="ust21100", path="/api/us/acnt", body=body, max_pages=8, page_delay_seconds=0.25):
        payload = page.body or {}
        code = payload.get("return_code")
        if code not in (None, 0, "0"):
            raise RuntimeError(str(payload.get("return_msg") or f"return_code={code}"))
        buy_sum = to_float(payload.get("buy_sum")) or buy_sum
        sell_sum = to_float(payload.get("sell_sum")) or sell_sum
        for row in _result_rows(payload):
            mapped = _trade_from_row(row)
            if mapped:
                rows.append(mapped)
    rows.sort(key=lambda row: (row.get("dealDt") or "", row.get("procTime") or "", row.get("dealNo") or ""), reverse=True)
    _set_status(connected=True)
    return {"rows": rows, "buySum": buy_sum, "sellSum": sell_sum, "from": start, "to": end}


_hts_cache: tuple[float, list[dict]] | None = None


def get_hts_watchlists(*, force: bool = False) -> list[dict]:
    global _hts_cache
    now = time.time()
    if not force and _hts_cache and now - _hts_cache[0] < 300:
        return _hts_cache[1]
    body = _call("usa20200", "/api/us/watchlist", {})
    groups = _as_rows(body, "nofi", ["gcod", "name"])
    out = []
    for group in groups:
        gcod = str(group.get("gcod") or "").strip()
        name = str(group.get("name") or "").strip() or "HTS 관심종목"
        if not gcod:
            continue
        detail = _call("usa20201", "/api/us/watchlist", {"arn_grp_id": gcod})
        items = []
        for row in _as_rows(detail, "nofj", ["cod2", "stex_tp"]):
            code = str(row.get("cod2") or "").strip().upper()
            if not code:
                continue
            items.append({"stkCd": code, "stexTp": exchange_code(row.get("stex_tp")), "stkNm": code})
        out.append({"gcod": gcod, "name": name, "items": items})
    _set_status(connected=True)
    _hts_cache = (now, out)
    return out


_symbol_cache: tuple[float, list[dict]] | None = None


def search_symbols(query: str) -> list[dict]:
    q = query.strip().upper()
    if not q:
        return []
    hits: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(row: dict) -> None:
        code = str(row.get("stkCd") or "").upper()
        exch = exchange_code(row.get("stexTp"))
        if not code:
            return
        key = (exch, code)
        if key in seen:
            return
        seen.add(key)
        hits.append({"stkCd": code, "stexTp": exch, "stkNm": row.get("stkNm") or code})

    if KIWOOM_ENABLED:
        try:
            for row in _usa10098(q):
                add(row)
        except Exception:  # noqa: BLE001
            pass
        for row in _symbol_universe(block=False):
            add(row)
        _kick_universe()
    ranked = []
    for row in hits:
        code = row["stkCd"]
        name = str(row.get("stkNm") or "").upper()
        if q not in code and q not in name:
            continue
        ranked.append((0 if code.startswith(q) else 1, 0 if code == q else 1, code, row))
    ranked.sort(key=lambda item: (item[0], item[1], item[2]))
    return [row for _a, _b, _c, row in ranked[:8]]


def _usa10098(stk_cd: str) -> list[dict]:
    body = _call("usa10098", "/api/us/stkinfo", {"stk_cd": stk_cd})
    out = []
    for row in _as_rows(body, "list", ["stk_cd", "stex_tp", "stk_nm", "stk_enm"]):
        code = str(row.get("stk_cd") or "").upper()
        if not code:
            continue
        out.append(
            {
                "stkCd": code,
                "stexTp": exchange_code(row.get("stex_tp")),
                "stkNm": row.get("stk_enm") or row.get("stk_nm") or code,
            }
        )
    if not out:
        code = str(body.get("stk_cd") or stk_cd).upper()
        if code:
            out.append(
                {
                    "stkCd": code,
                    "stexTp": exchange_code(body.get("stex_tp")),
                    "stkNm": body.get("stk_enm") or body.get("stk_nm") or code,
                }
            )
    return out


_universe_loading = False


def _symbol_universe(*, block: bool = False) -> list[dict]:
    if _symbol_cache and time.time() - _symbol_cache[0] < 12 * 3600:
        return _symbol_cache[1]
    if block:
        _load_universe()
        return _symbol_cache[1] if _symbol_cache else []
    return []


def _kick_universe() -> None:
    global _universe_loading
    if not KIWOOM_ENABLED or _universe_loading or (_symbol_cache and time.time() - _symbol_cache[0] < 12 * 3600):
        return
    _universe_loading = True
    Thread(target=_load_universe, daemon=True).start()


def _load_universe() -> None:
    global _symbol_cache, _universe_loading
    try:
        rows = _load_usa10099()
        _symbol_cache = (time.time(), rows)
    except Exception:  # noqa: BLE001
        pass
    finally:
        _universe_loading = False


def _load_usa10099() -> list[dict]:
    client = _client()
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for page in client.iterate_pages(api_id="usa10099", path="/api/us/stkinfo", body={"stex_tp": "%"}, max_pages=8, page_delay_seconds=0.2):
        payload = page.body or {}
        for row in _as_rows(payload, "list", ["stk_cd", "stex_tp", "stk_nm", "stk_enm"]):
            code = str(row.get("stk_cd") or "").upper()
            exch = exchange_code(row.get("stex_tp"))
            if not code or (exch, code) in seen:
                continue
            seen.add((exch, code))
            out.append({"stkCd": code, "stexTp": exch, "stkNm": row.get("stk_enm") or row.get("stk_nm") or code})
    return out


def save_hts_watchlist(gcod: str, items: list[dict]) -> str:
    """키움 공식 REST는 미국주식 관심종목 조회만 있습니다. 쓰기는 스펙에 없습니다."""
    _ = (gcod, items)
    return (
        f"앱에 {len(items)}종목을 저장했습니다. "
        "키움 REST는 관심종목 조회(usa20200/usa20201)만 있어 영웅문 HTS에는 반영되지 않습니다."
    )


_INDEX_ROWS = (
    ("dji", "다우", "DJIA", "usd", ".DJI"),
    ("spx", "S&P 500", "S&P 500", "usd", ".SPX"),
    ("ixic", "나스닥", "Nasdaq Composite", "usd", ".IXIC"),
    ("tnx", "미국채 10년", "CBOE 10Y Yield", "pct", ".TNX"),
    ("wti", "WTI", "NYMEX 선물", "usd", "@CL.1"),
)
_markets_cache: tuple[float, dict] | None = None
_HTTP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"


def _http_get(url: str, timeout: float = 8.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": _HTTP_UA, "Accept": "application/json,text/plain,*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _cnbc_quotes(symbols: list[str]) -> dict[str, dict]:
    joined = "|".join(symbols)
    url = (
        "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol"
        f"?symbols={urllib.parse.quote(joined, safe='.|@')}&requestMethod=itv&noform=1&partnerId=2&fund=json"
    )
    payload = json.loads(_http_get(url).decode("utf-8", errors="replace"))
    out: dict[str, dict] = {}
    for raw in ((payload.get("FormattedQuoteResult") or {}).get("FormattedQuote") or []):
        last = abs(to_float(raw.get("last")))
        if not last:
            continue
        out[str(raw.get("symbol") or "")] = {
            "last": last,
            "change": to_float(raw.get("change")),
            "changePct": to_float(str(raw.get("change_pct") or "").replace("%", "")),
            "source": "cnbc",
            "hint": str(raw.get("exchange") or raw.get("name") or ""),
        }
    return out


def get_fx_rate(market: dict | None = None) -> dict:
    if KIWOOM_ENABLED:
        try:
            body = _call("ust31301", "/api/us/exchange", {"exch_tp": "1"})
            last = abs(to_float(body.get("aplc_exrt") or body.get("buy_aplc_exrt") or body.get("spcl_bf_exrt")))
            if last:
                from app.store import store

                store.set_fx(last)
                _set_status(connected=True)
                return {
                    "id": "usdkrw",
                    "label": "원달러",
                    "hint": "키움 적용환율",
                    "last": last,
                    "change": 0,
                    "changePct": 0,
                    "unit": "krw",
                    "source": "kiwoom",
                }
        except Exception:  # noqa: BLE001
            pass
    if not market:
        raise RuntimeError("환율을 불러오지 못했습니다")
    from app.store import store

    store.set_fx(float(market["last"]))
    return {
        "id": "usdkrw",
        "label": "원달러",
        "hint": "USD/KRW 시장환율",
        "last": market["last"],
        "change": market["change"],
        "changePct": market["changePct"],
        "unit": "krw",
        "source": market.get("source") or "cnbc",
    }


def get_markets() -> dict:
    global _markets_cache
    now = time.time()
    if _markets_cache and now - _markets_cache[0] < 90:
        return _markets_cache[1]
    symbols = [row[4] for row in _INDEX_ROWS] + ["KRW="]
    quotes: dict[str, dict] = {}
    try:
        quotes = _cnbc_quotes(symbols)
    except Exception:  # noqa: BLE001
        quotes = {}
    rows: list[dict] = []
    for row_id, label, hint, unit, symbol in _INDEX_ROWS:
        quote = quotes.get(symbol)
        if not quote:
            continue
        last = float(quote["last"])
        change = float(quote["change"])
        if row_id == "tnx" and last > 20:
            last /= 10
            change /= 10
        rows.append(
            {
                "id": row_id,
                "label": label,
                "hint": quote.get("hint") or hint,
                "last": last,
                "change": change,
                "changePct": quote["changePct"],
                "unit": unit,
                "source": quote.get("source") or "cnbc",
            }
        )
    try:
        fx = get_fx_rate(quotes.get("KRW="))
        rows.append(fx)
        spot = quotes.get("KRW=")
        if spot and fx.get("source") == "kiwoom":
            rows.append(
                {
                    "id": "usdkrw-spot",
                    "label": "시장환율",
                    "hint": "USD/KRW 현물",
                    "last": spot["last"],
                    "change": spot["change"],
                    "changePct": spot["changePct"],
                    "unit": "krw",
                    "source": spot.get("source") or "cnbc",
                }
            )
    except Exception:  # noqa: BLE001
        pass
    if not rows and _markets_cache:
        return _markets_cache[1]
    payload = {"markets": rows, "at": now}
    if rows:
        _markets_cache = (now, payload)
    return payload


_chart_lock = Lock()
_chart_cache: dict[str, tuple[float, dict]] = {}
_CHART_TTL = {"1": 20.0, "5": 30.0, "D": 120.0}


def get_chart(stex_tp: str, stk_cd: str, interval: str = "D") -> dict:
    code = stk_cd.strip().upper()
    if not _CODE_RE.fullmatch(code):
        raise RuntimeError("종목코드를 영문으로 입력하세요")
    tf = str(interval or "D").upper()
    if tf not in {"1", "5", "D"}:
        tf = "D"
    ex = exchange_code(stex_tp, "ND")
    key = f"{ex}:{code}:{tf}"
    ttl = _CHART_TTL[tf]
    with _chart_lock:
        hit = _chart_cache.get(key)
        if hit and time.time() - hit[0] < ttl:
            return dict(hit[1])
    if not KIWOOM_ENABLED:
        payload = _mock_chart(code, ex, tf)
        with _chart_lock:
            _chart_cache[key] = (time.time(), payload)
        return payload
    try:
        bars = _fetch_chart_bars(ex, code, tf)
        if not bars:
            raise RuntimeError("차트 데이터가 없습니다")
        payload = {"stkCd": code, "stexTp": ex, "interval": tf, "source": "kiwoom", "bars": bars, "note": ""}
        with _chart_lock:
            _chart_cache[key] = (time.time(), payload)
        return payload
    except Exception as exc:  # noqa: BLE001
        with _chart_lock:
            hit = _chart_cache.get(key)
        if hit:
            stale = dict(hit[1])
            stale["note"] = str(exc)[:120]
            return stale
        return {
            "stkCd": code,
            "stexTp": ex,
            "interval": tf,
            "source": "kiwoom",
            "bars": [],
            "note": str(exc)[:120],
        }


def _fetch_chart_bars(stex_tp: str, stk_cd: str, tf: str) -> list[dict]:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    if tf == "D":
        body = {
            "stex_tp": stex_tp,
            "stk_cd": stk_cd,
            "strt_dt": today,
            "upd_stkpc_tp": "1",
            "exrt_appl_tp": "0",
        }
        payload = _call("usa06012", "/api/us/chart", body)
        _set_status(connected=True)
        return _bars_from_list(payload.get("result_list") or [], daily=True)
    body = {
        "stex_tp": stex_tp,
        "stk_cd": stk_cd,
        "strt_dt": today,
        "tic_scope": tf,
        "upd_stkpc_tp": "1",
        "exrt_appl_tp": "0",
    }
    payload = _call("usa06011", "/api/us/chart", body)
    _set_status(connected=True)
    return _bars_from_list(payload.get("result_list") or [], daily=False)


def _bars_from_list(rows: object, *, daily: bool) -> list[dict]:
    if not isinstance(rows, list):
        return []
    bars: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        close = abs(to_float(row.get("cur_prc")))
        high = abs(to_float(row.get("high_pric") or close))
        low = abs(to_float(row.get("low_pric") or close))
        open_px = abs(to_float(row.get("open_pric") or close))
        if close <= 0:
            continue
        high = max(high, open_px, close)
        low = min(low if low > 0 else open_px, open_px, close)
        t = str(row.get("dt") if daily else (row.get("cntr_tm") or row.get("bus_dt")) or "").strip()
        vol = int(abs(to_float(row.get("acc_trde_qty") if daily else row.get("trde_qty"))))
        bars.append({"t": t, "o": open_px, "h": high, "l": low, "c": close, "v": vol})
    bars.sort(key=lambda b: b["t"])
    return bars[-120:]


def _mock_chart(stk_cd: str, stex_tp: str, tf: str) -> dict:
    last = 100.0
    peek = peek_quote(stk_cd)
    if peek and peek.get("last"):
        last = float(peek["last"])
    n = 80 if tf != "D" else 60
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(stk_cd)) or 1
    px = last * 0.94
    now = datetime.now(timezone.utc)
    step = timedelta(days=1) if tf == "D" else timedelta(minutes=int(tf or 1))
    start = now - step * n
    bars = []
    for i in range(n):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        move = ((seed % 1000) / 1000 - 0.48) * last * 0.012
        o = px
        c = max(0.01, px + move)
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        wiggle = ((seed % 800) / 1000) * last * 0.006
        h = max(o, c) + wiggle
        l = min(o, c) - wiggle * 0.7
        t = start + step * i
        stamp = t.strftime("%Y%m%d") if tf == "D" else t.strftime("%Y%m%d%H%M%S")
        bars.append({"t": stamp, "o": round(o, 4), "h": round(h, 4), "l": round(max(0.01, l), 4), "c": round(c, 4), "v": 1000 + seed % 9000})
        px = c
    return {"stkCd": stk_cd, "stexTp": stex_tp, "interval": tf, "source": "mock", "bars": bars, "note": "목업 차트입니다."}
