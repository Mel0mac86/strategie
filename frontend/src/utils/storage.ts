/**
 * Storage locale cross-platform (AsyncStorage su mobile, localStorage su web).
 * Usato dalla checklist FTMO giornaliera per la persistenza per-giorno.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // best-effort
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // best-effort
    }
  },
};

/** Chiave del giorno corrente in formato YYYY-MM-DD (per reset a mezzanotte). */
export function todayKey(prefix = "checklist"): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return `${prefix}:${ymd}`;
}
