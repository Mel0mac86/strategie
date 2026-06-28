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
    `Sei un trading coach esperto di challenge FTMO. Genera una strategia in ITALIANO ` +
    `e rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, con SOLO array di stringhe:\n` +
    `{"title": "...", "summary": "...", "entry_rules": ["..."], "exit_rules": ["..."], ` +
    `"daily_routine": ["07:30 | controlla calendario economico", "08:00 | analisi multi-timeframe"], ` +
    `"do": ["..."], "dont": ["..."]}\n\n` +
    `Parametri:\n` +
    `- Capitale: $${acc.toLocaleString("it-IT")}\n` +
    `- Fase: ${req.phase || "phase1"}\n` +
    `- Asset: ${ASSET_LABELS[req.asset_class] || req.asset_class}\n` +
    `- Tolleranza rischio: ${req.risk_tolerance || "medium"}\n` +
    `- Stile: ${STYLE_LABELS[req.trading_style] || req.trading_style}\n` +
    `- Tipo strategia: ${STRAT_LABELS[req.strategy_type] || req.strategy_type}\n` +
    `- Timeframe: ${req.timeframe || "H1"}\n` +
    `Regole d'ingresso numerate e specifiche, 5-7 voci di routine con orari, ` +
    `liste do/don't concrete, rispetto dei limiti FTMO (max -5% giornaliero, -10% totale). ` +
    `Usa SOLO stringhe negli array, mai oggetti.`
  );
}

function tryParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    // riparazioni comuni: virgole finali, oggetti dentro array (->stringa)
    let r = s.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(r);
    } catch {
      return null;
    }
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

async function callAi(req: Record<string, any>): Promise<any | null> {
  const body = {
    model: AI_MODEL,
    messages: [
      { role: "system", content: "Sei un assistente che risponde solo con JSON valido in italiano." },
      { role: "user", content: prompt(req) },
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
    const content = data?.choices?.[0]?.message?.content;
    return extractJson(typeof content === "string" ? content : "");
  } catch {
    return null;
  }
}

/** Genera una strategia con AI gratuita; in caso di errore usa il template locale. */
export async function generateAiStrategy(req: Record<string, any>): Promise<Strategy> {
  const base = buildLocalStrategy(req); // ftmo, risk_management, expected calcolati in locale
  const ai = await callAi(req);
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
