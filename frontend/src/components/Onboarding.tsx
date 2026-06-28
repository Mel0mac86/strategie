/** Onboarding/tutorial mostrato al primo avvio (e richiamabile da "Rivedi tutorial"). */
import React, { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { colors, space, hardBorder, type as t } from "@/theme";
import { Button } from "@/components/ui";
import { storage } from "@/utils/storage";

const KEY = "store:onboarded";

const STEPS = [
  {
    icon: "🎯",
    title: "Benvenuto in FTMO Strategy",
    body: "Genera, testa e mantieni strategie di trading conformi alle regole FTMO. Tutto funziona offline sul tuo iPhone — nessun login richiesto.",
  },
  {
    icon: "⚡",
    title: "1 · Genera la strategia",
    body: "Nella tab Genera scegli dimensione conto, fase, asset, stile e timeframe. Modalità Locale (istantanea) o AI. Ottieni regole d'ingresso, gestione del rischio e performance stimata.",
  },
  {
    icon: "📊",
    title: "2 · Valida col Backtest",
    body: "Apri Backtest (anche dal pulsante nella strategia). Scarica dati reali online o importa un CSV, poi usa Ottimizza e Walk-forward per parametri robusti e realistici, non solo belli sulla carta.",
  },
  {
    icon: "🤖",
    title: "3 · Esporta l'EA per MT4",
    body: "Dalla strategia premi EA MT4: scarichi un Expert Advisor .mq4 pronto per MetaTrader 4, con gestione del rischio FTMO già integrata e i parametri validati.",
  },
  {
    icon: "📈",
    title: "4 · Monitora e mantieni",
    body: "Dashboard multi-conto con alert FTMO, Calcolatore lot size, Journal (anche import da MT4) e Checklist pre-trading. In fondo alla Checklist trovi Backup & Ripristino. Buon trading!",
  },
];

let openFn: (() => void) | null = null;
/** Riapre il tutorial da qualunque schermata. */
export function openTutorial() {
  openFn?.();
}

export function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    openFn = () => {
      setStep(0);
      setVisible(true);
    };
    (async () => {
      const done = await storage.get<boolean>(KEY);
      if (!done) {
        setStep(0);
        setVisible(true);
      }
    })();
    return () => {
      openFn = null;
    };
  }, []);

  const finish = async () => {
    await storage.set(KEY, true);
    setVisible(false);
  };

  const cur = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={finish}>
      <View style={styles.container}>
        <View style={styles.top}>
          <Pressable onPress={finish} hitSlop={10}>
            <Text style={styles.skip}>SALTA</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.icon}>{cur.icon}</Text>
          <Text style={styles.title}>{cur.title}</Text>
          <Text style={styles.text}>{cur.body}</Text>
        </View>

        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.actions}>
          {step > 0 ? (
            <Button title="Indietro" variant="secondary" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <View style={{ width: space.md }} />
          <Button
            title={last ? "Inizia" : "Avanti"}
            variant={last ? "success" : "primary"}
            onPress={() => (last ? finish() : setStep((s) => s + 1))}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: space.xl, justifyContent: "space-between" },
  top: { flexDirection: "row", justifyContent: "flex-end", paddingTop: space.xl },
  skip: { ...t.label, color: colors.muted },
  body: { flex: 1, justifyContent: "center" },
  icon: { fontSize: 64, marginBottom: space.lg },
  title: { ...t.hero, color: colors.black, marginBottom: space.md, lineHeight: 38 },
  text: { ...t.body, color: colors.ink, lineHeight: 24, fontSize: 16 },
  dots: { flexDirection: "row", justifyContent: "center", marginBottom: space.lg },
  dot: { width: 10, height: 10, ...hardBorder, marginHorizontal: 5, backgroundColor: colors.white },
  dotActive: { backgroundColor: colors.black },
  actions: { flexDirection: "row", paddingBottom: space.xl },
});
