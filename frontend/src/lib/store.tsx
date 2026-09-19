"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from "react";
import { api } from "./api";
import type {
  AppLog,
  Fill,
  Mode,
  Order,
  Position,
  Settings,
  Watchlist,
  WatchlistItem,
} from "./types";

export type AppState = {
  mode: Mode;
  killSwitch: boolean;
  cashUsd: number;
  cashKrw: number;
  dailyPnl: number;
  kiwoom: "connected" | "disconnected";
  kiwoomError: string;
  fxUsdKrw: number;
  ordersLive: boolean;
  watchlists: Watchlist[];
  items: WatchlistItem[];
  orders: Order[];
  fills: Fill[];
  positions: Position[];
  logs: AppLog[];
  settings: Settings;
  selectedWatchlistId: string;
};

type Action =
  | { type: "hydrate"; state: AppState }
  | { type: "setMode"; mode: Mode }
  | { type: "toggleKill" }
  | { type: "selectWatchlist"; id: string }
  | { type: "addWatchlist"; name: string }
  | { type: "renameWatchlist"; id: string; name: string }
  | { type: "removeWatchlist"; id: string }
  | { type: "addItem"; item: Omit<WatchlistItem, "id"> }
  | { type: "removeItem"; id: string }
  | { type: "toggleItem"; id: string }
  | { type: "importKiwoom" }
  | { type: "placeOrder"; order: Omit<Order, "id" | "ordNo" | "createdAt" | "status"> }
  | { type: "cancelOrder"; id: string }
  | { type: "modifyOrder"; id: string; price: number }
  | { type: "updateSettings"; settings: Partial<Settings> };

const now = () => new Date().toISOString();

const seed: AppState = {
  mode: "real",
  killSwitch: false,
  cashUsd: 0,
  cashKrw: 0,
  dailyPnl: 0,
  kiwoom: "disconnected",
  kiwoomError: "",
  fxUsdKrw: 0,
  ordersLive: false,
  selectedWatchlistId: "wl-holdings",
  watchlists: [
    { id: "wl-holdings", name: "보유종목", source: "holdings" },
    { id: "wl-kiwoom", name: "HTS 관심종목", source: "kiwoom_import" },
  ],
  items: [],
  orders: [],
  fills: [],
  positions: [],
  logs: [],
  settings: {
    dailyLossLimitUsd: 300,
    maxQtyPerSymbol: 20,
    maxNotionalUsd: 5000,
    notifyTelegram: false,
  },
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return {
        ...action.state,
        selectedWatchlistId: action.state.selectedWatchlistId || state.selectedWatchlistId,
        kiwoom: action.state.kiwoom || "disconnected",
        kiwoomError: action.state.kiwoomError || "",
        fxUsdKrw: action.state.fxUsdKrw || 0,
        ordersLive: action.state.ordersLive ?? state.ordersLive,
      };
    case "setMode":
      return {
        ...state,
        mode: action.mode,
        logs: [
          { id: uid("l"), at: now(), level: "warn", source: "Settings", message: `모드 전환: ${action.mode}` },
          ...state.logs,
        ],
      };
    case "toggleKill":
      return {
        ...state,
        killSwitch: !state.killSwitch,
        logs: [
          {
            id: uid("l"),
            at: now(),
            level: "warn",
            source: "KillSwitch",
            message: state.killSwitch ? "킬스위치 해제. 신규 주문 가능" : "킬스위치 활성. 신규 주문 차단",
          },
          ...state.logs,
        ],
      };
    case "selectWatchlist":
      return { ...state, selectedWatchlistId: action.id };
    case "addWatchlist": {
      const id = uid("wl");
      return {
        ...state,
        watchlists: [...state.watchlists, { id, name: action.name, source: "app" }],
        selectedWatchlistId: id,
      };
    }
    case "renameWatchlist":
      return {
        ...state,
        watchlists: state.watchlists.map((w) => (w.id === action.id ? { ...w, name: action.name } : w)),
      };
    case "removeWatchlist": {
      const row = state.watchlists.find((w) => w.id === action.id);
      if (row && (row.source === "holdings" || row.source === "kiwoom_import")) return state;
      const rest = state.watchlists.filter((w) => w.id !== action.id);
      return {
        ...state,
        watchlists: rest,
        items: state.items.filter((i) => i.watchlistId !== action.id),
        selectedWatchlistId: rest[0]?.id ?? "",
      };
    }
    case "addItem":
      if (state.items.some((i) => i.watchlistId === action.item.watchlistId && i.stkCd === action.item.stkCd && i.stexTp === action.item.stexTp)) {
        return state;
      }
      return { ...state, items: [...state.items, { ...action.item, id: uid("i") }] };
    case "removeItem":
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case "toggleItem":
      return {
        ...state,
        items: state.items.map((i) => (i.id === action.id ? { ...i, enabled: !i.enabled } : i)),
      };
    case "importKiwoom":
      return state;
    case "placeOrder": {
      if (state.killSwitch) {
        return {
          ...state,
          logs: [
            { id: uid("l"), at: now(), level: "block", source: "KillSwitch", message: "신규 주문 차단", code: "KILLED" },
            ...state.logs,
          ],
        };
      }
      const ordNo = String(Math.floor(100000000 + Math.random() * 899999)).padStart(9, "0");
      const order: Order = {
        ...action.order,
        id: uid("o"),
        ordNo,
        status: "pending",
        createdAt: now(),
      };
      return {
        ...state,
        orders: [order, ...state.orders],
        logs: [
          {
            id: uid("l"),
            at: now(),
            level: "info",
            source: "ust20000",
            message: `목업 주문 접수 ${order.stkCd} ${order.qty}주 (${order.trdeTp})`,
            code: "0",
          },
          ...state.logs,
        ],
      };
    }
    case "cancelOrder":
      return {
        ...state,
        orders: state.orders.map((o) => (o.id === action.id || o.ordNo === action.id ? { ...o, status: "cancelled" } : o)),
        logs: [
          { id: uid("l"), at: now(), level: "info", source: "ust20003", message: "취소 요청", code: "0" },
          ...state.logs,
        ],
      };
    case "modifyOrder":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.id || o.ordNo === action.id ? { ...o, price: action.price, status: "pending" } : o,
        ),
        logs: [
          { id: uid("l"), at: now(), level: "info", source: "ust20002", message: `정정 요청 ${action.price}`, code: "0" },
          ...state.logs,
        ],
      };
    case "updateSettings":
      return { ...state, settings: { ...state.settings, ...action.settings } };
    default:
      return state;
  }
}

