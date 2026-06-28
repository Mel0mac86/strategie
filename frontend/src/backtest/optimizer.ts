/**
 * Ottimizzatore di strategia con validazione out-of-sample.
 *
 * Per evitare il "curve-fitting" (parametri belli sul passato ma inutili sul
 * futuro), divide lo storico in:
 *   - TRAIN (in-sample): si cerca qui la configurazione migliore.
 *   - TEST  (out-of-sample): si misura la configurazione su dati MAI visti.
 * I numeri riportati come "attesi" sono quelli OUT-OF-SAMPLE: realistici.
 */
import { Bar } from "./data";
import { runBacktest, BacktestParams, BacktestResult } from "./engine";

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type OptConfig = { strategyType: string; rr: number; slAtrMult: number };

export type OptItem = {
  config: OptConfig;
  train: BacktestResult;
  test: BacktestResult;
  trainScore: number;
  testScore: number;
  robust: boolean; // buono sia in train sia in test
};

export type OptOutcome = {
  ranked: OptItem[]; // ordinati per qualità (robustezza + out-of-sample)
  best: OptItem | null;
  splitOk: boolean; // dati sufficienti per train/test separati
  note?: string;
};

/** Obiettivo robusto: premia l'expectancy (R medio) e il profit factor,
 *  penalizza il drawdown; scarta i campioni con troppi pochi trade. */
function objective(r: BacktestResult): number {
  if (r.trades < 8) return -Infinity;
  const expectancy = r.avgR; // R medio per trade (indipendente dal compounding)
  const pf = isFinite(r.profitFactor) ? Math.min(r.profitFactor, 5) : 0;
  const ddPenalty = (r.maxDrawdownPct / 100) * 0.5;
  return expectancy + (pf - 1) * 0.4 - ddPenalty;
}

const DEFAULT_RRS = [1.5, 2, 2.5, 3];
const DEFAULT_SLS = [1, 1.5, 2, 2.5];

/** Trova la migliore configurazione su un set di barre (solo in-sample). */
function bestConfigOn(
  bars: Bar[],
  base: Omit<BacktestParams, "strategyType" | "rr" | "slAtrMult">,
  opts: { strategies: string[]; rrs?: number[]; sls?: number[] }
): OptConfig | null {
  const rrs = opts.rrs ?? DEFAULT_RRS;
  const sls = opts.sls ?? DEFAULT_SLS;
  let best: OptConfig | null = null;
  let bestScore = -Infinity;
  for (const st of opts.strategies)
    for (const rr of rrs)
      for (const sl of sls) {
        const r = runBacktest(bars, { ...base, strategyType: st, rr, slAtrMult: sl });
        const sc = objective(r);
        if (sc > bestScore) {
          bestScore = sc;
          best = { strategyType: st, rr, slAtrMult: sl };
        }
      }
  return isFinite(bestScore) ? best : null;
}

export function optimize(
  bars: Bar[],
  base: Omit<BacktestParams, "strategyType" | "rr" | "slAtrMult">,
  opts: { strategies: string[]; rrs?: number[]; sls?: number[] }
): OptOutcome {
  const rrs = opts.rrs ?? DEFAULT_RRS;
  const sls = opts.sls ?? DEFAULT_SLS;

  // servono abbastanza barre per warmup (~205) in entrambe le metà
  const MIN_FOR_SPLIT = 700;
  const splitOk = bars.length >= MIN_FOR_SPLIT;
  const split = Math.floor(bars.length * 0.6);
  const trainBars = splitOk ? bars.slice(0, split) : bars;
  const testBars = splitOk ? bars.slice(split) : bars;

  const items: OptItem[] = [];
  for (const st of opts.strategies) {
    for (const rr of rrs) {
      for (const sl of sls) {
        const params: BacktestParams = { ...base, strategyType: st, rr, slAtrMult: sl };
        const train = runBacktest(trainBars, params);
        const test = splitOk ? runBacktest(testBars, params) : train;
        const trainScore = objective(train);
        const testScore = objective(test);
        const robust =
          isFinite(trainScore) && isFinite(testScore) &&
          test.avgR > 0 && test.profitFactor >= 1 && train.avgR > 0;
        items.push({ config: { strategyType: st, rr, slAtrMult: sl }, train, test, trainScore, testScore, robust });
      }
    }
  }

  // Classifica: prima le configurazioni robuste, poi per punteggio out-of-sample,
  // a parità per punteggio in-sample. Scarta i punteggi non finiti.
  const ranked = items
    .filter((i) => isFinite(i.trainScore))
    .sort((a, b) => {
      if (a.robust !== b.robust) return a.robust ? -1 : 1;
      if (b.testScore !== a.testScore) return b.testScore - a.testScore;
      return b.trainScore - a.trainScore;
    });

  const best = ranked[0] || null;
  const note = !splitOk
    ? "Pochi dati per la validazione out-of-sample: ottimizzazione sull'intero storico (più soggetta a overfitting). Usa un CSV più lungo."
    : best && !best.robust
    ? "Nessuna configurazione risulta solida out-of-sample su questi dati: i risultati 'su carta' non reggono. Prova un altro asset/timeframe o dati reali."
    : undefined;

  return { ranked: ranked.slice(0, 8), best, splitOk, note };
}

