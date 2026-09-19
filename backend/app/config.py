from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def _flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


KIWOOM_ENABLED = _flag("KIWOOM_ENABLED")
KIWOOM_ORDERS_ENABLED = _flag("KIWOOM_ORDERS_ENABLED")
KIWOOM_MODE = (os.getenv("KIWOOM_MODE") or "real").strip().lower()
if KIWOOM_MODE not in {"real", "demo"}:
    KIWOOM_MODE = "real"
