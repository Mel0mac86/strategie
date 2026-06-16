/**
 * Motore locale: port TypeScript della logica del backend (FTMO, generatore
 * strategie, generatore EA .mq4). Permette all'app di funzionare interamente
 * sull'iPhone come PWA, senza backend.
 */
import type { Strategy, RiskManagement, FtmoLimits } from "@/api";

// ---------------- FTMO ----------------
const MAX_DAILY = 0.05;
const MAX_OVERALL = 0.1;
const TARGET: Record<string, number> = { phase1: 0.1, phase2: 0.05, funded: 0 };
const PIP_VALUE: Record<string, number> = {
  forex: 10,
  indices: 1,
  metals: 10,
  crypto: 1,
  mixed: 10,
};

export function normalizePhase(p?: string): string {
  const x = (p || "phase1").toLowerCase().replace(/\s/g, "");
  if (["1", "phase1", "fase1", "step1"].includes(x)) return "phase1";
  if (["2", "phase2", "fase2", "step2"].includes(x)) return "phase2";
  if (["funded", "finanziato", "live"].includes(x)) return "funded";
  return "phase1";
}

export function computeFtmoLimits(account: number, phase: string): FtmoLimits {
  const ph = normalizePhase(phase);
  const t = TARGET[ph];
  return {
    account_size: round2(account),
    phase: ph,
    max_daily_loss: round2(account * MAX_DAILY),
    max_overall_loss: round2(account * MAX_OVERALL),
    daily_loss_floor: round2(account - account * MAX_DAILY),
    overall_loss_floor: round2(account - account * MAX_OVERALL),
    profit_target_pct: t,
    profit_target: round2(account * t),
  } as FtmoLimits;
}

export function lotSize(
  account: number,
  riskPct: number,
  slPips: number,
  asset: string
) {
  const sl = slPips <= 0 ? 1 : slPips;
  const riskAmount = account * (riskPct / 100);
  const pv = PIP_VALUE[(asset || "forex").toLowerCase()] ?? 10;
  const raw = riskAmount / (sl * pv);
  return {
    risk_amount: round2(riskAmount),
    pip_value_per_lot: pv,
    lots: round2(raw),
    micro_lots: Math.round(raw * 100),
    units: Math.round(raw * 100000),
  };
}

// ---------------- Etichette ----------------
const ASSET_LABELS: Record<string, string> = {
  forex: "Forex (major)",
  indices: "Indici (US30, NAS100, GER40)",
  metals: "Metalli (XAUUSD, XAGUSD)",
  mixed: "Misto (Forex + Indici + Metalli)",
};
const STYLE_LABELS: Record<string, string> = {
  scalping: "Scalping",
  intraday: "Day Trading",
  swing: "Swing Trading",
};
const STRATEGY_LABELS: Record<string, string> = {
  trend_pullback: "Trend + Pullback",
  session_breakout: "Breakout di Sessione",
  xau_scalper: "XAU Scalper",
  mean_reversion: "Mean Reversion",
};
const RISK_PCT: Record<string, number> = { low: 0.5, medium: 1.0, high: 1.5 };

function entryRules(stype: string, style: string): string[] {
  const tf =
    style === "scalping" ? "M5" : style === "swing" ? "H4/D1" : "M15/H1";
  const map: Record<string, string[]> = {
    trend_pullback: [
      `Identifica il trend su ${style !== "scalping" ? "H4" : "H1"} con EMA50 vs EMA200 (rialzista se EMA50 > EMA200).`,
      `Passa sul timeframe operativo ${tf} e attendi un pullback verso EMA20.`,
      "Conferma il rientro con candela di reversal (engulfing/pin bar) nella direzione del trend.",
      "Ingresso al break del massimo/minimo della candela di conferma.",
      "Stop loss oltre lo swing recente; take profit a 2R (minimo 1:2 RR).",
    ],
    session_breakout: [
      "Definisci il range della sessione asiatica (00:00–07:00 server).",
      "Attendi l'apertura di Londra/NY per il breakout del range.",
      "Entra al close di una candela oltre il bordo del range con volume/momentum.",
      "Filtro: evita breakout contro il trend H4 dominante.",
      "Stop loss sul lato opposto del range; take profit pari all'ampiezza del range (1:1–1:2).",
    ],
    xau_scalper: [
      "Opera XAUUSD solo nelle finestre Londra (08:00–11:00) e NY (13:30–16:00).",
      "Trend bias con EMA21 su M15; opera solo nella direzione del bias.",
      `Trigger su ${tf}: rottura di micro-struttura + ritest.`,
      "Spread filter: salta gli ingressi se spread > soglia (oro è volatile).",
      "SL stretto basato su ATR(14); TP a 1.5–2R, parziale a 1R.",
    ],
    mean_reversion: [
      "Mercato in range: ADX < 20 e prezzo tra le bande di Bollinger(20,2).",
      "Ingresso long al tocco della banda inferiore con RSI(14) < 30.",
      "Ingresso short al tocco della banda superiore con RSI(14) > 70.",
      "Conferma con divergenza o candela di rifiuto.",
      "Take profit sulla media mobile centrale; stop oltre la banda.",
    ],
  };
  return map[stype] || map.trend_pullback;
}