// ----------------------- Walk-forward multi-finestra -----------------------

export type WFWindow = {
  index: number;
  config: OptConfig | null;
  test: BacktestResult | null;
};

export type WFOutcome = {
  windows: WFWindow[];
  oosTrades: number;
  oosNetPnlPct: number; // media dei rendimenti out-of-sample per finestra
  oosWinRate: number; // win rate aggregato (pesato sui trade)
  oosProfitFactor: number;
  oosMaxDD: number; // massimo drawdown tra le finestre
  passRate: number; // % finestre out-of-sample profittevoli
  robustWindows: number;
  totalWindows: number;
  note?: string;
};

/**
 * Walk-forward: divide lo storico in più finestre consecutive; per ciascuna
 * ottimizza sulla parte iniziale (train) e misura sulla successiva (test).
 * Aggrega le metriche OUT-OF-SAMPLE di tutte le finestre → validazione robusta:
 * misura quanto i parametri "ottimi" reggono nel tempo, non solo su uno split.
 */
export function walkForward(
  bars: Bar[],
  base: Omit<BacktestParams, "strategyType" | "rr" | "slAtrMult">,
  opts: { strategies: string[]; rrs?: number[]; sls?: number[] },
  nWindows = 4
): WFOutcome {
  // ogni segmento deve avere abbastanza barre per il warmup (~205) in train e test
  const MIN_SEG = 350;
  let segments = nWindows;
  while (segments > 2 && bars.length / (segments + 1) < MIN_SEG) segments--;

  const total = segments + 1;
  const size = Math.floor(bars.length / total);
  const windows: WFWindow[] = [];

  for (let w = 0; w < segments; w++) {
    const trainBars = bars.slice(0, size * (w + 1)); // train ancorato (cumulativo)
    const testBars = bars.slice(size * (w + 1), size * (w + 2));
    if (testBars.length < MIN_SEG) break;
    const config = bestConfigOn(trainBars, base, opts);
    const test = config
      ? runBacktest(testBars, { ...base, ...config })
      : null;
    windows.push({ index: w + 1, config, test });
  }

  const valid = windows.filter((w) => w.test && w.config);
  const tests = valid.map((w) => w.test!);
  const oosTrades = tests.reduce((s, t) => s + t.trades, 0);
  const oosNetPnlPct = tests.length
    ? round2(tests.reduce((s, t) => s + t.netPnlPct, 0) / tests.length)
    : 0;
  const totalWins = tests.reduce((s, t) => s + (t.wins || 0), 0);
  const oosWinRate = oosTrades ? round1((totalWins / oosTrades) * 100) : 0;
  const oosMaxDD = tests.length ? round2(Math.max(...tests.map((t) => t.maxDrawdownPct))) : 0;
  const profitable = tests.filter((t) => t.netPnlPct > 0).length;
  const passRate = tests.length ? round1((profitable / tests.length) * 100) : 0;
  // profit factor aggregato dai trade R-multipli non disponibili qui: media dei PF finiti
  const pfs = tests.map((t) => t.profitFactor).filter((x) => isFinite(x) && x > 0);
  const oosProfitFactor = pfs.length ? round2(pfs.reduce((a, b) => a + b, 0) / pfs.length) : 0;
  const robustWindows = tests.filter((t) => t.netPnlPct > 0 && t.profitFactor >= 1).length;

  const note =
    valid.length < 2
      ? "Dati insufficienti per il walk-forward: servono più barre (idealmente 2000+). Usa un CSV reale più lungo."
      : passRate < 50
      ? "I parametri ottimizzati NON reggono nel tempo (meno di metà delle finestre profittevoli): segnale di overfitting."
      : undefined;

  return {
    windows,
    oosTrades,
    oosNetPnlPct,
    oosWinRate,
    oosProfitFactor,
    oosMaxDD,
    passRate,
    robustWindows,
    totalWindows: valid.length,
    note,
  };
}
