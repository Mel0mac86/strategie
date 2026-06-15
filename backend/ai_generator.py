"""Generazione strategie: modalità AI (Emergent LLM) con fallback locale.

- mode="ai": chiama Claude Sonnet 4.5 via Emergent LLM Key. Se la chiave manca
  o la chiamata fallisce, ricade automaticamente sul template locale.
- mode="local": usa direttamente il template locale (istantaneo).
"""
from __future__ import annotations

import json
import os

import httpx

from ftmo import compute_ftmo_limits, normalize_phase

ASSET_LABELS = {
    "forex": "Forex (major)",
    "indices": "Indici (US30, NAS100, GER40)",
    "metals": "Metalli (XAUUSD, XAGUSD)",
    "mixed": "Misto (Forex + Indici + Metalli)",
}

STYLE_LABELS = {
    "scalping": "Scalping",
    "intraday": "Intraday",
    "swing": "Swing",
}

STRATEGY_LABELS = {
    "trend_pullback": "Trend + Pullback",
    "session_breakout": "Breakout di Sessione",
    "xau_scalper": "XAU Scalper",
    "mean_reversion": "Mean Reversion",
}

RISK_PCT_BY_TOLERANCE = {"low": 0.5, "medium": 1.0, "high": 1.5}


def _risk_pct(tolerance: str) -> float:
    return RISK_PCT_BY_TOLERANCE.get((tolerance or "medium").lower(), 1.0)


# --------------------------------------------------------------------------
# Template locale
# --------------------------------------------------------------------------

def _entry_rules(stype: str, style: str) -> list[str]:
    common_tf = {"scalping": "M5", "intraday": "M15/H1", "swing": "H4/D1"}.get(style, "M15")
    base = {
        "trend_pullback": [
            f"Identifica il trend su {('H4' if style!='scalping' else 'H1')} con EMA50 vs EMA200 (rialzista se EMA50 > EMA200).",
            f"Passa sul timeframe operativo {common_tf} e attendi un pullback verso EMA20.",
            "Conferma il rientro con candela di reversal (engulfing/pin bar) nella direzione del trend.",
            "Ingresso al break del massimo/minimo della candela di conferma.",
            "Stop loss oltre lo swing recente; take profit a 2R (minimo 1:2 RR).",
        ],
        "session_breakout": [
            "Definisci il range della sessione asiatica (00:00–07:00 server).",
            "Attendi l'apertura di Londra/NY per il breakout del range.",
            "Entra al close di una candela oltre il bordo del range con volume/momentum.",
            "Filtro: evita breakout contro il trend H4 dominante.",
            "Stop loss sul lato opposto del range; take profit pari all'ampiezza del range (1:1–1:2).",
        ],
        "xau_scalper": [
            "Opera XAUUSD solo nelle finestre Londra (08:00–11:00) e NY (13:30–16:00).",
            "Trend bias con EMA21 su M15; opera solo nella direzione del bias.",
            f"Trigger su {common_tf}: rottura di micro-struttura + ritest.",
            "Spread filter: salta gli ingressi se spread > soglia (oro è volatile).",
            "SL stretto basato su ATR(14); TP a 1.5–2R, parziale a 1R.",
        ],
        "mean_reversion": [
            "Mercato in range: ADX < 20 e prezzo tra le bande di Bollinger(20,2).",
            "Ingresso long al tocco della banda inferiore con RSI(14) < 30.",
            "Ingresso short al tocco della banda superiore con RSI(14) > 70.",
            "Conferma con divergenza o candela di rifiuto.",
            "Take profit sulla media mobile centrale; stop oltre la banda.",
        ],
    }
    return base.get(stype, base["trend_pullback"])