function dailyRoutine(): { time: string; task: string }[] {
  return [
    { time: "07:30", task: "Controllo calendario economico (notizie ad alto impatto)." },
    { time: "08:00", task: "Analisi multi-timeframe e definizione bias direzionale." },
    { time: "08:30", task: "Segna livelli chiave: supporti/resistenze, range di sessione." },
    { time: "09:00", task: "Operatività sulla finestra di Londra rispettando le regole." },
    { time: "13:30", task: "Seconda finestra (NY): solo setup A+ se daily loss non a rischio." },
    { time: "17:00", task: "Stop operatività, aggiorna il journal, calcola R del giorno." },
    { time: "21:00", task: "Review: screenshot, errori, rispetto del piano. Niente revenge trading." },
  ];
}

/** Costruisce una strategia locale (equivalente a build_local_strategy del backend). */
export function buildLocalStrategy(req: Record<string, any>): Strategy {
  const account = Number(req.account_size || 50000);
  const phase = normalizePhase(req.phase || "phase1");
  const asset = (req.asset_class || "forex").toLowerCase();
  const tolerance = (req.risk_tolerance || "medium").toLowerCase();
  const style = (req.trading_style || "intraday").toLowerCase();
  const stype = (req.strategy_type || "trend_pullback").toLowerCase();

  const ftmo = computeFtmoLimits(account, phase);
  const riskPct = RISK_PCT[tolerance] ?? 1.0;
  const maxRiskUsd = round2((account * riskPct) / 100);
  const maxDailyTrades =
    style === "scalping" ? 5 : style === "swing" ? 2 : 3;

  const assetLabel = ASSET_LABELS[asset] || asset;
  const styleLabel = STYLE_LABELS[style] || style;
  const stypeLabel = STRATEGY_LABELS[stype] || stype;

  const phaseTxt = phase === "phase1" ? "1" : phase === "phase2" ? "2" : "Funded";
  const lots = round2((account * (riskPct / 100)) / (20 * 10));
  const lotFormula =
    "Lotti = (Capitale × Rischio%) / (SL_pips × Valore_pip_per_lotto)\n" +
    `Es: (${account.toLocaleString("it-IT")} × ${(riskPct / 100).toFixed(3)}) / (20 × 10) = ${lots} lotti`;

  const risk_management: RiskManagement = {
    risk_per_trade_pct: riskPct,
    max_risk_per_trade_usd: maxRiskUsd,
    max_daily_loss_usd: ftmo.max_daily_loss,
    max_overall_loss_usd: ftmo.max_overall_loss,
    max_daily_trades: maxDailyTrades,
    min_rr: stype !== "mean_reversion" ? 2.0 : 1.5,
    lot_size_formula: lotFormula,
  } as RiskManagement;

  return {
    id: uid(),
    title: `${stypeLabel} · ${styleLabel} · ${assetLabel.split(" ")[0]}`,
    summary:
      `Strategia ${stypeLabel.toLowerCase()} ${styleLabel.toLowerCase()} su ${assetLabel}, ` +
      `calibrata per una challenge FTMO da $${account.toLocaleString("it-IT")} in fase ${phaseTxt}. ` +
      `Rischio ${riskPct}% per trade (${tolerance}), massimo ${maxDailyTrades} trade/giorno. ` +
      `Obiettivo: raggiungere il target del ${Math.round(ftmo.profit_target_pct * 100)}% ` +
      `restando entro il -5% giornaliero e -10% complessivo.`,
    request: req,
    ftmo,
    risk_management,
    entry_rules: entryRules(stype, style),
    exit_rules: [
      "Take profit al target R prestabilito (parziale a 1R, resto a 2R).",
      "Stop loss invariato: se colpito, accetta la perdita e passa oltre.",
      "Chiudi prima della chiusura sessione se intraday (no overnight non pianificati).",
      "Break-even dopo +1R per proteggere il capitale.",
    ],
    daily_routine: dailyRoutine(),
    do: [
      "Rispetta SEMPRE il rischio fisso per trade: mai aumentare dopo una perdita.",
      "Smetti di tradare se perdi il 3% in giornata.",
      "Opera solo i setup che rispettano TUTTE le regole di ingresso.",
      "Aggiorna il journal dopo ogni trade con R-multiple e note.",
      "Usa sempre stop loss e take profit predefiniti prima di entrare.",
    ],
    dont: [
      "NIENTE revenge trading dopo uno stop loss.",
      "NON tradare durante notizie ad alto impatto sull'asset operato.",
      "NON spostare lo stop loss in perdita (mai allargarlo).",
      "NON superare il numero massimo di trade giornalieri.",
      "NON rischiare più del limite anche se 'sei sicuro' del trade.",
    ],
    generated_by: "local",
    score: null,
    created_at: new Date().toISOString(),
  };
}

