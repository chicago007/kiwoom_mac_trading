from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.config import KIWOOM_ENABLED, KIWOOM_MODE, KIWOOM_ORDERS_ENABLED
from app import book_hub, kiwoom_gateway
from app.store import store

ROOT = Path(__file__).resolve().parents[2]
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip() if (ROOT / "VERSION").exists() else "0.11"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    book_hub.start()
    yield
    book_hub.stop()


app = FastAPI(title="Mac용 키움 REST API 기반 미국주식 수동매매 API", version=VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3010", "http://localhost:3010"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class WatchlistCreate(BaseModel):
    name: str


class ItemCreate(BaseModel):
    stkCd: str
    stexTp: str
    stkNm: str
    last: float = 0
    prevClose: float = 0
    open: float = 0
    changePct: float = 0


class OrderCreate(BaseModel):
    stkCd: str
    stexTp: str
    stkNm: str = ""
    side: str
    qty: int
    price: float | None = None
    trdeTp: str = "00"
    client_order_id: str | None = None


class OrderModify(BaseModel):
    price: float


class ModeBody(BaseModel):
    mode: str = Field(pattern="^(real|demo)$")


class SettingsPatch(BaseModel):
    dailyLossLimitUsd: float | None = None
    maxQtyPerSymbol: int | None = None
    maxNotionalUsd: float | None = None
    notifyTelegram: bool | None = None


UI_ORIGIN = "http://127.0.0.1:3010"


def _ui(path: str, request: Request) -> RedirectResponse:
    target = f"{UI_ORIGIN}{path}"
    if request.url.query:
        target = f"{target}?{request.url.query}"
    return RedirectResponse(target)


@app.get("/")
def redirect_home(request: Request) -> RedirectResponse:
    return _ui("/", request)


@app.get("/watchlists")
def redirect_watchlists(request: Request) -> RedirectResponse:
    return _ui("/", request)


@app.get("/orders")
def redirect_orders(request: Request) -> RedirectResponse:
    return _ui("/trade", request)


@app.get("/trade")
def redirect_trade(request: Request) -> RedirectResponse:
    return _ui("/trade", request)


@app.get("/portfolio")
def redirect_portfolio(request: Request) -> RedirectResponse:
    return _ui("/trade", request)


@app.get("/logs")
def redirect_logs(request: Request) -> RedirectResponse:
    return _ui("/logs", request)


@app.get("/settings")
def redirect_settings(request: Request) -> RedirectResponse:
    return _ui("/settings", request)


@app.get("/api/health")
def health() -> dict:
    info = kiwoom_gateway.ping() if KIWOOM_ENABLED else {"connected": False, "source": "mock", "error": "", "mode": KIWOOM_MODE}
    store.set_kiwoom_status(bool(info.get("connected")), str(info.get("error") or ""))
    return {
        "ok": True,
        "version": VERSION,
        "kiwoom": "connected" if info.get("connected") else "disconnected",
        "mode": info.get("mode") or KIWOOM_MODE,
        "source": info.get("source") or "mock",
        "error": info.get("error") or "",
        "orders": "live" if KIWOOM_ORDERS_ENABLED else "mock",
        "note": "시세·호가·예수금은 키움. 주문은 2단계 확인 후 키움으로 나갑니다."
        if KIWOOM_ENABLED and KIWOOM_ORDERS_ENABLED
        else "시세·예수금·잔고는 키움, 주문은 아직 목업입니다."
        if KIWOOM_ENABLED
        else "목업입니다.",
    }


@app.get("/api/state")
def get_state() -> dict:
    if KIWOOM_ENABLED:
        try:
            deposit = kiwoom_gateway.get_deposit()
            positions = kiwoom_gateway.get_positions()
            snap = store.apply_live_account(deposit, positions)
            fallback = {str(p.get("stkCd")): str(p.get("stexTp") or "ND") for p in snap.get("positions") or []}
            for item in snap.get("items") or []:
                fallback.setdefault(str(item.get("stkCd")), str(item.get("stexTp") or "ND"))
            try:
                activity = kiwoom_gateway.get_today_activity(fallback)
                snap = store.apply_live_orders(activity.get("orders") or [], activity.get("fills") or [])
            except Exception as exc:  # noqa: BLE001
                with store._lock:
                    store._log("warn", "ust21150", str(exc)[:200])
                snap = store.snapshot()
            try:
                hts = kiwoom_gateway.get_hts_watchlists()
                if hts:
                    snap = store.apply_hts_watchlists(hts)
            except Exception as exc:  # noqa: BLE001
                with store._lock:
                    store._log("warn", "usa20200", str(exc)[:200])
                snap = store.snapshot()
            snap["ordersLive"] = bool(KIWOOM_ENABLED and KIWOOM_ORDERS_ENABLED)
            return snap
        except Exception as exc:  # noqa: BLE001
            store.set_kiwoom_status(False, str(exc)[:200])
    snap = store.snapshot()
    snap["kiwoom"] = "connected" if kiwoom_gateway.status().get("connected") else snap.get("kiwoom", "disconnected")
    snap["kiwoomError"] = kiwoom_gateway.status().get("error") or snap.get("kiwoomError") or ""
    snap["ordersLive"] = bool(KIWOOM_ENABLED and KIWOOM_ORDERS_ENABLED)
    return snap


@app.get("/api/watchlists")
def list_watchlists() -> dict:
    snap = store.snapshot()
    return {"watchlists": snap["watchlists"], "items": snap["items"]}


@app.post("/api/watchlists")
def create_watchlist(body: WatchlistCreate) -> dict:
    if not body.name.strip():
        raise HTTPException(400, "name is required")
    return store.add_watchlist(body.name.strip())


@app.delete("/api/watchlists/{watchlist_id}")
def delete_watchlist(watchlist_id: str) -> dict:
    return store.remove_watchlist(watchlist_id)


@app.post("/api/watchlists/{watchlist_id}/items")
def add_item(watchlist_id: str, body: ItemCreate) -> dict:
    return store.add_item(watchlist_id, body.model_dump())


@app.delete("/api/watchlists/{watchlist_id}/items/{item_id}")
def delete_item(watchlist_id: str, item_id: str) -> dict:
    return store.remove_item(item_id)


@app.post("/api/watchlists/{watchlist_id}/items/{item_id}/toggle")
def toggle_item(watchlist_id: str, item_id: str) -> dict:
    return store.toggle_item(item_id)


@app.post("/api/watchlists/{watchlist_id}/import-kiwoom")
def import_kiwoom(watchlist_id: str) -> dict:
    return store.import_kiwoom(watchlist_id)


@app.post("/api/watchlists/{watchlist_id}/save")
def save_watchlist(watchlist_id: str) -> dict:
    return store.save_watchlist(watchlist_id)


@app.get("/api/symbols/search")
def search_symbols(q: str = "") -> dict:
    local = store.search_symbols(q)
    if KIWOOM_ENABLED:
        try:
            live = kiwoom_gateway.search_symbols(q)
            seen = {(row["stexTp"], row["stkCd"]) for row in live}
            for row in local:
                key = (row["stexTp"], row["stkCd"])
                if key not in seen:
                    live.append(row)
                    seen.add(key)
            return {"results": live[:8]}
        except Exception:  # noqa: BLE001
            pass
    return {"results": local}


def _blank_quote(stk_cd: str, stex_tp: str) -> dict:
    code = stk_cd.strip().upper()
    return {
        "stkCd": code,
        "stkNm": code,
        "stexTp": stex_tp,
        "last": 0,
        "open": 0,
        "high": 0,
        "low": 0,
        "prevClose": 0,
        "change": 0,
        "changePct": 0,
        "volume": 0,
        "bid": 0,
        "ask": 0,
        "bidQty": 0,
        "askQty": 0,
        "asks": [],
        "bids": [],
        "source": "kiwoom",
        "bookLive": False,
        "bookNote": "실시간 10호가 수신 중…",
    }


def _rest_quote(stk_cd: str, stex_tp: str, book: bool = False) -> dict:
    if KIWOOM_ENABLED:
        try:
            quote = kiwoom_gateway.get_quote(stex_tp, stk_cd, book=book) if book else kiwoom_gateway.get_quote_lite(stex_tp, stk_cd)
            if quote.get("fxUsdKrw"):
                store.set_fx(float(quote["fxUsdKrw"]))
            return quote
        except Exception as exc:  # noqa: BLE001
            stub = _blank_quote(stk_cd, stex_tp)
            stub["bookNote"] = str(exc)[:200]
            return stub
    return store.get_quote(stex_tp, stk_cd)


def _merge_quote(quote: dict) -> dict:
    merged = kiwoom_gateway.merge_book(dict(quote), book_hub.snapshot())
    if not merged.get("bookLive") and not (merged.get("asks") or merged.get("bids")):
        err = book_hub.last_error()
        merged["bookNote"] = f"실시간 호가 대기: {err}" if err else (merged.get("bookNote") or "실시간 10호가 수신 중…")
    return merged


@app.get("/api/quotes")
def get_quote(stk_cd: str, stex_tp: str = "ND", lite: bool = False) -> dict:
    if not stk_cd.strip():
        raise HTTPException(400, "stk_cd is required")
    if not lite:
        book_hub.watch(stex_tp, stk_cd)
    return _merge_quote(_rest_quote(stk_cd, stex_tp, not lite))


@app.get("/api/quotes/live")
def live_quote(stk_cd: str, stex_tp: str = "ND") -> dict:
    if not stk_cd.strip():
        raise HTTPException(400, "stk_cd is required")
    code = stk_cd.strip().upper()
    book_hub.watch(stex_tp, code)
    base = kiwoom_gateway.peek_quote(code) or _blank_quote(code, stex_tp)
    return _merge_quote(base)


@app.get("/api/charts")
def get_chart(stk_cd: str, stex_tp: str = "ND", interval: str = "D") -> dict:
    if not stk_cd.strip():
        raise HTTPException(400, "stk_cd is required")
    try:
        return kiwoom_gateway.get_chart(stex_tp, stk_cd, interval)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)[:200]) from exc


