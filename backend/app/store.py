from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _uid(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:6]}"


SEED = {
    "mode": "real",
    "killSwitch": False,
    "cashUsd": 0,
    "cashKrw": 0,
    "dailyPnl": 0,
    "kiwoom": "disconnected",
    "kiwoomError": "",
    "fxUsdKrw": 0,
    "selectedWatchlistId": "wl-holdings",
    "watchlists": [
        {"id": "wl-holdings", "name": "보유종목", "source": "holdings"},
        {"id": "wl-kiwoom", "name": "HTS 관심종목", "source": "kiwoom_import"},
    ],
    "items": [],
    "orders": [],
    "fills": [],
    "positions": [],
    "logs": [],
    "settings": {
        "dailyLossLimitUsd": 300,
        "maxQtyPerSymbol": 20,
        "maxNotionalUsd": 5000,
        "notifyTelegram": False,
    },
}

SYMBOLS = [
    {"stkCd": "NVDA", "stexTp": "ND", "stkNm": "NVIDIA", "last": 177.82, "prevClose": 174.1, "open": 175.4, "changePct": 2.14},
    {"stkCd": "AAPL", "stexTp": "ND", "stkNm": "Apple", "last": 228.4, "prevClose": 226.9, "open": 227.2, "changePct": 0.66},
    {"stkCd": "MSFT", "stexTp": "ND", "stkNm": "Microsoft", "last": 418.75, "prevClose": 421.1, "open": 420.0, "changePct": -0.56},
    {"stkCd": "AMZN", "stexTp": "ND", "stkNm": "Amazon", "last": 192.3, "prevClose": 189.8, "open": 190.4, "changePct": 1.32},
    {"stkCd": "META", "stexTp": "ND", "stkNm": "Meta", "last": 512.4, "prevClose": 508.1, "open": 509.0, "changePct": 0.85},
    {"stkCd": "GOOGL", "stexTp": "ND", "stkNm": "Alphabet", "last": 168.9, "prevClose": 166.2, "open": 167.1, "changePct": 1.62},
    {"stkCd": "TSLA", "stexTp": "ND", "stkNm": "Tesla", "last": 241.55, "prevClose": 248.2, "open": 246.0, "changePct": -2.68},
    {"stkCd": "BRK.B", "stexTp": "NY", "stkNm": "Berkshire B", "last": 498.2, "prevClose": 495.0, "open": 496.1, "changePct": 0.65},
    {"stkCd": "JPM", "stexTp": "NY", "stkNm": "JPMorgan", "last": 248.1, "prevClose": 245.6, "open": 246.2, "changePct": 1.02},
    {"stkCd": "AMD", "stexTp": "ND", "stkNm": "AMD", "last": 158.2, "prevClose": 154.8, "open": 155.1, "changePct": 2.2},
]


class AppStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._state = deepcopy(SEED)

    def snapshot(self) -> dict:
        with self._lock:
            return deepcopy(self._state)

    def _log(self, level: str, source: str, message: str, code: str | None = None) -> None:
        row = {"id": _uid("l"), "at": _now(), "level": level, "source": source, "message": message}
        if code:
            row["code"] = code
        self._state["logs"].insert(0, row)

    def set_mode(self, mode: str) -> dict:
        with self._lock:
            self._state["mode"] = mode
            self._log("warn", "Settings", f"모드 전환: {mode}")
            return deepcopy(self._state)

    def toggle_kill(self) -> dict:
        with self._lock:
            self._state["killSwitch"] = not self._state["killSwitch"]
            on = self._state["killSwitch"]
            self._log("warn", "KillSwitch", "킬스위치 활성. 신규 주문 차단" if on else "킬스위치 해제. 신규 주문 가능")
            return deepcopy(self._state)

    def add_watchlist(self, name: str) -> dict:
        with self._lock:
            item = {"id": _uid("wl"), "name": name, "source": "app"}
            self._state["watchlists"].append(item)
            self._state["selectedWatchlistId"] = item["id"]
            return deepcopy(self._state)

    def remove_watchlist(self, watchlist_id: str) -> dict:
        with self._lock:
            row = next((w for w in self._state["watchlists"] if w["id"] == watchlist_id), None)
            if row and row.get("source") in {"holdings", "kiwoom_import"}:
                return deepcopy(self._state)
            self._state["watchlists"] = [w for w in self._state["watchlists"] if w["id"] != watchlist_id]
            self._state["items"] = [i for i in self._state["items"] if i["watchlistId"] != watchlist_id]
            rest = self._state["watchlists"]
            self._state["selectedWatchlistId"] = rest[0]["id"] if rest else ""
            return deepcopy(self._state)

    def add_item(self, watchlist_id: str, payload: dict) -> dict:
        with self._lock:
            exists = any(
                i["watchlistId"] == watchlist_id and i["stkCd"] == payload["stkCd"] and i["stexTp"] == payload["stexTp"]
                for i in self._state["items"]
            )
            if not exists:
                self._state["items"].append({**payload, "id": _uid("i"), "watchlistId": watchlist_id, "enabled": True})
            return deepcopy(self._state)

    def remove_item(self, item_id: str) -> dict:
        with self._lock:
            self._state["items"] = [i for i in self._state["items"] if i["id"] != item_id]
            return deepcopy(self._state)

    def toggle_item(self, item_id: str) -> dict:
        with self._lock:
            for item in self._state["items"]:
                if item["id"] == item_id:
                    item["enabled"] = not item["enabled"]
            return deepcopy(self._state)

    def import_kiwoom(self, watchlist_id: str) -> dict:
        from app import kiwoom_gateway

        try:
            groups = kiwoom_gateway.get_hts_watchlists(force=True)
        except Exception as exc:  # noqa: BLE001
            with self._lock:
                self._log("error", "usa20200", str(exc)[:200])
                return deepcopy(self._state)
        with self._lock:
            self._sync_watchlists_unlocked(groups)
            added = sum(1 for i in self._state["items"] if str(i["watchlistId"]).startswith("wl-hts") or i["watchlistId"] == "wl-kiwoom")
            self._log("info", "usa20201", f"키움 관심그룹에서 {added}종목 반영")
            return deepcopy(self._state)

    def place_order(self, payload: dict, live: dict | None = None) -> dict:
        with self._lock:
            if self._state["killSwitch"]:
                self._log("block", "KillSwitch", "신규 주문 차단", "KILLED")
                return deepcopy(self._state)
            order = {
                **payload,
                "id": _uid("o"),
                "ordNo": (live or {}).get("ordNo") or str(uuid4().int)[:9].zfill(9),
                "status": "pending" if not (live or {}).get("rejected") else "rejected",
                "createdAt": _now(),
            }
            self._state["orders"].insert(0, order)
            source = "ust20000" if payload.get("side") == "buy" else "ust20001"
            note = "키움 주문 접수" if live else "목업 주문 접수"
            self._log("info", source, f"{note} {order['stkCd']} {order['qty']}주 ({order['trdeTp']}) #{order['ordNo']}", "0")
            return deepcopy(self._state)

    def cancel_order(self, order_id: str, live: bool = False) -> dict:
        with self._lock:
            for row in self._state["orders"]:
                if row["id"] == order_id or row["ordNo"] == order_id:
                    row["status"] = "cancelled"
            self._log("info", "ust20003", "키움 취소 요청" if live else "목업 취소 요청", "0")
            return deepcopy(self._state)

    def modify_order(self, order_id: str, price: float, live: dict | None = None) -> dict:
        with self._lock:
            for row in self._state["orders"]:
                if row["id"] == order_id or row["ordNo"] == order_id:
                    row["price"] = price
                    row["status"] = "pending"
                    if live and live.get("ordNo"):
                        row["ordNo"] = live["ordNo"]
            self._log("info", "ust20002", f"키움 정정 요청 {price}", "0")
            return deepcopy(self._state)

    def apply_live_orders(self, orders: list[dict], fills: list[dict]) -> dict:
        with self._lock:
            old = {str(row.get("ordNo")): row for row in self._state["orders"]}
            merged = []
            live_nos = set()
            for row in orders:
                ord_no = str(row.get("ordNo") or "")
                live_nos.add(ord_no)
                prev = old.get(ord_no)
                if prev and row.get("stexTp") in {None, "", "ND"} and prev.get("stexTp") not in {None, "", "ND"}:
                    row = {**row, "stexTp": prev["stexTp"]}
                elif prev and row.get("stexTp") == "ND" and prev.get("stexTp") in {"NY", "NA"}:
                    row = {**row, "stexTp": prev["stexTp"]}
                merged.append(row)
            cutoff = datetime.now(timezone.utc)
            for row in self._state["orders"]:
                if str(row.get("ordNo")) in live_nos:
                    continue
                if row.get("status") not in {"pending", "partial"}:
                    continue
                try:
                    ts = datetime.fromisoformat(str(row.get("createdAt") or "").replace("Z", "+00:00"))
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    if (cutoff - ts).total_seconds() > 60:
                        continue
                except Exception:
                    continue
                merged.insert(0, row)
            self._state["orders"] = merged
            self._state["fills"] = fills
            return deepcopy(self._state)

    def update_settings(self, patch: dict) -> dict:
        with self._lock:
            self._state["settings"].update(patch)
            return deepcopy(self._state)

    def search_symbols(self, query: str) -> list[dict]:
        q = query.strip().upper()
        if not q:
            return []
        return [s for s in SYMBOLS if q in s["stkCd"] or q in s["stkNm"].upper()][:8]

    def apply_live_account(self, deposit: dict, positions: dict | None = None) -> dict:
        with self._lock:
            if "cashUsd" in deposit:
                self._state["cashUsd"] = deposit["cashUsd"]
            if "cashKrw" in deposit:
                self._state["cashKrw"] = deposit["cashKrw"]
            if positions:
                self._state["positions"] = positions.get("positions", self._state["positions"])
                if "dailyPnl" in positions:
                    self._state["dailyPnl"] = positions["dailyPnl"]
                if positions.get("fxUsdKrw"):
                    self._state["fxUsdKrw"] = positions["fxUsdKrw"]
            self._sync_watchlists_unlocked(None)
            self._state["kiwoom"] = "connected"
            self._state["kiwoomError"] = ""
            return deepcopy(self._state)

    def _sync_watchlists_unlocked(self, hts: list[dict] | None) -> None:
        app_wls = [w for w in self._state["watchlists"] if w.get("source") == "app"]
        app_ids = {w["id"] for w in app_wls}
        app_items = [i for i in self._state["items"] if i.get("watchlistId") in app_ids]
        holding_items = []
        for pos in self._state.get("positions") or []:
            last = float(pos.get("last") or 0)
            holding_items.append(
                {
                    "id": f"h-{pos.get('stkCd')}-{pos.get('stexTp')}",
                    "watchlistId": "wl-holdings",
                    "stkCd": pos.get("stkCd"),
                    "stexTp": pos.get("stexTp") or "ND",
                    "stkNm": pos.get("stkNm") or pos.get("stkCd"),
                    "last": last,
                    "prevClose": last,
                    "open": last,
                    "changePct": 0,
                    "enabled": True,
                }
            )
        hts_wls: list[dict] = []
        hts_items: list[dict] = []
        if hts:
            for group in hts:
                gcod = str(group.get("gcod") or "").strip() or "1"
                wid = f"wl-hts-{gcod}"
                hts_wls.append({"id": wid, "name": group.get("name") or "HTS 관심종목", "source": "kiwoom_import"})
                for row in group.get("items") or []:
                    code = str(row.get("stkCd") or "").upper()
                    if not code:
                        continue
                    hts_items.append(
                        {
                            "id": f"k-{gcod}-{code}",
                            "watchlistId": wid,
                            "stkCd": code,
                            "stexTp": row.get("stexTp") or "ND",
                            "stkNm": row.get("stkNm") or code,
                            "last": 0,
                            "prevClose": 0,
                            "open": 0,
                            "changePct": 0,
                            "enabled": True,
                        }
                    )
        else:
            hts_wls = [w for w in self._state["watchlists"] if w.get("source") == "kiwoom_import"]
            if not hts_wls:
                hts_wls = [{"id": "wl-kiwoom", "name": "HTS 관심종목", "source": "kiwoom_import"}]
            hts_ids = {w["id"] for w in hts_wls}
            hts_items = [i for i in self._state["items"] if i.get("watchlistId") in hts_ids]
        self._state["watchlists"] = [
            {"id": "wl-holdings", "name": "보유종목", "source": "holdings"},
            *hts_wls,
            *app_wls,
        ]
        self._state["items"] = holding_items + hts_items + app_items
        ids = {w["id"] for w in self._state["watchlists"]}
        if self._state.get("selectedWatchlistId") not in ids:
            self._state["selectedWatchlistId"] = "wl-holdings"

    def apply_hts_watchlists(self, groups: list[dict]) -> dict:
        with self._lock:
            self._sync_watchlists_unlocked(groups)
            return deepcopy(self._state)

    def set_fx(self, fx: float) -> None:
        if not fx:
            return
        with self._lock:
            self._state["fxUsdKrw"] = fx

    def set_kiwoom_status(self, connected: bool, error: str = "") -> None:
        with self._lock:
            self._state["kiwoom"] = "connected" if connected else "disconnected"
            self._state["kiwoomError"] = error

    def get_quote(self, stex_tp: str, stk_cd: str) -> dict:
        code = stk_cd.strip().upper()
        exch = (stex_tp or "ND").upper()
        base = next((s for s in SYMBOLS if s["stkCd"] == code and s["stexTp"] == exch), None)
        if base is None:
            base = next((s for s in SYMBOLS if s["stkCd"] == code), None)
        if base is None:
            with self._lock:
                item = next((i for i in self._state["items"] if i["stkCd"] == code), None)
            if item:
                base = item
            else:
                last = 50 + (sum(ord(c) for c in code) % 400)
                base = {
                    "stkCd": code,
                    "stexTp": exch,
                    "stkNm": code,
                    "last": float(last),
                    "prevClose": float(last) * 0.99,
                    "open": float(last) * 1.005,
                    "changePct": 1.01,
                }

        last = float(base["last"])
        prev = float(base.get("prevClose") or last)
        open_px = float(base.get("open") or last)
        change = round(last - prev, 2)
        change_pct = round((change / prev) * 100, 2) if prev else 0
        return {
            "stkCd": base["stkCd"],
            "stkNm": base.get("stkNm") or base["stkCd"],
            "stexTp": base.get("stexTp") or exch,
            "last": last,
            "open": open_px,
            "high": last,
            "low": last,
            "prevClose": prev,
            "change": change,
            "changePct": change_pct,
            "volume": 0,
            "bid": last,
            "ask": last,
            "bidQty": 0,
            "askQty": 0,
            "asks": [],
            "bids": [],
            "source": "mock",
            "bookLive": False,
            "bookNote": "목업 현재가입니다. 실시간 호가는 없습니다.",
        }


store = AppStore()
