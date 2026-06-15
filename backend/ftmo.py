"""Calcoli FTMO pre-computati lato backend.

Regole challenge FTMO standard:
- Max Daily Loss:   5% del saldo iniziale
- Max Overall Loss: 10% del saldo iniziale
- Profit Target:    10% (Fase 1) / 5% (Fase 2) / nessuno (Funded)
"""
from __future__ import annotations

MAX_DAILY_LOSS_PCT = 0.05
MAX_OVERALL_LOSS_PCT = 0.10

PROFIT_TARGET_PCT = {
    "phase1": 0.10,
    "phase2": 0.05,
    "funded": 0.0,
}

# Valore pip per 1 lotto standard (approssimazione USD account).
PIP_VALUE_PER_LOT = {
    "forex": 10.0,      # major USD-quote (es. EURUSD): 1 pip = $10 / lotto
    "indices": 1.0,     # 1 punto indice ~ $1 / contratto (dipende dal broker)
    "metals": 10.0,     # XAUUSD: 1 pip (0.1) ~ $10 / lotto (varia per broker)
    "crypto": 1.0,
    "mixed": 10.0,
}


def normalize_phase(phase: str | None) -> str:
    if not phase:
        return "phase1"
    p = phase.strip().lower().replace(" ", "")
    if p in ("1", "phase1", "fase1", "step1"):
        return "phase1"
    if p in ("2", "phase2", "fase2", "step2"):
        return "phase2"
    if p in ("funded", "finanziato", "live"):
        return "funded"
    return "phase1"


def compute_ftmo_limits(account_size: float, phase: str) -> dict:
    """Restituisce i limiti monetari pre-computati per la challenge."""
    phase = normalize_phase(phase)
    max_daily = account_size * MAX_DAILY_LOSS_PCT
    max_overall = account_size * MAX_OVERALL_LOSS_PCT
    target_pct = PROFIT_TARGET_PCT[phase]
    return {
        "account_size": round(account_size, 2),
        "phase": phase,
        "max_daily_loss_pct": MAX_DAILY_LOSS_PCT,
        "max_overall_loss_pct": MAX_OVERALL_LOSS_PCT,
        "max_daily_loss": round(max_daily, 2),
        "max_overall_loss": round(max_overall, 2),
        "daily_loss_floor": round(account_size - max_daily, 2),
        "overall_loss_floor": round(account_size - max_overall, 2),
        "profit_target_pct": target_pct,
        "profit_target": round(account_size * target_pct, 2),
        "profit_target_balance": round(account_size * (1 + target_pct), 2),
    }


def pip_value(asset_class: str, lots: float = 1.0) -> float:
    return PIP_VALUE_PER_LOT.get((asset_class or "forex").lower(), 10.0) * lots


def lot_size(account_size: float, risk_pct: float, sl_pips: float,
             asset_class: str = "forex") -> dict:
    """Calcola la dimensione del lotto dato rischio% e stop loss in pip.

    lots = (capitale * risk%) / (SL_pips * pip_value_per_lot)
    """
    if sl_pips <= 0:
        sl_pips = 1.0
    risk_amount = account_size * (risk_pct / 100.0)
    pv = pip_value(asset_class, 1.0)
    raw_lots = risk_amount / (sl_pips * pv)
    return {
        "risk_amount": round(risk_amount, 2),
        "pip_value_per_lot": pv,
        "lots": round(raw_lots, 2),
        "micro_lots": round(raw_lots * 100, 0),
        "units": round(raw_lots * 100000, 0),
    }


def challenge_progress(initial_balance: float, current_balance: float,
                       phase: str, daily_start_balance: float | None = None) -> dict:
    """Stato live di una challenge per la dashboard progressi."""
    limits = compute_ftmo_limits(initial_balance, phase)
    daily_start = daily_start_balance if daily_start_balance is not None else current_balance

    pnl = current_balance - initial_balance
    pnl_pct = (pnl / initial_balance) * 100 if initial_balance else 0.0

    # Drawdown overall rispetto al saldo iniziale (FTMO usa balance/equity).
    overall_dd = max(0.0, (initial_balance - current_balance))
    overall_dd_pct = (overall_dd / initial_balance) * 100 if initial_balance else 0.0

    # Perdita giornaliera rispetto all'inizio giornata.
    daily_loss = max(0.0, daily_start - current_balance)
    daily_loss_pct = (daily_loss / initial_balance) * 100 if initial_balance else 0.0

    target = limits["profit_target"]
    target_pct = limits["profit_target_pct"] * 100
    progress_to_target = 0.0
    if target > 0:
        progress_to_target = max(0.0, min(100.0, (pnl / target) * 100))
    elif phase and normalize_phase(phase) == "funded":
        progress_to_target = 100.0  # nessun target da raggiungere

    # Codice colore drawdown: verde <4%, giallo 4-7%, rosso >7%.
    dd_for_color = max(overall_dd_pct, daily_loss_pct)
    if dd_for_color < 4:
        risk_color = "green"
    elif dd_for_color <= 7:
        risk_color = "yellow"
    else:
        risk_color = "red"

    return {
        **limits,
        "current_balance": round(current_balance, 2),
        "daily_start_balance": round(daily_start, 2),
        "pnl": round(pnl, 2),
        "pnl_pct": round(pnl_pct, 2),
        "overall_drawdown": round(overall_dd, 2),
        "overall_drawdown_pct": round(overall_dd_pct, 2),
        "daily_loss": round(daily_loss, 2),
        "daily_loss_pct": round(daily_loss_pct, 2),
        "remaining_to_daily_limit": round(limits["max_daily_loss"] - daily_loss, 2),
        "remaining_to_overall_limit": round(limits["max_overall_loss"] - overall_dd, 2),
        "progress_to_target_pct": round(progress_to_target, 1),
        "target_reached": target > 0 and pnl >= target,
        "risk_color": risk_color,
        "daily_limit_breached": daily_loss >= limits["max_daily_loss"],
        "overall_limit_breached": overall_dd >= limits["max_overall_loss"],
    }


def trade_stats(trades: list[dict]) -> dict:
    """Statistiche aggregate del trading journal."""
    if not trades:
        return {
            "total_trades": 0, "wins": 0, "losses": 0, "win_rate": 0.0,
            "total_pnl": 0.0, "avg_r": 0.0, "profit_factor": 0.0,
            "best_trade": 0.0, "worst_trade": 0.0,
        }
    pnls = [float(t.get("pnl", 0) or 0) for t in trades]
    rs = [float(t.get("r_multiple", 0) or 0) for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    pf = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit else 0.0)
    return {
        "total_trades": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(len(wins) / len(trades) * 100, 1),
        "total_pnl": round(sum(pnls), 2),
        "avg_r": round(sum(rs) / len(rs), 2) if rs else 0.0,
        "profit_factor": round(pf, 2),
        "best_trade": round(max(pnls), 2),
        "worst_trade": round(min(pnls), 2),
    }
