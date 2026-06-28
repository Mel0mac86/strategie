/** Backup e ripristino di tutti i dati locali dell'app (esporta/reimporta un file JSON). */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

const PREFIXES = ["store:", "checklist:"];

export async function buildBackup(): Promise<string> {
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter((k) => PREFIXES.some((p) => k.startsWith(p)));
  const pairs = await AsyncStorage.multiGet(ours);
  const data: Record<string, string | null> = {};
  for (const [k, v] of pairs) data[k] = v;
  return JSON.stringify(
    { app: "ftmo-strategy", version: 1, exported_at: new Date().toISOString(), data },
    null,
    2
  );
}

export async function exportBackup(): Promise<void> {
  const json = await buildBackup();
  const filename = `ftmo-backup-${Date.now()}.json`;
  if (Platform.OS === "web") {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Backup dati FTMO" });
  }
}

/** Reimporta un backup. Ritorna il numero di chiavi ripristinate. */
export async function importBackup(text: string): Promise<number> {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("File non valido (JSON corrotto).");
  }
  const data = obj?.data;
  if (!data || typeof data !== "object") throw new Error("Questo non è un backup FTMO valido.");
  const entries = Object.entries(data).filter(([, v]) => typeof v === "string") as [string, string][];
  if (!entries.length) throw new Error("Il backup non contiene dati.");
  await AsyncStorage.multiSet(entries);
  return entries.length;
}