def _daily_routine(style: str) -> list[dict]:
    return [
        {"time": "07:30", "task": "Controllo calendario economico (notizie ad alto impatto)."},
        {"time": "08:00", "task": "Analisi multi-timeframe e definizione bias direzionale."},
        {"time": "08:30", "task": "Segna livelli chiave: supporti/resistenze, range di sessione."},
        {"time": "09:00", "task": "Operatività sulla finestra di Londra rispettando le regole."},
        {"time": "13:30", "task": "Seconda finestra (NY): solo setup A+ se daily loss non a rischio."},
        {"time": "17:00", "task": "Stop operatività, aggiorna il journal, calcola R del giorno."},
        {"time": "21:00", "task": "Review: screenshot, errori, rispetto del piano. Niente revenge trading."},
    ]


def build_local_strategy(req: dict) -> dict:
    account = float(req.get("account_size", 50000))
    phase = normalize_phase(req.get("phase", "phase1"))
    asset = (req.get("asset_class") or "forex").lower()
    tolerance = (req.get("risk_tolerance") or "medium").lower()
    style = (req.get("trading_style") or "intraday").lower()
    stype = (req.get("strategy_type") or "trend_pullback").lower()

    ftmo = compute_ftmo_limits(account, phase)
    risk_pct = _risk_pct(tolerance)
    max_risk_per_trade = round(account * risk_pct / 100, 2)
    # cap posizioni aperte per non avvicinare il daily loss
    max_daily_trades = {"scalping": 5, "intraday": 3, "swing": 2}.get(style, 3)

    asset_label = ASSET_LABELS.get(asset, asset)
    style_label = STYLE_LABELS.get(style, style)
    stype_label = STRATEGY_LABELS.get(stype, stype)

    title = f"{stype_label} · {style_label} · {asset_label.split(' ')[0]}"
    summary = (
        f"Strategia {stype_label.lower()} {style_label.lower()} su {asset_label}, "
        f"calibrata per una challenge FTMO da ${account:,.0f} in fase "
        f"{('1' if phase=='phase1' else '2' if phase=='phase2' else 'Funded')}. "
        f"Rischio {risk_pct}% per trade ({tolerance}), massimo {max_daily_trades} trade/giorno. "
        f"Obiettivo: raggiungere il target del {ftmo['profit_target_pct']*100:.0f}% "
        f"restando entro il -5% giornaliero e -10% complessivo."
    )

    lot_formula = (
        "Lotti = (Capitale × Rischio%) / (SL_pips × Valore_pip_per_lotto)\n"
        f"Es: ({account:,.0f} × {risk_pct/100:.3f}) / (20 × 10) = "
        f"{round(account * (risk_pct/100) / (20*10), 2)} lotti"
    )

    risk_management = {
        "risk_per_trade_pct": risk_pct,
        "max_risk_per_trade_usd": max_risk_per_trade,
        "max_daily_loss_usd": ftmo["max_daily_loss"],
        "max_daily_loss_pct": 5.0,
        "max_overall_loss_usd": ftmo["max_overall_loss"],
        "max_overall_loss_pct": 10.0,
        "max_daily_trades": max_daily_trades,
        "stop_after_pct_day": 3.0,
        "min_rr": 2.0 if stype != "mean_reversion" else 1.5,
        "lot_size_formula": lot_formula,
    }

    do = [
        "Rispetta SEMPRE il rischio fisso per trade: mai aumentare dopo una perdita.",
        f"Smetti di tradare se perdi il {risk_management['stop_after_pct_day']}% in giornata.",
        "Opera solo i setup che rispettano TUTTE le regole di ingresso.",
        "Aggiorna il journal dopo ogni trade con R-multiple e note.",
        "Usa sempre stop loss e take profit predefiniti prima di entrare.",
    ]
    dont = [
        "NIENTE revenge trading dopo uno stop loss.",
        "NON tradare durante notizie ad alto impatto sull'asset operato.",
        "NON spostare lo stop loss in perdita (mai allargarlo).",
        "NON superare il numero massimo di trade giornalieri.",
        "NON rischiare più del limite anche se 'sei sicuro' del trade.",
    ]

    return {
        "title": title,
        "summary": summary,
        "ftmo": ftmo,
        "risk_management": risk_management,
        "entry_rules": _entry_rules(stype, style),
        "exit_rules": [
            "Take profit al target R prestabilito (parziale a 1R, resto a 2R).",
            "Stop loss invariato: se colpito, accetta la perdita e passa oltre.",
            "Chiudi prima della chiusura sessione se intraday (no overnight non pianificati).",
            "Break-even dopo +1R per proteggere il capitale.",
        ],
        "daily_routine": _daily_routine(style),
        "do": do,
        "dont": dont,
        "generated_by": "local",
    }