export function challengeProgress(
  initial: number,
  current: number,
  phase: string,
  dailyStart?: number | null
) {
  const limits = computeFtmoLimits(initial, phase);
  const ds = dailyStart ?? current;
  const pnl = current - initial;
  const pnlPct = initial ? (pnl / initial) * 100 : 0;
  const overallDd = Math.max(0, initial - current);
  const overallDdPct = initial ? (overallDd / initial) * 100 : 0;
  const dailyLoss = Math.max(0, ds - current);
  const dailyLossPct = initial ? (dailyLoss / initial) * 100 : 0;
  const target = limits.profit_target;
  let progress = 0;
  if (target > 0) progress = Math.max(0, Math.min(100, (pnl / target) * 100));
  else if (normalizePhase(phase) === "funded") progress = 100;
  const ddColor = Math.max(overallDdPct, dailyLossPct);
  const risk_color = ddColor < 4 ? "green" : ddColor <= 7 ? "yellow" : "red";
  return {
    ...limits,
    current_balance: round2(current),
    daily_start_balance: round2(ds),
    pnl: round2(pnl),
    pnl_pct: round2(pnlPct),
    overall_drawdown: round2(overallDd),
    overall_drawdown_pct: round2(overallDdPct),
    daily_loss: round2(dailyLoss),
    daily_loss_pct: round2(dailyLossPct),
    remaining_to_daily_limit: round2(limits.max_daily_loss - dailyLoss),
    remaining_to_overall_limit: round2(limits.max_overall_loss - overallDd),
    progress_to_target_pct: Math.round(progress * 10) / 10,
    target_reached: target > 0 && pnl >= target,
    risk_color: risk_color as "green" | "yellow" | "red",
    daily_limit_breached: dailyLoss >= limits.max_daily_loss,
    overall_limit_breached: overallDd >= limits.max_overall_loss,
  };
}

export function tradeStats(trades: any[]) {
  if (!trades.length)
    return {
      total_trades: 0, wins: 0, losses: 0, win_rate: 0, total_pnl: 0,
      avg_r: 0, profit_factor: 0, best_trade: 0, worst_trade: 0,
    };
  const pnls = trades.map((t) => Number(t.pnl || 0));
  const rs = trades.map((t) => Number(t.r_multiple || 0));
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const gp = wins.reduce((a, b) => a + b, 0);
  const gl = Math.abs(losses.reduce((a, b) => a + b, 0));
  const pf = gl > 0 ? gp / gl : gp || 0;
  return {
    total_trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    win_rate: round1((wins.length / trades.length) * 100),
    total_pnl: round2(pnls.reduce((a, b) => a + b, 0)),
    avg_r: rs.length ? round2(rs.reduce((a, b) => a + b, 0) / rs.length) : 0,
    profit_factor: round2(pf),
    best_trade: round2(Math.max(...pnls)),
    worst_trade: round2(Math.min(...pnls)),
  };
}

// ---------------- util ----------------
export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}