@app.get("/api/markets")
def get_markets() -> dict:
    try:
        return kiwoom_gateway.get_markets()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, str(exc)[:200]) from exc


@app.get("/api/trades")
def trades(strt_dt: str, end_dt: str, tp: str = "0", stex_tp: str = "", stk_cd: str = "") -> dict:
    if not KIWOOM_ENABLED:
        return {"rows": [], "buySum": 0, "sellSum": 0, "from": strt_dt, "to": end_dt, "note": "키움이 꺼져 있습니다."}
    try:
        return kiwoom_gateway.get_trade_history(strt_dt, end_dt, tp=tp, stex_tp=stex_tp, stk_cd=stk_cd)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)[:200]) from exc


@app.get("/api/quotes/stream")
async def quote_stream(stk_cd: str, stex_tp: str = "ND"):
    if not stk_cd.strip():
        raise HTTPException(400, "stk_cd is required")

    async def events():
        import asyncio
        import json

        code = stk_cd.strip().upper()
        token = book_hub.watch(stex_tp, code)
        quote = kiwoom_gateway.peek_quote(code) or _blank_quote(code, stex_tp)
        quote = _merge_quote(quote)
        yield f"data: {json.dumps(quote, ensure_ascii=False)}\n\n"
        quote = await asyncio.to_thread(_rest_quote, code, quote.get("stexTp") or stex_tp, True)
        token = book_hub.watch(quote.get("stexTp") or stex_tp, quote.get("stkCd") or code)
        quote = _merge_quote(quote)
        yield f"data: {json.dumps(quote, ensure_ascii=False)}\n\n"
        ticks = 0
        while True:
            await asyncio.sleep(0.4)
            if book_hub.generation() != token:
                break
            ticks += 1
            if ticks % 50 == 0:
                quote = await asyncio.to_thread(_rest_quote, quote.get("stkCd") or code, quote.get("stexTp") or stex_tp, False)
                token = book_hub.watch(quote.get("stexTp") or stex_tp, quote.get("stkCd") or code)
            quote = _merge_quote(quote)
            yield f"data: {json.dumps(quote, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.get("/api/orders/able")
