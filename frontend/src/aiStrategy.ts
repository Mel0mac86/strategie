/**
 * Generazione strategia con AI GRATUITA e senza chiave a pagamento.
 *
 * Usa un endpoint LLM pubblico keyless (Pollinations, compatibile OpenAI).
 * I numeri FTMO (limiti, lot size, parametri validati) restano calcolati in
 * locale: l'AI arricchisce solo i testi (titolo, sintesi, regole, routine,
 * do/don't). Se la chiamata fallisce, fallback automatico al template locale.
 */
import type { Strategy } from "@/api";
import { buildLocalStrategy } from "@/localEngine";

const AI_ENDPOINT =
  (process.env.EXPO_PUBLIC_AI_ENDPOINT as string) || "https://text.pollinations.ai/openai";
const AI_MODEL = (process.env.EXPO_PUBLIC_AI_MODEL as string) || "openai";

const ASSET_LABELS: Record<string, string> = {
  forex: "Forex (major)",
  indices: "Indici (US30, NAS100, GER40)",
  metals: "Metalli (XAUUSD, XAGUSD)",
  crypto: "Crypto (BTC, ETH)",
  mixed: "Misto",
};
const STYLE_LABELS: Record<string, string> = {
  scalping: "Scalping",
  intraday: "Day Trading",
  swing: "Swing Trading",
};
const STRAT_LABELS: Record<string, string> = {
  trend_pullback: "Trend + Pullback",
  session_breakout: "Breakout di Sessione",
  xau_scalper: "XAU Scalper",
  mean_reversion: "Mean Reversion",
};

function prompt(req: Record<string, any>): string {
  const acc = Number(req.account_size || 50000);
  // Schema "piatto" (solo array di stringhe): i modelli gratuiti sbagliano spesso
  // gli oggetti annidati. La routine è "HH:MM | attività" e la riconvertiamo noi.
  return (
    `Sei un trading coach professionista specializzato in challenge FTMO/prop firm. ` +
    `Genera una strategia CONCRETA e OPERATIVA in ITALIANO e rispondi SOLO con un oggetto ` +
    `JSON valido (nessun testo prima o dopo), con SOLO array di stringhe:\n` +
    `{"title": "...", "summary": "...", "entry_rules": ["..."], "exit_rules": ["..."], ` +
    `"daily_routine": ["07:30 | controlla calendario economico", "08:00 | analisi multi-timeframe"], ` +
    `"do": ["..."], "dont": ["..."]}\n\n` +
    `Parametri:\n` +
    `- Capitale: $${acc.toLocaleString("it-IT")}\n` +
    `- Fase: ${req.phase || "phase1"} (target +${req.phase === "phase2" ? "5" : "10"}%, max -5%/giorno, -10% totale)\n` +
    `- Asset: ${ASSET_LABELS[req.asset_class] || req.asset_class}\n` +
    `- Tolleranza rischio: ${req.risk_tolerance || "medium"}\n` +
    `- Stile: ${STYLE_LABELS[req.trading_style] || req.trading_style}\n` +
    `- Tipo strategia: ${STRAT_LABELS[req.strategy_type] || req.strategy_type}\n` +
    `- Timeframe operativo: ${req.timeframe || "H1"}\n\n` +
    `Regole d'ingresso specifiche con indicatori e valori concreti (EMA, RSI, ATR per lo stop, ` +
    `conferma e filtro di trend), uscite con stop ATR/take profit a R multipli/break-even, ` +
    `5-7 voci di routine con orari, do/don't concreti, coerenza coi limiti FTMO. ` +
    `Frasi BREVI (non superare il limite di lunghezza). ` +
    `Usa SOLO stringhe negli array, mai oggetti, e rispondi SOLO col JSON.`
  );
}

function refinePrompt(req: Record<string, any>, exp: any): string {
  return (
    `Hai proposto una strategia ${STRAT_LABELS[req.strategy_type] || req.strategy_type} ` +
    `(${STYLE_LABELS[req.trading_style] || req.trading_style}, ${req.timeframe || "H1"}) per FTMO. ` +
    `È stata BACKTESTATA su DATI REALI (${exp.source}) con validazione out-of-sample:\n` +
    `- Rendimento: ${exp.netPnlPct}%\n- Win rate: ${exp.winRate}%\n- Profit factor: ${exp.profitFactor}\n` +
    `- Max drawdown: ${exp.maxDrawdownPct}%\n- Trade: ${exp.trades}\n` +
    `- Parametri ottimali trovati: Risk:Reward 1:${exp.rr}, Stop ${exp.slAtrMult}× ATR\n` +
    `- Robusta out-of-sample: ${exp.robust ? "sì" : "no"}\n\n` +
    `Analizza questi risultati REALI e MIGLIORA la strategia. Rispondi SOLO con JSON, ` +
    `array di sole stringhe BREVI:\n` +
    `{"verdict": "max 2 frasi: valutazione + 2 consigli concreti", "summary": "1 frase", ` +
    `"entry_rules": ["max 5 voci brevi"], "exit_rules": ["max 4 voci brevi"], ` +
    `"do": ["max 4 voci"], "dont": ["max 4 voci"]}\n` +
    `Sii onesto: se PF<1 o non robusta, dillo e proponi correzioni. ` +
    `IMPORTANTE: sii CONCISO, frasi corte, per non superare il limite di lunghezza.`
  );
}

function tryParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    /* prova le riparazioni sotto */
  }
  // 1) virgole finali
  let r = s.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(r);
  } catch {
    /* continua */
  }
  // 2) JSON troncato: taglia all'ultimo elemento completo e chiude le parentesi
  try {
    let t = s;
    // se l'ultimo carattere non chiude una struttura, tronca dopo l'ultima stringa completa
    if (!/[}\]]\s*$/.test(t)) {
      const cut = t.lastIndexOf('",');
      const cut2 = t.lastIndexOf('"]');
      const at = Math.max(cut, cut2);
      if (at > 0) t = t.slice(0, at + 1);
    }
    // chiudi parentesi aperte (ignorando quelle dentro le stringhe in modo approssimato)
    let depth: string[] = [];
    let inStr = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch === '"' && t[i - 1] !== "\\") inStr = !inStr;
      if (inStr) continue;
      if (ch === "{" || ch === "[") depth.push(ch);
      else if (ch === "}" || ch === "]") depth.pop();
    }
    if (inStr) t += '"';
    while (depth.length) t += depth.pop() === "{" ? "}" : "]";
    t = t.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function extractJson(text: string): any | null {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1];
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return tryParse(s.slice(start, end + 1));
}

async function callRaw(userContent: string): Promise<any | null> {
  const body = {
    model: AI_MODEL,
    messages: [
      { role: "system", content: "Sei un assistente che risponde solo con JSON valido in italiano." },
      { role: "user", content: userContent },
    ],
    temperature: 0.4,
  };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    const r = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    const msg = data?.choices?.[0]?.message || {};
    // alcuni modelli "reasoning" mettono il JSON in content, altri in reasoning
    return (
      extractJson(typeof msg.content === "string" ? msg.content : "") ||
      extractJson(typeof msg.reasoning === "string" ? msg.reasoning : "")
    );
  } catch {
    return null;
  }
}

/** Ritenta la chiamata AI fino a `tries` volte (il modello gratuito a volte sbaglia il JSON). */
async function callRawRetry(content: string, tries = 3): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    const r = await callRaw(content);
    if (r) return r;
  }
  return null;
}

const asArr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/**
 * Affina la strategia in base al BACKTEST REALE: l'AI analizza le metriche reali,
 * migliora regole/uscite e produce un verdetto con consigli concreti.
 */
export async function refineWithBacktest(
  s: Strategy,
  req: Record<string, any>,
  exp: NonNullable<Strategy["expected"]>
): Promise<Strategy> {
  const ai = await callRawRetry(refinePrompt(req, exp), 2);
  if (!ai) return s;
  return {
    ...s,
    verdict: typeof ai.verdict === "string" && ai.verdict.trim() ? ai.verdict.trim() : s.verdict,
    summary: typeof ai.summary === "string" && ai.summary.trim() ? ai.summary.trim() : s.summary,
    entry_rules: asArr(ai.entry_rules).length ? asArr(ai.entry_rules) : s.entry_rules,
    exit_rules: asArr(ai.exit_rules).length ? asArr(ai.exit_rules) : s.exit_rules,
    do: asArr(ai.do).length ? asArr(ai.do) : s.do,
    dont: asArr(ai.dont).length ? asArr(ai.dont) : s.dont,
  };
}

/** Genera una strategia con AI gratuita; in caso di errore usa il template locale. */
export async function generateAiStrategy(req: Record<string, any>): Promise<Strategy> {
  const base = buildLocalStrategy(req); // ftmo, risk_management, expected calcolati in locale
  const ai = await callRawRetry(prompt(req), 3);
  if (!ai) return { ...base, generated_by: "local" };

  const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  // routine: stringhe "HH:MM | task" oppure oggetti {time,task} → normalizza
  const routine = Array.isArray(ai.daily_routine)
    ? ai.daily_routine
        .map((x: any) => {
          if (typeof x === "string") {
            const m = x.match(/^\s*(\d{1,2}[:.]\d{2})\s*[|\-–:]\s*(.+)$/);
            if (m) return { time: m[1].replace(".", ":"), task: m[2].trim() };
            return { time: "", task: x.trim() };
          }
          if (x && typeof x === "object") return { time: String(x.time || ""), task: String(x.task || "") };
          return null;
        })
        .filter((x: any): x is { time: string; task: string } => !!x && !!x.task)
    : base.daily_routine;

  return {
    ...base,
    title: typeof ai.title === "string" && ai.title.trim() ? ai.title.trim() : base.title,
    summary: typeof ai.summary === "string" && ai.summary.trim() ? ai.summary.trim() : base.summary,
    entry_rules: arr(ai.entry_rules).length ? arr(ai.entry_rules) : base.entry_rules,
    exit_rules: arr(ai.exit_rules).length ? arr(ai.exit_rules) : base.exit_rules,
    daily_routine: routine.length ? routine : base.daily_routine,
    do: arr(ai.do).length ? arr(ai.do) : base.do,
    dont: arr(ai.dont).length ? arr(ai.dont) : base.dont,
    generated_by: "ai",
  };
}
