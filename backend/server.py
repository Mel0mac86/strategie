"""FastAPI backend per l'app FTMO Strategy.

Endpoint principali (prefisso /api):
  POST   /api/strategy/generate     genera una strategia (AI o locale) e la salva
  GET    /api/strategy              elenco strategie salvate
  GET    /api/strategy/{id}         dettaglio
  DELETE /api/strategy/{id}         elimina
  PATCH  /api/strategy/{id}/score   imposta strategy score
  POST   /api/strategy/ea           converte una strategia in EA .mq4
  POST   /api/lot-size              calcolatore lot size
  GET/POST/PUT/DELETE /api/trades   trading journal
  GET    /api/trades/stats          statistiche journal
  GET/POST /api/challenge           dashboard challenge (single active)
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

load_dotenv()

from db import database  # noqa: E402
from models import (  # noqa: E402
    StrategyRequest, Strategy, TradeCreate, Trade,
    ChallengeUpsert, Challenge, LotSizeRequest, EARequest,
)
from ftmo import compute_ftmo_limits, lot_size, challenge_progress, trade_stats, normalize_phase  # noqa: E402
from ai_generator import generate_strategy, build_local_strategy  # noqa: E402
from ea_generator import generate_ea  # noqa: E402

app = FastAPI(title="FTMO Strategy API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=(os.getenv("CORS_ORIGINS", "*").split(",")),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    await database.connect()


@app.on_event("shutdown")
async def _shutdown():
    await database.close()


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


@app.get("/api/health")
async def health():
    return {"status": "ok", "db": "memory" if database.using_memory else "mongo"}


# ----------------------- Strategy -----------------------

@app.post("/api/strategy/generate")
async def strategy_generate(req: StrategyRequest):
    data = await generate_strategy(req.model_dump())
    strat = Strategy(
        title=data["title"],
        summary=data["summary"],
        request=req.model_dump(),
        ftmo=data["ftmo"],
        risk_management=data["risk_management"],
        entry_rules=data.get("entry_rules", []),
        exit_rules=data.get("exit_rules", []),
        daily_routine=data.get("daily_routine", []),
        do=data.get("do", []),
        dont=data.get("dont", []),
        generated_by=data.get("generated_by", "local"),
    )
    doc = strat.model_dump()
    await database.db["strategies"].insert_one(dict(doc))
    return _clean(doc)


@app.get("/api/strategy")
async def strategy_list():
    docs = await database.db["strategies"].find({}).sort("created_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@app.get("/api/strategy/{sid}")
async def strategy_get(sid: str):
    doc = await database.db["strategies"].find_one({"id": sid})
    if not doc:
        raise HTTPException(404, "Strategia non trovata")
    return _clean(doc)


@app.delete("/api/strategy/{sid}")
async def strategy_delete(sid: str):
    res = await database.db["strategies"].delete_one({"id": sid})
    if getattr(res, "deleted_count", 0) == 0:
        raise HTTPException(404, "Strategia non trovata")
    return {"deleted": True}


@app.patch("/api/strategy/{sid}/score")
async def strategy_score(sid: str, payload: dict):
    score = int(payload.get("score", 0))
    res = await database.db["strategies"].update_one({"id": sid}, {"$set": {"score": score}})
    if getattr(res, "matched_count", 0) == 0:
        raise HTTPException(404, "Strategia non trovata")
    return {"id": sid, "score": score}


@app.post("/api/strategy/ea", response_class=PlainTextResponse)
async def strategy_to_ea(req: EARequest):
    strategy = req.strategy
    if not strategy and req.strategy_id:
        strategy = await database.db["strategies"].find_one({"id": req.strategy_id})
        if strategy:
            strategy = _clean(strategy)
    if not strategy:
        # genera al volo un template locale base per consentire comunque l'EA
        strategy = build_local_strategy({"strategy_type": req.strategy_type})
    stype = req.strategy_type or (strategy.get("request", {}) or {}).get("strategy_type", "trend_pullback")
    code = generate_ea(
        strategy, strategy_type=stype, symbol=req.symbol,
        risk_pct=req.risk_pct, magic_number=req.magic_number,
    )
    return PlainTextResponse(code, headers={
        "Content-Disposition": f'attachment; filename="FTMO_{stype}.mq4"'
    })


# ----------------------- Lot size -----------------------

@app.post("/api/lot-size")
async def lot_size_calc(req: LotSizeRequest):
    return lot_size(req.account_size, req.risk_pct, req.sl_pips, req.asset_class)


# ----------------------- Trades (journal) -----------------------

@app.post("/api/trades")
async def trade_create(req: TradeCreate):
    trade = Trade(**req.model_dump())
    doc = trade.model_dump()
    await database.db["trades"].insert_one(dict(doc))
    return _clean(doc)


@app.get("/api/trades")
async def trades_list():
    docs = await database.db["trades"].find({}).sort("created_at", -1).to_list(500)
    return [_clean(d) for d in docs]


@app.get("/api/trades/stats")
async def trades_stats():
    docs = await database.db["trades"].find({}).to_list(1000)
    return trade_stats([_clean(d) for d in docs])


@app.delete("/api/trades/{tid}")
async def trade_delete(tid: str):
    res = await database.db["trades"].delete_one({"id": tid})
    if getattr(res, "deleted_count", 0) == 0:
        raise HTTPException(404, "Trade non trovato")
    return {"deleted": True}


# ----------------------- Challenge dashboard -----------------------

@app.post("/api/challenge")
async def challenge_upsert(req: ChallengeUpsert):
    # disattiva eventuali challenge attive e crea/aggiorna quella corrente
    await database.db["challenges"].update_many({"active": True}, {"$set": {"active": False}})
    existing = await database.db["challenges"].find_one({"active": False})
    ch = Challenge(**req.model_dump())
    ch.updated_at = datetime.now(timezone.utc)
    doc = ch.model_dump()
    await database.db["challenges"].insert_one(dict(doc))
    prog = challenge_progress(
        req.account_size, req.current_balance, req.phase, req.daily_start_balance,
    )
    return {**_clean(doc), "progress": prog}


@app.get("/api/challenge")
async def challenge_get():
    doc = await database.db["challenges"].find_one({"active": True})
    if not doc:
        return {"active": None}
    doc = _clean(doc)
    prog = challenge_progress(
        doc["account_size"], doc["current_balance"], doc["phase"],
        doc.get("daily_start_balance"),
    )
    return {**doc, "progress": prog}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=False)
