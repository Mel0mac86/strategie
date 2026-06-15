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

// ---------- Endpoints ----------
export const api = {
  baseUrl: API_URL,

  generateStrategy: (body: Record<string, any>) =>
    request<Strategy>("/api/strategy/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listStrategies: () => request<Strategy[]>("/api/strategy"),
  getStrategy: (id: string) => request<Strategy>(`/api/strategy/${id}`),
  deleteStrategy: (id: string) =>
    request<{ deleted: boolean }>(`/api/strategy/${id}`, { method: "DELETE" }),
  setScore: (id: string, score: number) =>
    request(`/api/strategy/${id}/score`, {
      method: "PATCH",
      body: JSON.stringify({ score }),
    }),
  strategyToEa: (body: Record<string, any>) =>
    request<string>("/api/strategy/ea", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  lotSize: (body: Record<string, any>) =>
    request<{ lots: number; micro_lots: number; risk_amount: number; pip_value_per_lot: number }>(
      "/api/lot-size",
      { method: "POST", body: JSON.stringify(body) }
    ),

  listTrades: () => request<Trade[]>("/api/trades"),
  createTrade: (body: Record<string, any>) =>
    request<Trade>("/api/trades", { method: "POST", body: JSON.stringify(body) }),
  deleteTrade: (id: string) =>
    request<{ deleted: boolean }>(`/api/trades/${id}`, { method: "DELETE" }),
  tradeStats: () => request<TradeStats>("/api/trades/stats"),

  getChallenge: () => request<Challenge>("/api/challenge"),
  upsertChallenge: (body: Record<string, any>) =>
    request<Challenge>("/api/challenge", { method: "POST", body: JSON.stringify(body) }),
};