const StoreContext = createContext<{
  state: AppState;
  dispatch: Dispatch<Action>;
} | null>(null);

async function persist(action: Action, current: AppState): Promise<AppState | null> {
  switch (action.type) {
    case "hydrate":
    case "selectWatchlist":
    case "renameWatchlist":
      return null;
    case "setMode":
      return api.setMode(action.mode);
    case "toggleKill":
      return api.toggleKill();
    case "addWatchlist":
      return api.addWatchlist(action.name);
    case "removeWatchlist":
      return api.removeWatchlist(action.id);
    case "addItem":
      return api.addItem(action.item.watchlistId, action.item);
    case "removeItem":
      return api.removeItem(current.selectedWatchlistId, action.id);
    case "toggleItem":
      return api.toggleItem(current.selectedWatchlistId, action.id);
    case "importKiwoom":
      return api.importKiwoom(current.selectedWatchlistId || "wl-kiwoom");
    case "placeOrder":
      return api.placeOrder(action.order);
    case "cancelOrder": {
      const row = current.orders.find((o) => o.id === action.id);
      return api.cancelOrder(row?.ordNo ?? action.id);
    }
    case "modifyOrder": {
      const row = current.orders.find((o) => o.id === action.id);
      return api.modifyOrder(row?.ordNo ?? action.id, action.price);
    }
    case "updateSettings":
      return api.updateSettings(action.settings);
    default:
      return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, seed);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    api
      .state()
      .then((next) => dispatch({ type: "hydrate", state: next }))
      .catch(() => {
        /* 백엔드가 없으면 로컬 목업으로 동작 */
      });
    const timer = window.setInterval(() => {
      api
        .state()
        .then((next) => dispatch({ type: "hydrate", state: { ...next, selectedWatchlistId: stateRef.current.selectedWatchlistId } }))
        .catch(() => {
          /* ignore poll errors */
        });
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const value = useMemo(() => {
    const wrapped: Dispatch<Action> = (action) => {
      dispatch(action);
      void persist(action, stateRef.current)
        .then((next) => {
          if (next) dispatch({ type: "hydrate", state: { ...next, selectedWatchlistId: stateRef.current.selectedWatchlistId } });
        })
        .catch((err: unknown) => {
          if (action.type === "placeOrder" || action.type === "cancelOrder" || action.type === "modifyOrder") {
            const message = err instanceof Error ? err.message : "주문 요청이 실패했습니다.";
            void api.state().then((next) =>
              dispatch({
                type: "hydrate",
                state: {
                  ...next,
                  selectedWatchlistId: stateRef.current.selectedWatchlistId,
                  logs: [
                    {
                      id: `l-${Date.now()}`,
                      at: new Date().toISOString(),
                      level: "error",
                      source: "OrderService",
                      message,
                    },
                    ...(next.logs ?? []),
                  ],
                },
              }),
            );
          }
        });
    };
    return { state, dispatch: wrapped };
  }, [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("StoreProvider missing");
  return ctx;
}
