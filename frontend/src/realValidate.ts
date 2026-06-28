/**
 * Valida una strategia proposta eseguendo un backtest su DATI REALI.
 *
 * - Crypto: Binance (keyless) → validazione reale sempre disponibile.
 * - Forex/Metalli/Indici: Twelve Data (richiede la chiave gratuita salvata nel
 *   Backtest). Senza chiave ritorna null e si tiene la stima su dati simulati.
 *
 * Scarica lo storico dello strumento rappresentativo, ottimizza i parametri
 * (RR/SL) della strategia e riporta le metriche OUT-OF-SAMPLE reali.
 */
import type { Strategy } from "@/api";
import { downloadBars, Instrument } from "@/backtest/dataSources";
import { generateBars, Bar } from "@/backtest/data";
import { optimize } from "@/backtest/optimizer";
import { storage } from "@/utils/storage";

const ALL_STRATEGIES = ["trend_pullback", "session_breakout", "xau_scalper", "mean_reversion"];

const TD_KEY = "store:twelvedata_key";

function instrumentFor(asset: string): Instrument {
  switch ((asset || "forex").toLowerCase()) {
    case "crypto":
      return { label: "BTC/USDT", symbol: "BTCUSDT", provider: "binance" };
    case "metals":
      return { label: "XAU/USD", symbol: "XAU/USD", provider: "twelvedata" };
    case "indices":
      return { label: "S&P 500", symbol: "SPX", provider: "twelvedata" };
    default: // forex, mixed
      return { label: "EUR/USD", symbol: "EUR/USD", provider: "twelvedata" };
  }
}

function riskPct(tol: string): number {
  return { low: 0.5, medium: 1, high: 1.5 }[(tol || "medium").toLowerCase()] ?? 1;
}

/** Scarica i dati: reali se possibile, altrimenti simulati. */
async function getData(req: Record<string, any>): Promise<{ bars: Bar[]; label: string; real: boolean }> {
  const inst = instrumentFor(req.asset_class);
  const tf = req.timeframe || "H1";
  const key = (await storage.get<string>(TD_KEY)) || "";
  if (!(inst.provider === "twelvedata" && !key)) {
    try {
      const bars = await downloadBars(inst, tf, key, 1500);
      if (bars.length >= 300) return { bars, label: `reale · ${inst.label}`, real: true };
    } catch {
      /* fallback simulato */
    }
  }
  return { bars: generateBars((req.asset_class || "forex").toLowerCase(), tf, 2000), label: "simulato", real: false };
}

export type RealValidation = { expected: NonNullable<Strategy["expected"]>; minRr: number };

/**
 * Trova la strategia PIÙ PROFITTEVOLE (miglior win rate e profit factor) tra
 * tutti i tipi, validata out-of-sample sui dati (reali se disponibili).
 */
export async function findBestStrategy(
  req: Record<string, any>
): Promise<{ config: { strategyType: string; rr: number; slAtrMult: number }; expected: NonNullable<Strategy["expected"]> } | null> {
  try {
    const { bars, label } = await getData(req);
    if (bars.length < 300) return null;
    const out = optimize(
      bars,
      {
        accountSize: Number(req.account_size || 50000),
        phase: req.phase || "phase1",
        riskPct: riskPct(req.risk_tolerance),
        maxDailyTrades: 5,
        costPctOfRisk: 5,
      },
      { strategies: ALL_STRATEGIES }
    );
    const candidates = out.ranked.filter((i) => i.test.trades >= 8);
    if (!candidates.length) return null;
    // priorità ai profittevoli e solidi; punteggio = profit factor + win rate + rendimento
    const profitable = candidates.filter((i) => i.test.netPnlPct > 0 && i.test.profitFactor >= 1);
    const pool = profitable.length ? profitable : candidates;
    const score = (t: any) =>
      Math.min(t.profitFactor, 5) + t.winRate / 100 + t.netPnlPct / 100 - t.maxDrawdownPct / 200;
    pool.sort((a, b) => score(b.test) - score(a.test) || (b.robust ? 1 : 0) - (a.robust ? 1 : 0));
    const best = pool[0];
    const te = best.test;
    return {
      config: best.config,
      expected: {
        source: label,
        rr: best.config.rr,
        slAtrMult: best.config.slAtrMult,
        winRate: te.winRate,
        profitFactor: te.profitFactor,
        netPnlPct: te.netPnlPct,
        maxDrawdownPct: te.maxDrawdownPct,
        trades: te.trades,
        robust: best.robust,
      },
    };
  } catch {
    return null;
  }
}

export async function realValidate(req: Record<string, any>): Promise<RealValidation | null> {
  try {
    const inst = instrumentFor(req.asset_class);
    const tf = req.timeframe || "H1";
    const key = (await storage.get<string>(TD_KEY)) || "";
    if (inst.provider === "twelvedata" && !key) return null; // dati reali non disponibili

    const bars = await downloadBars(inst, tf, key, 1500);
    if (bars.length < 300) return null;

    const out = optimize(
      bars,
      {
        accountSize: Number(req.account_size || 50000),
        phase: req.phase || "phase1",
        riskPct: riskPct(req.risk_tolerance),
        maxDailyTrades: 5,
        costPctOfRisk: 5,
      },
      { strategies: [req.strategy_type || "trend_pullback"] }
    );
    if (!out.best) return null;
    const te = out.best.test;
    return {
      minRr: out.best.config.rr,
      expected: {
        source: `reale · ${inst.label}`,
        rr: out.best.config.rr,
        slAtrMult: out.best.config.slAtrMult,
        winRate: te.winRate,
        profitFactor: te.profitFactor,
        netPnlPct: te.netPnlPct,
        maxDrawdownPct: te.maxDrawdownPct,
        trades: te.trades,
        robust: out.best.robust,
      },
    };
  } catch {
    return null;
  }
}
