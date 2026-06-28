/**
 * Download automatico di dati storici OHLC (così non serve caricare il CSV).
 *
 * - Crypto: Binance (pubblico, SENZA chiave, CORS ok) → funziona subito.
 * - Forex / Metalli / Indici: Twelve Data (richiede una chiave gratuita,
 *   da incollare una volta; salvata in locale). Senza chiave si usa Binance
 *   (crypto) o il caricamento CSV.
 */
import { Bar } from "./data";

export type Provider = "binance" | "twelvedata";
export type Instrument = { label: string; symbol: string; provider: Provider };

export const INSTRUMENTS: Record<string, Instrument[]> = {
  crypto: [
    { label: "BTC/USDT", symbol: "BTCUSDT", provider: "binance" },
    { label: "ETH/USDT", symbol: "ETHUSDT", provider: "binance" },
    { label: "SOL/USDT", symbol: "SOLUSDT", provider: "binance" },
    { label: "BNB/USDT", symbol: "BNBUSDT", provider: "binance" },
    { label: "XRP/USDT", symbol: "XRPUSDT", provider: "binance" },
  ],
  forex: [
    { label: "EUR/USD", symbol: "EUR/USD", provider: "twelvedata" },
    { label: "GBP/USD", symbol: "GBP/USD", provider: "twelvedata" },
    { label: "USD/JPY", symbol: "USD/JPY", provider: "twelvedata" },
    { label: "AUD/USD", symbol: "AUD/USD", provider: "twelvedata" },
  ],
  metals: [
    { label: "XAU/USD (Oro)", symbol: "XAU/USD", provider: "twelvedata" },
    { label: "XAG/USD (Argento)", symbol: "XAG/USD", provider: "twelvedata" },
  ],
  indices: [
    { label: "S&P 500", symbol: "SPX", provider: "twelvedata" },
    { label: "Nasdaq 100", symbol: "NDX", provider: "twelvedata" },
    { label: "Dow Jones", symbol: "DJI", provider: "twelvedata" },
  ],
};

export function instrumentsFor(asset: string): Instrument[] {
  return INSTRUMENTS[asset] || INSTRUMENTS.crypto;
}

const BINANCE_TF: Record<string, string> = {
  M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d",
};
const TD_TF: Record<string, string> = {
  M5: "5min", M15: "15min", M30: "30min", H1: "1h", H4: "4h", D1: "1day",
};

const BINANCE_BASE = "https://data-api.binance.vision/api/v3/klines";

// Endpoint dati pubblico Binance (keyless, CORS, non geo-bloccato).
// Binance restituisce max 1000 barre/richiesta: paginiamo all'indietro con endTime.
async function fetchBinance(symbol: string, tf: string, count = 1000): Promise<Bar[]> {
  const interval = BINANCE_TF[tf] || "1h";
  const target = Math.min(Math.max(count, 100), 6000);
  const bySec: Record<number, Bar> = {};
  let endTime: number | undefined;
  let guard = 0;
  while (Object.keys(bySec).length < target && guard < 8) {
    guard++;
    const limit = Math.min(1000, target - Object.keys(bySec).length);
    let url = `${BINANCE_BASE}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Binance ha risposto ${r.status}`);
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const k of arr as any[][]) {
      bySec[Number(k[0])] = { time: Number(k[0]), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] };
    }
    endTime = Number(arr[0][0]) - 1; // più indietro nel tempo
    if (arr.length < limit) break; // storia esaurita
  }
  return Object.values(bySec).sort((a, b) => a.time - b.time);
}

async function fetchTwelveData(symbol: string, tf: string, apiKey: string, count = 1000): Promise<Bar[]> {
  if (!apiKey) throw new Error("NO_KEY");
  const interval = TD_TF[tf] || "1h";
  const outputsize = Math.min(Math.max(count, 100), 5000); // free tier: max 5000
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&outputsize=${outputsize}&format=JSON&apikey=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.status === "error" || !Array.isArray(j.values)) {
    throw new Error(j.message || "Errore Twelve Data (simbolo/chiave?)");
  }
  // Twelve Data restituisce dal più recente: invertiamo per avere oldest-first.
  return (j.values as any[])
    .slice()
    .reverse()
    .map((v) => ({
      time: Date.parse(String(v.datetime).replace(" ", "T")) || 0,
      open: +v.open, high: +v.high, low: +v.low, close: +v.close,
      volume: v.volume != null ? +v.volume : undefined,
    }));
}

export type MultiDownload = { inst: Instrument; bars: Bar[]; error?: string };

/** Scarica i dati di più strumenti (per il test multi-asset). Errori isolati per strumento. */
export async function downloadMany(
  asset: string,
  tf: string,
  apiKey: string,
  count = 1000
): Promise<MultiDownload[]> {
  const list = instrumentsFor(asset);
  const results: MultiDownload[] = [];
  for (const inst of list) {
    try {
      const bars = await downloadBars(inst, tf, apiKey, count);
      results.push({ inst, bars });
    } catch (e: any) {
      results.push({ inst, bars: [], error: e?.message || "errore" });
    }
  }
  return results;
}

export async function downloadBars(inst: Instrument, tf: string, apiKey: string, count = 1000): Promise<Bar[]> {
  const bars =
    inst.provider === "binance"
      ? await fetchBinance(inst.symbol, tf, count)
      : await fetchTwelveData(inst.symbol, tf, apiKey, count);
  // pulizia: scarta barre non valide
  return bars.filter((b) => isFinite(b.close) && isFinite(b.high) && isFinite(b.low) && b.high > 0);
}