def orderable(stk_cd: str, stex_tp: str = "ND", price: float = 0, side: str = "buy") -> dict:
    code = stk_cd.strip().upper()
    if not code:
        raise HTTPException(400, "stk_cd is required")
    snap = store.snapshot()
    cash = float(snap.get("cashUsd") or 0)
    px = float(price or 0)
    cash_qty = int(cash // px) if px > 0 else 0
    pos = next(
        (p for p in snap.get("positions") or [] if str(p.get("stkCd") or "").upper() == code and p.get("stexTp") == stex_tp),
        None,
    )
    hold_qty = int(abs(float(pos.get("qty") or 0))) if pos else 0
    able = hold_qty if side == "sell" else cash_qty
    source = "position" if side == "sell" else "cash"
    if side == "buy" and KIWOOM_ENABLED and px > 0:
        try:
            live = kiwoom_gateway.orderable_qty(stex_tp, code, px)
            if live > 0:
                able = live
                source = "ust31490"
        except Exception as exc:  # noqa: BLE001
            store._log("warn", "ust31490", str(exc)[:200])
    return {"able": able, "cashUsd": cash, "holdQty": hold_qty, "source": source}


@app.get("/api/orders")
def list_orders() -> dict:
    snap = store.snapshot()
    return {"orders": snap["orders"], "fills": snap["fills"]}


@app.post("/api/orders")
def create_order(body: OrderCreate) -> dict:
    payload = body.model_dump()
    payload["stkNm"] = payload["stkNm"] or payload["stkCd"]
    if store.snapshot().get("killSwitch"):
        return store.place_order(payload)
    if KIWOOM_ENABLED and KIWOOM_ORDERS_ENABLED:
        try:
            if payload.get("side") == "buy" and payload.get("price"):
                try:
                    able = kiwoom_gateway.orderable_qty(payload["stexTp"], payload["stkCd"], float(payload["price"]))
                    if able and payload["qty"] > able:
                        payload["qty"] = able
                        store._log("warn", "ust31490", f"{payload['stkCd']} 가능수량 {able}주로 조정")
                except Exception as exc:  # noqa: BLE001
                    store._log("warn", "ust31490", str(exc)[:200])
            live = kiwoom_gateway.place_order(payload)
            if not live.get("ordNo"):
                raise RuntimeError(live.get("returnMsg") or "주문번호 없음")
            payload["stkNm"] = live.get("stkNm") or payload["stkNm"]
            return store.place_order(payload, live=live)
        except Exception as exc:  # noqa: BLE001
            store._log("error", "OrderService", str(exc)[:200])
            raise HTTPException(400, str(exc)[:200]) from exc
    return store.place_order(payload)


@app.post("/api/orders/{ord_no}/cancel")
def cancel_order(ord_no: str) -> dict:
    if KIWOOM_ENABLED and KIWOOM_ORDERS_ENABLED:
        snap = store.snapshot()
        row = next((o for o in snap["orders"] if o["ordNo"] == ord_no or o["id"] == ord_no), None)
        if not row:
            raise HTTPException(404, "order not found")
        try:
            kiwoom_gateway.cancel_order(row["ordNo"], row["stexTp"], row["stkCd"])
            return store.cancel_order(ord_no, live=True)
        except Exception as exc:  # noqa: BLE001
            store._log("error", "ust20003", str(exc)[:200])
            raise HTTPException(400, str(exc)[:200]) from exc
    return store.cancel_order(ord_no)


@app.post("/api/orders/{ord_no}/modify")
def modify_order(ord_no: str, body: OrderModify) -> dict:
    if body.price <= 0:
        raise HTTPException(400, "price must be positive")
    snap = store.snapshot()
    row = next((o for o in snap["orders"] if o["ordNo"] == ord_no or o["id"] == ord_no), None)
    if not row:
        raise HTTPException(404, "order not found")
    if KIWOOM_ENABLED and KIWOOM_ORDERS_ENABLED:
        try:
            live = kiwoom_gateway.modify_order(row["ordNo"], row["stexTp"], row["stkCd"], float(body.price))
            return store.modify_order(ord_no, float(body.price), live=live)
        except Exception as exc:  # noqa: BLE001
            store._log("error", "ust20002", str(exc)[:200])
            raise HTTPException(400, str(exc)[:200]) from exc
    return store.modify_order(ord_no, float(body.price))


@app.get("/api/account/deposit")
def deposit() -> dict:
    if KIWOOM_ENABLED:
        try:
            data = kiwoom_gateway.get_deposit()
            store.apply_live_account(data)
            snap = store.snapshot()
            return {"cashUsd": snap["cashUsd"], "cashKrw": snap["cashKrw"], "dailyPnl": snap["dailyPnl"]}
        except Exception:  # noqa: BLE001
            pass
    snap = store.snapshot()
    return {"cashUsd": snap["cashUsd"], "cashKrw": snap["cashKrw"], "dailyPnl": snap["dailyPnl"]}


@app.get("/api/account/positions")
def positions() -> dict:
    if KIWOOM_ENABLED:
        try:
            data = kiwoom_gateway.get_positions()
            store.apply_live_account({}, data)
            return {"positions": store.snapshot()["positions"]}
        except Exception:  # noqa: BLE001
            pass
    return {"positions": store.snapshot()["positions"]}


@app.post("/api/system/kill")
def kill() -> dict:
    return store.toggle_kill()


@app.post("/api/system/mode")
def set_mode(body: ModeBody) -> dict:
    return store.set_mode(body.mode)


@app.patch("/api/system/settings")
def settings(body: SettingsPatch) -> dict:
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    return store.update_settings(patch)
