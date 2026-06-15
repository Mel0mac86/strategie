/**
 * Checklist FTMO Giornaliera — Pre-Trading.
 * Design Swiss Brutalist bianco/nero high-contrast.
 * Persistenza locale per-giorno: la chiave todayKey() cambia ogni giorno,
 * quindi a mezzanotte la checklist riparte automaticamente vuota.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, space, hardBorder, type as t } from "@/theme";
import { Card, Button } from "@/components/ui";
import { storage, todayKey } from "@/utils/storage";

const ITEMS: string[] = [
  "Calendario economico controllato (notizie ad alto impatto)",
  "Consapevolezza del Max Daily Loss (-5%)",
  "Consapevolezza del Max Overall Loss (-10%)",
  "Stato mentale lucido e riposato",
  "Nessun revenge trading dopo perdite",
  "Piano di trading definito per la sessione",
  "Livelli chiave (supporti/resistenze) segnati",
  "Rischio per trade calcolato e fissato",
  "Stop loss e take profit pianificati prima dell'ingresso",
  "Numero massimo di trade giornalieri rispettato",
  "Nessuna posizione overnight non pianificata",
  "Journal pronto per registrare i trade",
];

const EMPTY = (): boolean[] => ITEMS.map(() => false);

export default function ChecklistScreen() {
  const key = todayKey();
  const [checked, setChecked] = useState<boolean[]>(EMPTY);

  // Carica lo stato salvato del giorno corrente al mount / cambio chiave.
  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await storage.get<boolean[]>(key);
      if (active && Array.isArray(saved) && saved.length === ITEMS.length) {
        setChecked(saved);
      } else if (active) {
        setChecked(EMPTY());
      }
    })();
    return () => {
      active = false;
    };
  }, [key]);

  const total = ITEMS.length;
  const done = useMemo(() => checked.filter(Boolean).length, [checked]);
  const complete = done === total;

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = prev.slice();
      next[index] = !next[index];
      storage.set(key, next);
      return next;
    });
  };

  const reset = () => {
    const next = EMPTY();
    setChecked(next);
    storage.set(key, next);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.paper }}
      contentContainerStyle={styles.content}
    >
      {/* HEADER */}
      <View
        style={[
          styles.header,
          { backgroundColor: complete ? colors.green : colors.black },
        ]}
      >
        <Text style={styles.headerLabel}>FTMO · GIORNALIERA</Text>
        <Text style={styles.headerTitle}>
          {complete ? "PRONTO PER TRADARE ✓" : "CHECKLIST PRE-TRADING"}
        </Text>
        <Text style={styles.headerCounter}>
          {done} / {total}
        </Text>
      </View>

      {/* LISTA */}
      <Card style={styles.listCard}>
        {ITEMS.map((label, i) => {
          const isOn = checked[i];
          const last = i === ITEMS.length - 1;
          return (
            <Pressable
              key={i}
              onPress={() => toggle(i)}
              style={({ pressed }) => [
                styles.row,
                !last && styles.rowDivider,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  isOn && { backgroundColor: colors.black },
                ]}
              >
                {isOn && (
                  <Ionicons name="checkmark" size={18} color={colors.white} />
                )}
              </View>
              <Text
                style={[
                  styles.rowText,
                  isOn && styles.rowTextDone,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </Card>

      <Button title="Reset" variant="secondary" onPress={reset} />

      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
  },
  header: {
    ...hardBorder,
    padding: space.lg,
    marginBottom: space.lg,
  },
  headerLabel: {
    ...t.label,
    color: colors.white,
    opacity: 0.75,
    textTransform: "uppercase",
  },
  headerTitle: {
    ...t.h1,
    color: colors.white,
    marginTop: space.xs,
  },
  headerCounter: {
    ...t.hero,
    color: colors.white,
    marginTop: space.sm,
  },
  listCard: {
    padding: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  rowDivider: {
    borderBottomWidth: 2,
    borderBottomColor: colors.line,
  },
  checkbox: {
    width: 26,
    height: 26,
    ...hardBorder,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginRight: space.md,
  },
  rowText: {
    ...t.body,
    color: colors.black,
    flex: 1,
  },
  rowTextDone: {
    color: colors.muted,
    textDecorationLine: "line-through",
  },
});
