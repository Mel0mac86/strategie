import React, { useState } from "react";
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  Pressable,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/api";
import { Button, Card, ChipRow, SectionLabel } from "@/components/ui";
import { colors, space, type as t, hardBorder } from "@/theme";

const ACCOUNT_SIZES = [
  { label: "$10k", value: "10000" },
  { label: "$25k", value: "25000" },
  { label: "$50k", value: "50000" },
  { label: "$100k", value: "100000" },
  { label: "$200k", value: "200000" },
];
const PHASES = [
  { label: "Fase 1", value: "phase1" },
  { label: "Fase 2", value: "phase2" },
  { label: "Funded", value: "funded" },
];
const ASSETS = [
  { label: "Forex", value: "forex" },
  { label: "Indici", value: "indices" },
  { label: "Metalli", value: "metals" },
  { label: "Misto", value: "mixed" },
];
const RISK = [
  { label: "Basso", value: "low" },
  { label: "Medio", value: "medium" },
  { label: "Alto", value: "high" },
];
const STYLES = [
  { label: "Scalping", value: "scalping" },
  { label: "Day Trading", value: "intraday" },
  { label: "Swing Trading", value: "swing" },
];
const STRATEGIES = [
  { label: "Trend + Pullback", value: "trend_pullback" },
  { label: "Breakout Sessione", value: "session_breakout" },
  { label: "XAU Scalper", value: "xau_scalper" },
  { label: "Mean Reversion", value: "mean_reversion" },
];
const TIMEFRAMES = [
  { label: "M5", value: "M5" },
  { label: "M15", value: "M15" },
  { label: "M30", value: "M30" },
  { label: "H1", value: "H1" },
  { label: "H4", value: "H4" },
  { label: "D1", value: "D1" },
];

export default function GeneratorScreen() {
  const router = useRouter();
  const [accountSize, setAccountSize] = useState("50000");
  const [phase, setPhase] = useState("phase1");
  const [asset, setAsset] = useState("forex");
  const [risk, setRisk] = useState("medium");
  const [style, setStyle] = useState("intraday");
  const [strategyType, setStrategyType] = useState("trend_pullback");
  const [timeframe, setTimeframe] = useState("H1");
  const [mode, setMode] = useState<"local" | "ai">("local");
  const [loading, setLoading] = useState(false);

  async function onGenerate() {
    setLoading(true);
    try {
      const strat = await api.generateStrategy({
        account_size: Number(accountSize),
        phase,
        asset_class: asset,
        risk_tolerance: risk,
        trading_style: style,
        strategy_type: strategyType,
        timeframe,
        mode,
      });
      router.push(`/strategy/${strat.id}`);
    } catch (e: any) {
      Alert.alert("Errore", e?.message || "Generazione fallita. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hero}>GENERA{"\n"}STRATEGIA</Text>
          <Text style={styles.heroSub}>
            Strategie conformi FTMO · Forex · Indici · Metalli
          </Text>
        </View>
        <Pressable onPress={() => router.push("/history")} style={styles.histBtn}>
          <Ionicons name="time-outline" size={22} color={colors.black} />
          <Text style={styles.histTxt}>STORICO</Text>
        </Pressable>
      </View>

      {/* Toggle modalità */}
      <View style={styles.modeRow}>
        <ModeButton
          active={mode === "local"}
          title="Modalità Locale"
          subtitle="Istantanea"
          onPress={() => setMode("local")}
        />
        <ModeButton
          active={mode === "ai"}
          title="Modalità AI"
          subtitle="Gratis · personalizzata"
          onPress={() => setMode("ai")}
        />
      </View>
      {mode === "ai" && (
        <Text style={styles.aiHint}>
          AI gratuita, nessuna chiave richiesta · ~10-30s. Richiede connessione internet;
          se non disponibile, fallback automatico sul template locale.
        </Text>
      )}

      <Card>
        <SectionLabel>Dimensione conto</SectionLabel>
        <ChipRow options={ACCOUNT_SIZES} value={accountSize} onChange={setAccountSize} />

        <SectionLabel>Fase challenge</SectionLabel>
        <ChipRow options={PHASES} value={phase} onChange={setPhase} />

        <SectionLabel>Asset class</SectionLabel>
        <ChipRow options={ASSETS} value={asset} onChange={setAsset} />

        <SectionLabel>Tolleranza rischio</SectionLabel>
        <ChipRow options={RISK} value={risk} onChange={setRisk} />

        <SectionLabel>Stile di trading</SectionLabel>
        <ChipRow options={STYLES} value={style} onChange={setStyle} />

        <SectionLabel>Tipo di strategia</SectionLabel>
        <ChipRow options={STRATEGIES} value={strategyType} onChange={setStrategyType} />

        <SectionLabel>Timeframe</SectionLabel>
        <ChipRow options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
      </Card>

      <Button
        title={loading ? "Generazione..." : "Genera Strategia"}
        onPress={onGenerate}
        loading={loading}
      />
      <Text style={styles.footnote}>
        Ogni strategia viene salvata automaticamente nello Storico.
      </Text>
    </ScrollView>
  );
}

function ModeButton({
  active,
  title,
  subtitle,
  onPress,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modeBtn,
        { backgroundColor: active ? colors.black : colors.white },
      ]}
    >
      <Text style={[styles.modeTitle, { color: active ? colors.white : colors.black }]}>
        {title}
      </Text>
      <Text style={[styles.modeSub, { color: active ? colors.white : colors.muted }]}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: 48 },
  heroRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: space.lg },
  hero: { ...t.hero, color: colors.black, lineHeight: 36 },
  heroSub: { ...t.small, color: colors.muted, marginTop: space.sm },
  histBtn: { alignItems: "center", padding: space.sm },
  histTxt: { ...t.label, color: colors.black, marginTop: 2 },
  modeRow: { flexDirection: "row", gap: space.md, marginBottom: space.sm },
  modeBtn: { flex: 1, ...hardBorder, padding: space.md },
  modeTitle: { fontSize: 14, fontWeight: "800" },
  modeSub: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  aiHint: { ...t.small, color: colors.blue, marginBottom: space.lg, lineHeight: 18 },
  footnote: { ...t.small, color: colors.muted, textAlign: "center", marginTop: space.md },
});
