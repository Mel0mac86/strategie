/**
 * Client API verso il backend FastAPI.
 * L'URL si configura via app.json -> extra.apiUrl oppure EXPO_PUBLIC_API_URL.
 */
import Constants from "expo-constants";

const API_URL: string =
  (process.env.EXPO_PUBLIC_API_URL as string) ||
  (Constants.expoConfig?.extra as any)?.apiUrl ||
  "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

// ---------- Tipi ----------
export type FtmoLimits = {
  account_size: number;
  phase: string;
  max_daily_loss: number;
  max_overall_loss: number;
  profit_target: number;
  profit_target_pct: number;
  daily_loss_floor: number;
  overall_loss_floor: number;
};

export type RiskManagement = {
  risk_per_trade_pct: number;
  max_risk_per_trade_usd?: number;
  max_daily_loss_usd?: number;
  max_overall_loss_usd?: number;
  max_daily_trades: number;
  min_rr: number;
  lot_size_formula: string;
};

export type Strategy = {
  id: string;
  title: string;
  summary: string;
  request: Record<string, any>;
  ftmo: FtmoLimits;
  risk_management: RiskManagement;
  entry_rules: string[];
  exit_rules: string[];
  daily_routine: { time: string; task: string }[];
  do: string[];
  dont: string[];
  generated_by: "ai" | "local";
  score?: number | null;
  created_at: string;
};

export type Trade = {
  id: string;
  asset: string;
  direction: string;
  entry: number;
  exit?: number | null;
  size_lots?: number | null;
  pnl: number;
  r_multiple: number;
  notes: string;
  created_at: string;
};

export type TradeStats = {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl: number;
  avg_r: number;
  profit_factor: number;
  best_trade: number;
  worst_trade: number;
};

export type ChallengeProgress = {
  account_size: number;
  max_daily_loss: number;
  max_overall_loss: number;
  profit_target: number;
  current_balance: number;
  pnl: number;
  pnl_pct: number;
  overall_drawdown: number;
  overall_drawdown_pct: number;
  daily_loss: number;
  daily_loss_pct: number;
  remaining_to_daily_limit: number;
  remaining_to_overall_limit: number;
  progress_to_target_pct: number;
  target_reached: boolean;
  risk_color: "green" | "yellow" | "red";
  daily_limit_breached: boolean;
  overall_limit_breached: boolean;
};

export type Challenge = {
  active: boolean | null;
  id?: string;
  account_size?: number;
  phase?: string;
  current_balance?: number;
  label?: string;
  broker?: string;
  progress?: ChallengeProgress;
};

// ---------- Fallback locale (PWA standalone su iPhone) ----------
// Import dinamico per evitare cicli: localStore importa i tipi da questo file.
import { localStore } from "@/localStore";

/**
 * Modalità "solo locale": forza l'uso dello store sul dispositivo senza tentare
 * la rete. Attivabile con EXPO_PUBLIC_LOCAL_ONLY=1 (consigliato per la PWA iPhone).
 */
const LOCAL_ONLY =
  String(process.env.EXPO_PUBLIC_LOCAL_ONLY || "").trim() === "1";

/** Esegue la chiamata di rete; se fallisce (o in LOCAL_ONLY) usa il fallback locale. */
async function withFallback<T>(net: () => Promise<T>, local: () => Promise<T>): Promise<T> {
  if (LOCAL_ONLY) return local();
  try {
    return await net();
  } catch {
    return local();
  }
}

// ---------- Endpoints ----------
export const api = {
  baseUrl: API_URL,
  localOnly: LOCAL_ONLY,

  generateStrategy: (body: Record<string, any>) =>
    // In modalità locale, o senza backend, genera direttamente sul dispositivo.
    body.mode === "local"
      ? localStore.generateStrategy(body)
      : withFallback(
          () =>
            request<Strategy>("/api/strategy/generate", {
              method: "POST",
              body: JSON.stringify(body),
            }),
          () => localStore.generateStrategy(body)
        ),
  listStrategies: () =>
    withFallback(() => request<Strategy[]>("/api/strategy"), () => localStore.listStrategies()),
  getStrategy: (id: string) =>
    withFallback(() => request<Strategy>(`/api/strategy/${id}`), () => localStore.getStrategy(id)),
  deleteStrategy: (id: string) =>
    withFallback(
      () => request<{ deleted: boolean }>(`/api/strategy/${id}`, { method: "DELETE" }),
      () => localStore.deleteStrategy(id)
    ),
  setScore: (id: string, score: number) =>
    withFallback(
      () =>
        request(`/api/strategy/${id}/score`, {
          method: "PATCH",
          body: JSON.stringify({ score }),
        }),
      () => localStore.setScore(id, score)
    ),
  strategyToEa: (body: Record<string, any>) =>
    withFallback(
      () =>
        request<string>("/api/strategy/ea", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      () => localStore.strategyToEa(body)
    ),

  lotSize: (body: Record<string, any>) =>
    withFallback(
      () =>
        request<{ lots: number; micro_lots: number; risk_amount: number; pip_value_per_lot: number }>(
          "/api/lot-size",
          { method: "POST", body: JSON.stringify(body) }
        ),
      () => localStore.lotSize(body)
    ),

  listTrades: () =>
    withFallback(() => request<Trade[]>("/api/trades"), () => localStore.listTrades()),
  createTrade: (body: Record<string, any>) =>
    withFallback(
      () => request<Trade>("/api/trades", { method: "POST", body: JSON.stringify(body) }),
      () => localStore.createTrade(body)
    ),
  deleteTrade: (id: string) =>
    withFallback(
      () => request<{ deleted: boolean }>(`/api/trades/${id}`, { method: "DELETE" }),
      () => localStore.deleteTrade(id)
    ),
  tradeStats: () =>
    withFallback(() => request<TradeStats>("/api/trades/stats"), () => localStore.tradeStats()),

  getChallenge: () =>
    withFallback(() => request<Challenge>("/api/challenge"), () => localStore.getChallenge()),
  upsertChallenge: (body: Record<string, any>) =>
    withFallback(
      () => request<Challenge>("/api/challenge", { method: "POST", body: JSON.stringify(body) }),
      () => localStore.upsertChallenge(body)
    ),
};
