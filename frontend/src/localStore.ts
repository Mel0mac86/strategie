/**
 * Persistenza locale (AsyncStorage / localStorage) usata come fallback quando
 * il backend non è raggiungibile — così la PWA funziona standalone sull'iPhone.
 */
import { storage } from "@/utils/storage";
import {
  buildLocalStrategy,
  challengeProgress,
  lotSize,
  tradeStats,
  uid,
} from "@/localEngine";
import { generateEa } from "@/localEa";
import type { Strategy, Trade } from "@/api";

const K_STRAT = "store:strategies";
const K_TRADES = "store:trades";
const K_CHALLENGE = "store:challenge";

export const localStore = {
  // -------- Strategie --------
  async generateStrategy(req: Record<string, any>): Promise<Strategy> {
    const s = buildLocalStrategy(req);
    const list = (await storage.get<Strategy[]>(K_STRAT)) || [];
    list.unshift(s);
    await storage.set(K_STRAT, list);
    return s;
  },
  async listStrategies(): Promise<Strategy[]> {
    return (await storage.get<Strategy[]>(K_STRAT)) || [];
  },
  async getStrategy(id: string): Promise<Strategy> {
    const list = (await storage.get<Strategy[]>(K_STRAT)) || [];
    const found = list.find((x) => x.id === id);
    if (!found) throw new Error("Strategia non trovata (locale)");
    return found;
  },
  async deleteStrategy(id: string) {
    const list = (await storage.get<Strategy[]>(K_STRAT)) || [];
    await storage.set(K_STRAT, list.filter((x) => x.id !== id));
    return { deleted: true };
  },
  async setScore(id: string, score: number) {
    const list = (await storage.get<Strategy[]>(K_STRAT)) || [];
    const next = list.map((x) => (x.id === id ? { ...x, score } : x));
    await storage.set(K_STRAT, next);
    return { id, score };
  },
  async strategyToEa(body: Record<string, any>): Promise<string> {
    let strategy: Strategy | undefined = body.strategy;
    if (!strategy && body.strategy_id) {
      const list = (await storage.get<Strategy[]>(K_STRAT)) || [];
      strategy = list.find((x) => x.id === body.strategy_id);
    }
    if (!strategy) strategy = buildLocalStrategy({ strategy_type: body.strategy_type });
    return generateEa(strategy, {
      strategy_type: body.strategy_type,
      symbol: body.symbol,
      risk_pct: body.risk_pct,
      timeframe: body.timeframe,
    });
  },

  // -------- Lot size --------
  async lotSize(b: Record<string, any>) {
    return lotSize(b.account_size, b.risk_pct, b.sl_pips, b.asset_class);
  },

  // -------- Trades --------
  async listTrades(): Promise<Trade[]> {
    return (await storage.get<Trade[]>(K_TRADES)) || [];
  },
  async createTrade(b: Record<string, any>): Promise<Trade> {
    const t: Trade = {
      id: uid(),
      asset: b.asset,
      direction: b.direction || "long",
      entry: Number(b.entry || 0),
      exit: b.exit != null ? Number(b.exit) : null,
      size_lots: b.size_lots != null ? Number(b.size_lots) : null,
      pnl: Number(b.pnl || 0),
      r_multiple: Number(b.r_multiple || 0),
      notes: b.notes || "",
      created_at: new Date().toISOString(),
    };
    const list = (await storage.get<Trade[]>(K_TRADES)) || [];
    list.unshift(t);
    await storage.set(K_TRADES, list);
    return t;
  },
  async deleteTrade(id: string) {
    const list = (await storage.get<Trade[]>(K_TRADES)) || [];
    await storage.set(K_TRADES, list.filter((x) => x.id !== id));
    return { deleted: true };
  },
  async tradeStats() {
    const list = (await storage.get<Trade[]>(K_TRADES)) || [];
    return tradeStats(list);
  },

  // -------- Challenge --------
  async getChallenge() {
    const ch = await storage.get<any>(K_CHALLENGE);
    if (!ch) return { active: null };
    return {
      ...ch,
      active: true,
      progress: challengeProgress(
        ch.account_size,
        ch.current_balance,
        ch.phase,
        ch.daily_start_balance
      ),
    };
  },
  async upsertChallenge(b: Record<string, any>) {
    const doc = {
      id: uid(),
      account_size: Number(b.account_size || 50000),
      phase: b.phase || "phase1",
      current_balance: Number(b.current_balance ?? b.account_size ?? 50000),
      daily_start_balance: b.daily_start_balance ?? null,
      label: b.label || "Challenge attiva",
      broker: b.broker || "",
      active: true,
    };
    await storage.set(K_CHALLENGE, doc);
    return {
      ...doc,
      progress: challengeProgress(
        doc.account_size,
        doc.current_balance,
        doc.phase,
        doc.daily_start_balance
      ),
    };
  },
};
