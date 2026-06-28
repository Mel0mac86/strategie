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

async function fetchBinance(symbol: string, tf: string, limit = 1000): Promise<Bar[]> {
  const interval = BINANCE_TF[tf] || "1h";
  // Endpoint dati pubblico Binance (market data, keyless, CORS, non geo-bloccato).
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Binance ha risposto ${r.status}`);
  const arr = await r.json();
  if (!Array.isArray(arr)) throw new Error("Risposta Binance non valida");
  return arr.map((k: any[]) => ({
    time: Number(k[0]),
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
  }));
}

async function fetchTwelveData(symbol: string, tf: string, apiKey: string, outputsize = 1000): Promise<Bar[]> {
  if (!apiKey) throw new Error("NO_KEY");
  const interval = TD_TF[tf] || "1h";
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

export async function downloadBars(inst: Instrument, tf: string, apiKey: string): Promise<Bar[]> {
  const bars =
    inst.provider === "binance"
      ? await fetchBinance(inst.symbol, tf)
      : await fetchTwelveData(inst.symbol, tf, apiKey);
  // pulizia: scarta barre non valide
  return bars.filter((b) => isFinite(b.close) && isFinite(b.high) && isFinite(b.low) && b.high > 0);
}
