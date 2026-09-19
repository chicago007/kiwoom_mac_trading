from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import Any

from app.config import KIWOOM_ENABLED, KIWOOM_MODE
from app.kiwoom_gateway import to_float

logger = logging.getLogger(__name__)

FT_COLUMNS = {
    "41": "ask1",
    "61": "ask1qty",
    "51": "bid1",
    "71": "bid1qty",
    "42": "ask2",
    "62": "ask2qty",
    "52": "bid2",
    "72": "bid2qty",
    "43": "ask3",
    "63": "ask3qty",
    "53": "bid3",
    "73": "bid3qty",
    "44": "ask4",
    "64": "ask4qty",
    "54": "bid4",
    "74": "bid4qty",
    "45": "ask5",
    "65": "ask5qty",
    "55": "bid5",
    "75": "bid5qty",
    "46": "ask6",
    "66": "ask6qty",
    "56": "bid6",
    "76": "bid6qty",
    "47": "ask7",
    "67": "ask7qty",
    "57": "bid7",
    "77": "bid7qty",
    "48": "ask8",
    "68": "ask8qty",
    "58": "bid8",
    "78": "bid8qty",
    "49": "ask9",
    "69": "ask9qty",
    "59": "bid9",
    "79": "bid9qty",
    "50": "ask10",
    "70": "ask10qty",
    "60": "bid10",
    "80": "bid10qty",
}

_lock = threading.Lock()
_wanted: tuple[str, str] | None = None
_book: dict[str, Any] | None = None
_error = ""
_generation = 0
_thread: threading.Thread | None = None
_stop = threading.Event()


def watch(stex_tp: str, stk_cd: str) -> int:
    global _wanted, _book, _generation
    key = ((stex_tp or "ND").upper(), stk_cd.strip().upper())
    with _lock:
        if _wanted != key:
            _book = None
            _generation += 1
        _wanted = key
        return _generation


def generation() -> int:
    with _lock:
        return _generation


def snapshot() -> dict[str, Any] | None:
    with _lock:
        return dict(_book) if _book else None


def last_error() -> str:
    with _lock:
        return _error


def start() -> None:
    global _thread
    if not KIWOOM_ENABLED:
        return
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_run_loop, name="kiwoom-ft", daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()


def _same_symbol(code: str, wanted: str) -> bool:
    if not code or not wanted:
        return False
    if code == wanted:
        return True
    return code.endswith(wanted) or wanted.endswith(code)


def _event_code(event: dict[str, Any]) -> str:
    item = event.get("item")
    if isinstance(item, dict):
        raw = item.get("jmcode") or item.get("stk_cd") or item.get("item") or ""
    else:
        raw = item or ""
    text = str(raw).strip().upper().replace(" ", "")
    if text.endswith(("ND", "NY", "NA")) and len(text) > 2:
        text = text[:-2]
    return text


def _field(event: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in event and event.get(key) not in (None, ""):
            return event.get(key)
    return None


def _levels(event: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    source = {str(k): v for k, v in event.items()}
    nested = event.get("values")
    if isinstance(nested, dict) and not any(source.get(f"ask{i}") for i in range(1, 11)):
        remapped = {FT_COLUMNS.get(str(k), str(k)): v for k, v in nested.items()}
        remapped.update(source)
        source = remapped

    asks = []
    for i in range(10, 0, -1):
        price = abs(to_float(_field(source, f"ask{i}", str(40 + i))))
        qty = int(abs(to_float(_field(source, f"ask{i}qty", str(60 + i)))))
        if price > 0:
            asks.append({"price": price, "qty": qty})
    bids = []
    for i in range(1, 11):
        price = abs(to_float(_field(source, f"bid{i}", str(50 + i))))
        qty = int(abs(to_float(_field(source, f"bid{i}qty", str(70 + i)))))
        if price > 0:
            bids.append({"price": price, "qty": qty})
    return asks, bids


def _run_loop() -> None:
    asyncio.run(_main())


async def _main() -> None:
    from kiwoom import get_ws_client
    from kiwoom.realtime.events import normalize_message_events

    global _error, _book
    log = logging.getLogger("uvicorn.error")
    current: tuple[str, str] | None = None
    client = None
    seen = 0
    while not _stop.is_set():
        with _lock:
            wanted = _wanted
        if not wanted:
            await asyncio.sleep(0.2)
            continue
        try:
            if client is None or not client.is_connected:
                if client is not None:
                    await client.close()
                client = get_ws_client(KIWOOM_MODE)
                await client.connect(api_url="/api/us/websocket")
                current = None
            if wanted != current:
                await asyncio.sleep(0.35)
                with _lock:
                    wanted = _wanted
                if not wanted:
                    continue
                if wanted == current:
                    continue
                stex, code = wanted
                await client.send(
                    {
                        "trnm": "REG",
                        "grp_no": "1",
                        "refresh": "0",
                        "data": [{"item": [{"jmcode": code, "stex_tp": stex}], "type": ["FT"]}],
                    }
                )
                current = wanted
                seen = 0
                with _lock:
                    _error = ""
                    _book = None
                log.warning("ft registered %s %s", stex, code)
            try:
                message = await asyncio.wait_for(client.recv(), timeout=1.5)
            except TimeoutError:
                continue
            for event in normalize_message_events(message, FT_COLUMNS):
                trnm = str(event.get("trnm") or "").upper()
                if trnm == "REG":
                    if event.get("return_code") not in (None, 0, "0"):
                        raise RuntimeError(str(event.get("return_msg") or "FT 등록 실패"))
                    continue
                if trnm != "REAL":
                    if seen < 8:
                        log.warning("ft skip %s keys=%s", trnm, list(event)[:12])
                        seen += 1
                    continue
                code = _event_code(event)
                if code and current and not _same_symbol(code, current[1]):
                    continue
                asks, bids = _levels(event)
                if seen < 8:
                    log.warning(
                        "ft real item=%r type=%r asks=%s bids=%s keys=%s",
                        event.get("item"),
                        event.get("type"),
                        len(asks),
                        len(bids),
                        list(event)[:16],
                    )
                    seen += 1
                if not asks and not bids:
                    continue
                with _lock:
                    if _wanted != current:
                        continue
                    _book = {
                        "stexTp": current[0],
                        "stkCd": current[1],
                        "last": abs(to_float(_field(event, "21", "cur_prc", "last"))),
                        "asks": asks,
                        "bids": bids,
                        "bid": bids[0]["price"] if bids else 0,
                        "ask": asks[-1]["price"] if asks else 0,
                        "bidQty": bids[0]["qty"] if bids else 0,
                        "askQty": asks[-1]["qty"] if asks else 0,
                        "at": time.time(),
                    }
        except Exception as exc:  # noqa: BLE001
            log.warning("ft hub: %s", exc)
            with _lock:
                _error = str(exc)[:200]
            if client is not None:
                try:
                    await client.close()
                except Exception:
                    pass
                client = None
            current = None
            await asyncio.sleep(2)
    if client is not None:
        await client.close()
