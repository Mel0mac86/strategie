/** Tipi dati barre OHLC, mappa timeframe, generatore dati simulati e parser CSV. */

export type Bar = {
  time: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export const TIMEFRAMES = [
  { label: "M5", value: "M5", minutes: 5 },
  { label: "M15", value: "M15", minutes: 15 },
  { label: "M30", value: "M30", minutes: 30 },
  { label: "H1", value: "H1", minutes: 60 },
  { label: "H4", value: "H4", minutes: 240 },
  { label: "D1", value: "D1", minutes: 1440 },
];

export function tfMinutes(tf: string): number {
  return TIMEFRAMES.find((t) => t.value === tf)?.minutes ?? 60;
}

/** Prezzo base e volatilità tipici per asset (per dati simulati realistici). */
function assetProfile(asset: string): { price: number; vol: number } {
  switch ((asset || "forex").toLowerCase()) {
    case "metals":
      return { price: 2350, vol: 0.0035 };
    case "indices":
      return { price: 18000, vol: 0.0025 };
    case "crypto":
      return { price: 65000, vol: 0.006 };
    default:
      return { price: 1.085, vol: 0.0015 }; // forex
  }
}

/** Genera una serie OHLC simulata (random walk con drift e volatilità per timeframe). */
export function generateBars(asset: string, tf: string, count: number, seed = 12345): Bar[] {
  const { price, vol } = assetProfile(asset);
  const minutes = tfMinutes(tf);
  // PRNG deterministico (mulberry32) per risultati riproducibili.
  let s = seed >>> 0;
  const rnd = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    let u = 0,
      v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const bars: Bar[] = [];
  let p = price;
  const stepVol = vol * Math.sqrt(minutes / 60);
  const drift = 0.00002; // leggero drift per creare trend alternati
  let regime = 1;
  const start = Date.now() - count * minutes * 60_000;
  for (let i = 0; i < count; i++) {
    if (i % 180 === 0) regime = rnd() > 0.5 ? 1 : -1; // cambia trend periodicamente
    const ret = drift * regime + gauss() * stepVol;
    const open = p;
    const close = p * (1 + ret);
    const hi = Math.max(open, close) * (1 + Math.abs(gauss()) * stepVol * 0.5);
    const lo = Math.min(open, close) * (1 - Math.abs(gauss()) * stepVol * 0.5);
    bars.push({
      time: start + i * minutes * 60_000,
      open,
      high: hi,
      low: lo,
      close,
      volume: Math.round(100 + rnd() * 900),
    });
    p = close;
  }
  return bars;
}

/**
 * Parser CSV flessibile (compatibile con export MT4/MT5/TradingView).
 * Accetta:
 *  - colonne con header: date/time, open, high, low, close[, volume]
 *  - formato MT4 senza header: AAAA.MM.GG,HH:MM,open,high,low,close,volume
 *  - una singola colonna di prezzi di chiusura
 */
export function parseCsv(text: string): Bar[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) return [];

  const split = (l: string) => l.split(/[,;\t]/).map((x) => x.trim());
  const first = split(lines[0]);
  const headerLikely = first.some((c) => /open|close|high|low|date|time/i.test(c));

  const bars: Bar[] = [];
  let idxMap: Record<string, number> | null = null;
  let startLine = 0;

  if (headerLikely) {
    idxMap = {};
    first.forEach((c, i) => {
      const k = c.toLowerCase();
      if (/^date/.test(k)) idxMap!.date = i;
      else if (/^time/.test(k)) idxMap!.time = i;
      else if (/open/.test(k)) idxMap!.open = i;
      else if (/high/.test(k)) idxMap!.high = i;
      else if (/low/.test(k)) idxMap!.low = i;
      else if (/close|price|adj/.test(k)) idxMap!.close = i;
      else if (/vol/.test(k)) idxMap!.volume = i;
    });
    startLine = 1;
  }

  const num = (x: string) => parseFloat((x || "").replace(/[^0-9.\-eE]/g, ""));
  const parseTime = (datePart?: string, timePart?: string): number => {
    if (!datePart) return NaN;
    const d = datePart.replace(/\./g, "-").replace(/\//g, "-");
    const iso = timePart ? `${d}T${timePart}` : d;
    const t = Date.parse(iso);
    return isNaN(t) ? NaN : t;
  };

  for (let i = startLine; i < lines.length; i++) {
    const c = split(lines[i]);
    if (idxMap) {
      const close = num(c[idxMap.close ?? -1]);
      if (isNaN(close)) continue;
      const open = idxMap.open != null ? num(c[idxMap.open]) : close;
      const high = idxMap.high != null ? num(c[idxMap.high]) : Math.max(open, close);
      const low = idxMap.low != null ? num(c[idxMap.low]) : Math.min(open, close);
      const time = parseTime(
        idxMap.date != null ? c[idxMap.date] : undefined,
        idxMap.time != null ? c[idxMap.time] : undefined
      );
      bars.push({ time: isNaN(time) ? i : time, open, high, low, close,
        volume: idxMap.volume != null ? num(c[idxMap.volume]) : undefined });
    } else if (c.length >= 5 && /\d{2,4}[.\-/]\d{1,2}/.test(c[0])) {
      // MT4 senza header: data,ora,o,h,l,c[,v]
      const hasTime = /\d{1,2}:\d{2}/.test(c[1]);
      const off = hasTime ? 2 : 1;
      const o = num(c[off]), h = num(c[off + 1]), l = num(c[off + 2]), cl = num(c[off + 3]);
      if (isNaN(cl)) continue;
      const time = parseTime(c[0], hasTime ? c[1] : undefined);
      bars.push({ time: isNaN(time) ? i : time, open: o, high: h, low: l, close: cl,
        volume: num(c[off + 4]) || undefined });
    } else {
      // singola colonna di prezzi
      const cl = num(c[c.length - 1]);
      if (isNaN(cl)) continue;
      bars.push({ time: i, open: cl, high: cl, low: cl, close: cl });
    }
  }
  return bars;
}
