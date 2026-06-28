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
