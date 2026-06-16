"""Modelli Pydantic per il backend FTMO."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
import uuid

from pydantic import BaseModel, Field


def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- Strategy ----------

class StrategyRequest(BaseModel):
    account_size: float = Field(50000, description="Dimensione conto in USD")
    phase: str = Field("phase1", description="phase1 | phase2 | funded")
    asset_class: str = Field("forex", description="forex | indices | metals | mixed")
    risk_tolerance: str = Field("medium", description="low | medium | high")
    trading_style: str = Field("intraday", description="scalping | intraday | swing")
    strategy_type: str = Field("trend_pullback",
                               description="trend_pullback | session_breakout | xau_scalper | mean_reversion")
    mode: str = Field("ai", description="ai | local")


class Strategy(BaseModel):
    id: str = Field(default_factory=_uid)
    title: str
    summary: str
    request: dict
    ftmo: dict
    risk_management: dict
    entry_rules: list[str] = []
    exit_rules: list[str] = []
    daily_routine: list[dict] = []
    do: list[str] = []
    dont: list[str] = []
    generated_by: str = "local"  # "ai" | "local"
    score: Optional[int] = None
    created_at: datetime = Field(default_factory=_now)


# ---------- Trades (journal) ----------

class TradeCreate(BaseModel):
    asset: str
    direction: str = Field("long", description="long | short")
    entry: float
    exit: Optional[float] = None
    size_lots: Optional[float] = None
    pnl: float = 0.0
    r_multiple: float = 0.0
    notes: str = ""
    opened_at: Optional[datetime] = None


class Trade(TradeCreate):
    id: str = Field(default_factory=_uid)
    created_at: datetime = Field(default_factory=_now)


# ---------- Challenge dashboard ----------

class ChallengeUpsert(BaseModel):
    account_size: float = 50000
    phase: str = "phase1"
    current_balance: float = 50000
    daily_start_balance: Optional[float] = None
    broker: str = ""
    label: str = "Challenge attiva"


class Challenge(ChallengeUpsert):
    id: str = Field(default_factory=_uid)
    active: bool = True
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


# ---------- Lot size ----------

class LotSizeRequest(BaseModel):
    account_size: float = 50000
    risk_pct: float = 1.0
    sl_pips: float = 20.0
    asset_class: str = "forex"


# ---------- EA generation ----------

class EARequest(BaseModel):
    strategy_id: Optional[str] = None
    strategy: Optional[dict] = None
    strategy_type: str = "trend_pullback"
    symbol: str = "EURUSD"
    risk_pct: float = 1.0
    magic_number: int = 990201
