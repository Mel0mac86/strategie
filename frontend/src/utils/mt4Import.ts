/**
 * Import dei trade chiusi da MetaTrader 4 nel journal.
 * Supporta:
 *  - Statement HTML di MT4 (Account History → "Save as Report"/"Save as Detailed Report")
 *  - CSV/testo con header (symbol, type, open price, close price, profit, size, sl...)
 */

export type ParsedTrade = {
  asset: string;
  direction: "long" | "short";
  entry: number;
  exit: number | null;
  size_lots: number | null;
  pnl: number;
  r_multiple: number;
  notes: string;
};

function num(s: string | undefined): number {
  if (s == null) return NaN;
  // MT4 usa lo spazio come separatore migliaia; teniamo solo cifre, punto e segno
  const cleaned = String(s).replace(/\s/g, "").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function rMultiple(dir: "long" | "short", entry: number, exit: number | null, sl: number): number {
  if (!sl || !isFinite(sl) || sl <= 0 || exit == null || !isFinite(entry)) return 0;
  const risk = Math.abs(entry - sl);
  if (risk <= 0) return 0;
  const move = dir === "long" ? exit - entry : entry - exit;
  return Math.round((move / risk) * 100) / 100;
}

// ---------- HTML statement MT4 ----------
function parseHtml(text: string): ParsedTrade[] {
  const rows = text.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const trades: ParsedTrade[] = [];
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map((c) =>
      c
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .trim()
    );
    // Riga trade chiuso MT4: [ticket, openTime, type, size, item, price(open), s/l, t/p,
    //                         closeTime, price(close), commission, taxes, swap, profit]
    if (cells.length < 14) continue;
    const type = (cells[2] || "").toLowerCase();
    if (type !== "buy" && type !== "sell") continue;
    const entry = num(cells[5]);
    const exit = num(cells[9]);
    const sl = num(cells[6]);
    const profit = num(cells[13]);
    if (!isFinite(entry) || !isFinite(profit)) continue;
    const dir = type === "buy" ? "long" : "short";
    trades.push({
      asset: cells[4] || "?",
      direction: dir,
      entry,
      exit: isFinite(exit) ? exit : null,
      size_lots: isFinite(num(cells[3])) ? num(cells[3]) : null,
      pnl: profit,
      r_multiple: rMultiple(dir, entry, isFinite(exit) ? exit : null, sl),
      notes: `MT4 #${cells[0] || ""} ${cells[1] || ""}`.trim(),
    });
  }
  return trades;
}

// ---------- CSV ----------
function parseCsvTrades(text: string): ParsedTrade[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const split = (l: string) => l.split(/[,;\t]/).map((x) => x.trim());
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const idx = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iSym = idx("symbol", "item", "asset", "instrument");
  const iType = idx("type", "action", "direction", "side");
  const iOpen = idx("openprice", "open price", "open", "entry");
  const iClose = idx("closeprice", "close price", "close", "exit");
  const iProfit = idx("profit", "pnl", "p/l", "net");
  const iSize = idx("size", "lots", "volume", "qty");
  const iSl = idx("s/l", "sl", "stop");
  const hasHeader = iSym >= 0 || iProfit >= 0 || iType >= 0;
  if (!hasHeader) return [];

  const trades: ParsedTrade[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = split(lines[i]);
    const typeRaw = (iType >= 0 ? c[iType] : "").toLowerCase();
    const dir: "long" | "short" =
      typeRaw.includes("sell") || typeRaw.includes("short") ? "short" : "long";
    const entry = num(c[iOpen]);
    const exit = iClose >= 0 ? num(c[iClose]) : NaN;
    const profit = num(c[iProfit]);
    if (!isFinite(profit) && !isFinite(entry)) continue;
    const sl = iSl >= 0 ? num(c[iSl]) : NaN;
    trades.push({
      asset: iSym >= 0 ? c[iSym] || "?" : "?",
      direction: dir,
      entry: isFinite(entry) ? entry : 0,
      exit: isFinite(exit) ? exit : null,
      size_lots: iSize >= 0 && isFinite(num(c[iSize])) ? num(c[iSize]) : null,
      pnl: isFinite(profit) ? profit : 0,
      r_multiple: rMultiple(dir, entry, isFinite(exit) ? exit : null, sl),
      notes: "Import MT4",
    });
  }
  return trades;
}

/** Riconosce automaticamente HTML statement o CSV. */
export function parseMt4Trades(text: string): ParsedTrade[] {
  if (/<td|<tr|<table/i.test(text)) return parseHtml(text);
  return parseCsvTrades(text);
}