# --------------------------------------------------------------------------
# Modalità AI (Emergent LLM Key → Claude Sonnet 4.5)
# --------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "Sei un trading coach esperto di challenge FTMO. Generi strategie di trading "
    "concrete, prudenti e conformi alle regole FTMO (max perdita giornaliera 5%, "
    "max perdita totale 10%). Rispondi SEMPRE ed ESCLUSIVAMENTE con un oggetto JSON "
    "valido, in italiano, con questa struttura esatta: "
    '{"title": str, "summary": str, "risk_management": {"risk_per_trade_pct": number, '
    '"max_daily_trades": number, "min_rr": number, "lot_size_formula": str}, '
    '"entry_rules": [str], "exit_rules": [str], '
    '"daily_routine": [{"time": str, "task": str}], "do": [str], "dont": [str]}. '
    "Niente testo fuori dal JSON."
)


def _user_prompt(req: dict) -> str:
    account = req.get("account_size", 50000)
    phase = normalize_phase(req.get("phase", "phase1"))
    return (
        f"Genera una strategia per una challenge FTMO con questi parametri:\n"
        f"- Capitale: ${account:,.0f}\n"
        f"- Fase: {phase}\n"
        f"- Asset: {ASSET_LABELS.get(req.get('asset_class','forex'), req.get('asset_class'))}\n"
        f"- Tolleranza al rischio: {req.get('risk_tolerance','medium')}\n"
        f"- Stile di trading: {STYLE_LABELS.get(req.get('trading_style','intraday'), req.get('trading_style'))}\n"
        f"- Tipo strategia: {STRATEGY_LABELS.get(req.get('strategy_type','trend_pullback'), req.get('strategy_type'))}\n"
        f"Includi regole d'ingresso numerate e specifiche, gestione del rischio con "
        f"formula lot size, routine giornaliera con orari, e liste do/don't."
    )


async def _call_emergent(req: dict) -> dict | None:
    key = os.getenv("EMERGENT_LLM_KEY")
    if not key:
        return None
    base = os.getenv("EMERGENT_BASE_URL", "https://llm.emergent.sh/v1").rstrip("/")
    model = os.getenv("AI_MODEL", "claude-sonnet-4-5")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _user_prompt(req)},
        ],
        "temperature": 0.7,
        "max_tokens": 2000,
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{base}/chat/completions", json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return _parse_json(content)
    except Exception as exc:  # noqa: BLE001
        print(f"[ai] Chiamata Emergent fallita, fallback locale: {exc}")
        return None


def _parse_json(content: str) -> dict | None:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```", 2)[1]
        if content.startswith("json"):
            content = content[4:]
    start, end = content.find("{"), content.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(content[start:end + 1])
    except json.JSONDecodeError:
        return None


async def generate_strategy(req: dict) -> dict:
    """Genera una strategia rispettando la modalità richiesta, con fallback."""
    mode = (req.get("mode") or "ai").lower()
    if mode == "ai":
        ai = await _call_emergent(req)
        if ai:
            # Completa i campi mancanti con i calcoli FTMO deterministici.
            local = build_local_strategy(req)
            merged = {**local, **{k: v for k, v in ai.items() if v}}
            merged["ftmo"] = local["ftmo"]  # numeri FTMO sempre dal backend
            rm = {**local["risk_management"], **(ai.get("risk_management") or {})}
            merged["risk_management"] = rm
            merged["generated_by"] = "ai"
            return merged
    return build_local_strategy(req)
