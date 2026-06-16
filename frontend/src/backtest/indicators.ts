/** Indicatori tecnici su array OHLC (indice 0 = barra più vecchia). */

export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  let seedSum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      seedSum += values[i];
      continue;
    }
    if (i === period - 1) {
      seedSum += values[i];
      prev = seedSum / period;
      out[i] = prev;
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  const out = new Array(closes.length).fill(NaN);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = Math.max(0, diff);
    const loss = Math.max(0, -diff);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        out[i] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
    }
  }
  return out;
}

export function atr(high: number[], low: number[], close: number[], period = 14): number[] {
  const n = close.length;
  const tr = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i === 0) tr[i] = high[i] - low[i];
    else
      tr[i] = Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      );
  }
  const out = new Array(n).fill(NaN);
  let prev = NaN;
  let seed = 0;
  for (let i = 0; i < n; i++) {
    if (i < period) {
      seed += tr[i];
      if (i === period - 1) {
        prev = seed / period;
        out[i] = prev;
      }
    } else {
      prev = (prev * (period - 1) + tr[i]) / period;
      out[i] = prev;
    }
  }
  return out;
}

export function bollinger(
  closes: number[],
  period = 20,
  mult = 2
): { upper: number[]; mid: number[]; lower: number[] } {
  const mid = sma(closes, period);
  const upper = new Array(closes.length).fill(NaN);
  const lower = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(variance / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { upper, mid, lower };
}

export function adx(high: number[], low: number[], close: number[], period = 14): number[] {
  const n = close.length;
  const out = new Array(n).fill(NaN);
  if (n < period * 2) return out;
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  const tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = high[i] - high[i - 1];
    const down = low[i - 1] - low[i];
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
  }
  let trS = 0,
    pS = 0,
    mS = 0;
  for (let i = 1; i <= period; i++) {
    trS += tr[i];
    pS += plusDM[i];
    mS += minusDM[i];
  }
  const dx: number[] = [];
  for (let i = period + 1; i < n; i++) {
    trS = trS - trS / period + tr[i];
    pS = pS - pS / period + plusDM[i];
    mS = mS - mS / period + minusDM[i];
    const pDI = trS === 0 ? 0 : (100 * pS) / trS;
    const mDI = trS === 0 ? 0 : (100 * mS) / trS;
    const sum = pDI + mDI;
    const d = sum === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / sum;
    dx.push(d);
    if (dx.length >= period) {
      if (dx.length === period) {
        out[i] = dx.reduce((a, b) => a + b, 0) / period;
      } else {
        out[i] = (out[i - 1] * (period - 1) + d) / period;
      }
    }
  }
  return out;
}

export function highestPrev(values: number[], period: number, endExclusive: number): number {
  let m = -Infinity;
  for (let i = Math.max(0, endExclusive - period); i < endExclusive; i++) m = Math.max(m, values[i]);
  return m;
}

export function lowestPrev(values: number[], period: number, endExclusive: number): number {
  let m = Infinity;
  for (let i = Math.max(0, endExclusive - period); i < endExclusive; i++) m = Math.min(m, values[i]);
  return m;
}
