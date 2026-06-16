/** Motore di backtest: applica la logica di segnale dell'EA su barre OHLC. */
import { Bar } from "./data";
import { adx, atr, bollinger, ema, highestPrev, lowestPrev, rsi } from "./indicators";

export type BacktestParams = {
  strategyType: string; // trend_pullback | session_breakout | xau_scalper | mean_reversion
  accountSize: number;
  phase: string; // phase1 | phase2 | funded
  riskPct: number;
  rr: number; // risk:reward (TP = SL * RR)
  slAtrMult: number; // SL = ATR * mult
  maxDailyTrades: number;
  costPctOfRisk?: number; // costi (spread+commissioni) per trade, in % del rischio
};

export type BTTrade = {
  index: number;
  dir: "long" | "short";
  entry: number;
  exit: number;
  rMultiple: number;
  pnl: number;
};

export type BacktestResult = {
  bars: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  netPnlPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  finalBalance: number;
  equityCurve: number[]; // campionata
  ftmoPassed: boolean;
  targetReached: boolean;
  dailyBreached: boolean;
  overallBreached: boolean;
  avgR: number;
  tradesList: BTTrade[];
  note?: string;
};

const TARGET: Record<string, number> = { phase1: 0.1, phase2: 0.05, funded: 0 };

export function runBacktest(bars: Bar[], p: BacktestParams): BacktestResult {
  const n = bars.length;
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);

  const ema20 = ema(close, 20);
  const ema21 = ema(close, 21);
  const ema50 = ema(close, 50);
  const ema200 = ema(close, 200);
  const r = rsi(close, 14);
  const a = atr(high, low, close, 14);
  const bb = bollinger(close, 20, 2);
  const ax = adx(high, low, close, 14);

  const warmup = 205;
  const initial = p.accountSize;
  const maxDaily = initial * 0.05;
  const maxOverall = initial * 0.1;
  const targetPct = TARGET[p.phase] ?? 0.1;
  const target = initial * targetPct;

  let balance = initial;
  let peak = initial;
  let maxDD = 0;
  let dailyStart = initial;
  let curDay = dayOf(bars[0]?.time);
  let tradesToday = 0;
  let dailyBreached = false;
  let overallBreached = false;
  let targetReached = false;

  const trades: BTTrade[] = [];
  const equity: number[] = [];

  // segnale su barra chiusa i → ingresso a open[i+1]
  function signalAt(i: number): "long" | "short" | null {
    switch (p.strategyType) {
      case "trend_pullback": {
        const up = ema50[i] > ema200[i];
        const dn = ema50[i] < ema200[i];
        if (up && low[i] <= ema20[i] && close[i] > ema20[i]) return "long";
        if (dn && high[i] >= ema20[i] && close[i] < ema20[i]) return "short";
        return null;
      }
      case "session_breakout": {
        const hh = highestPrev(high, 20, i);
        const ll = lowestPrev(low, 20, i);
        if (close[i] > hh && close[i] > ema200[i]) return "long";
        if (close[i] < ll && close[i] < ema200[i]) return "short";
        return null;
      }
      case "xau_scalper": {
        const biasUp = close[i] > ema21[i];
        const biasDn = close[i] < ema21[i];
        if (biasUp && close[i] > high[i - 1] && r[i] > 50 && r[i] < 75) return "long";
        if (biasDn && close[i] < low[i - 1] && r[i] < 50 && r[i] > 25) return "short";
        return null;
      }
      case "mean_reversion": {
        if (!(ax[i] < 20)) return null;
        if (low[i] <= bb.lower[i] && close[i] > bb.lower[i] && r[i] < 30) return "long";
        if (high[i] >= bb.upper[i] && close[i] < bb.upper[i] && r[i] > 70) return "short";
        return null;
      }
      default:
        return null;
    }
  }

  let i = warmup;
  while (i < n - 1) {
    // condizioni terminali della challenge: target raggiunto (pass) o limite violato (fail)
    if (overallBreached || dailyBreached || targetReached) break;

    // reset giornaliero
    const d = dayOf(bars[i].time);
    if (d !== curDay) {
      curDay = d;
      dailyStart = balance;
      tradesToday = 0;
    }

    equity.push(balance);

    if (tradesToday >= p.maxDailyTrades) {
      i++;
      continue;
    }
    // perdita giornaliera oltre il -5% FTMO = challenge fallita
    if (dailyStart - balance >= maxDaily) {
      dailyBreached = true;
      break;
    }

    const sig = signalAt(i);
    const atrV = a[i];
    if (!sig || !isFinite(atrV) || atrV <= 0) {
      i++;
      continue;
    }

    const entry = bars[i + 1].open;
    const slDist = atrV * p.slAtrMult;
    if (slDist <= 0) {
      i++;
      continue;
    }
    const riskAmount = balance * (p.riskPct / 100);
    const sl = sig === "long" ? entry - slDist : entry + slDist;
    const tp = sig === "long" ? entry + slDist * p.rr : entry - slDist * p.rr;

    // simula avanti fino a SL o TP (SL prioritario se entrambi nella stessa barra)
    let exitPrice = bars[n - 1].close;
    let rMult = 0;
    const maxHold = 300;
    let j = i + 1;
    for (; j < n && j <= i + 1 + maxHold; j++) {
      const hj = bars[j].high;
      const lj = bars[j].low;
      if (sig === "long") {
        if (lj <= sl) { exitPrice = sl; rMult = -1; break; }
        if (hj >= tp) { exitPrice = tp; rMult = p.rr; break; }
      } else {
        if (hj >= sl) { exitPrice = sl; rMult = -1; break; }
        if (lj <= tp) { exitPrice = tp; rMult = p.rr; break; }
      }
    }
    if (rMult === 0) {
      // uscita per timeout: R parziale dal prezzo finale
      const lastClose = bars[Math.min(j, n - 1)].close;
      exitPrice = lastClose;
      rMult = ((sig === "long" ? lastClose - entry : entry - lastClose) / slDist);
    }

    // costi di transazione (spread+commissioni) come frazione del rischio per trade
    const cost = riskAmount * ((p.costPctOfRisk ?? 0) / 100);
    const pnl = riskAmount * rMult - cost;
    balance += pnl;
    tradesToday++;
    trades.push({ index: i + 1, dir: sig, entry, exit: exitPrice, rMultiple: rMult, pnl });

    // aggiorna picco/drawdown e FTMO
    peak = Math.max(peak, balance);
    maxDD = Math.max(maxDD, (peak - balance) / peak);
    if (initial - balance >= maxOverall) overallBreached = true;
    if (dailyStart - balance >= maxDaily) dailyBreached = true;
    if (target > 0 && balance - initial >= target) targetReached = true;

    if (overallBreached || dailyBreached || targetReached) break; // challenge conclusa
    i = j + 1; // riparti dopo la chiusura del trade (una posizione per volta)
  }
  equity.push(balance);

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? grossWin : 0;
  const avgR = trades.length ? trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length : 0;

  const ftmoPassed =
    (targetPct === 0 ? balance >= initial : targetReached) && !overallBreached && !dailyBreached;

  return {
    bars: n,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round1((wins.length / trades.length) * 100) : 0,
    netPnl: round2(balance - initial),
    netPnlPct: round2(((balance - initial) / initial) * 100),
    profitFactor: round2(pf),
    maxDrawdownPct: round2(maxDD * 100),
    finalBalance: round2(balance),
    equityCurve: sampleCurve(equity, 60),
    ftmoPassed,
    targetReached,
    dailyBreached,
    overallBreached,
    avgR: round2(avgR),
    tradesList: trades.slice(-50),
    note: n < warmup + 50 ? "Pochi dati: servono almeno ~250 barre per risultati affidabili." : undefined,
  };
}

function dayOf(t?: number): string {
  if (t == null) return "0";
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}
function sampleCurve(arr: number[], maxPoints: number): number[] {
  if (arr.length <= maxPoints) return arr.map(round2);
  const step = arr.length / maxPoints;
  const out: number[] = [];
  for (let k = 0; k < maxPoints; k++) out.push(round2(arr[Math.floor(k * step)]));
  out.push(round2(arr[arr.length - 1]));
  return out;
}
function round1(n: number) { return Math.round(n * 10) / 10; }
function round2(n: number) { return Math.round(n * 100) / 100; }
