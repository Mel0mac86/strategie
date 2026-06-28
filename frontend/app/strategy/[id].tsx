import React, { useEffect, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Strategy } from "@/api";
import { Badge, Button, Card, ChipRow, SectionLabel } from "@/components/ui";
import { colors, fonts, hardBorder, space, type as t } from "@/theme";
import { exportStrategyPdf, shareStrategy } from "@/utils/exporters";
import { saveEaFile } from "@/utils/ea";

const EA_STRATEGIES = [
  { label: "Trend + Pullback", value: "trend_pullback" },
  { label: "Breakout Sessione", value: "session_breakout" },
  { label: "XAU Scalper", value: "xau_scalper" },
  { label: "Mean Reversion", value: "mean_reversion" },
];

export default function StrategyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [eaOpen, setEaOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setStrategy(await api.getStrategy(id));
      } catch (e: any) {
        Alert.alert("Errore", e?.message || "Strategia non trovata");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.black} />
      </View>
    );
  }
  if (!strategy) {
    return (
      <View style={styles.center}>
        <Text style={t.body as any}>Strategia non disponibile.</Text>
      </View>
    );
  }

  const s = strategy;
  const fmt = (n?: number) => "$" + (n ?? 0).toLocaleString("it-IT");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* HERO */}
      <Card style={{ backgroundColor: colors.black }}>
        <View style={styles.heroTop}>
          <Badge
            text={s.generated_by === "ai" ? "AI · CLAUDE" : "LOCALE"}
            bg={s.generated_by === "ai" ? colors.blue : colors.muted}
          />
          {s.score ? <Badge text={`SCORE ${s.score}/100`} bg={colors.green} /> : null}
        </View>
        <Text style={styles.heroTitle}>{s.title}</Text>
        <Text style={styles.heroSummary}>{s.summary}</Text>
        <View style={styles.heroActions}>
          <IconAction icon="document-text-outline" label="PDF" onPress={() => exportStrategyPdf(s)} />
          <IconAction icon="share-social-outline" label="Condividi" onPress={() => shareStrategy(s)} />
          <IconAction icon="code-slash-outline" label="EA MT4" onPress={() => setEaOpen(true)} highlight />
          <IconAction
            icon="bar-chart-outline"
            label="Backtest"
            onPress={() =>
              router.push({
                pathname: "/backtest",
                params: {
                  strategy_type: (s.request?.strategy_type as string) || "trend_pullback",
                  asset_class: (s.request?.asset_class as string) || "forex",
                  account_size: String(s.ftmo?.account_size ?? 50000),
                  timeframe: (s.request?.timeframe as string) || "H1",
                  risk_pct: String(s.risk_management?.risk_per_trade_pct ?? 1),
                },
              })
            }
          />
        </View>
        {s.request?.timeframe ? (
          <Text style={styles.heroMeta}>Timeframe: {String(s.request.timeframe)}</Text>
        ) : null}
      </Card>

      {/* BENTO: gestione rischio */}
      <SectionLabel>Gestione del Rischio</SectionLabel>
      <View style={styles.bento}>
        <MiniCard label="Max Daily Loss" value={fmt(s.ftmo?.max_daily_loss)} sub="5%" accent={colors.red} />
        <MiniCard label="Max Overall Loss" value={fmt(s.ftmo?.max_overall_loss)} sub="10%" accent={colors.red} />
      </View>
      <View style={styles.bento}>
        <MiniCard
          label="Profit Target"
          value={fmt(s.ftmo?.profit_target)}
          sub={`${Math.round((s.ftmo?.profit_target_pct || 0) * 100)}%`}
          accent={colors.green}
        />
        <MiniCard
          label="Rischio / Trade"
          value={`${s.risk_management.risk_per_trade_pct}%`}
          sub={fmt(s.risk_management.max_risk_per_trade_usd)}
          accent={colors.blue}
        />
      </View>

      <Card>
        <SectionLabel>Formula Lot Size</SectionLabel>
        <View style={styles.monoBox}>
          <Text style={styles.mono}>{s.risk_management.lot_size_formula}</Text>
        </View>
        <View style={styles.rmRow}>
          <Text style={styles.rmItem}>Max trade/giorno: <Text style={styles.bold}>{s.risk_management.max_daily_trades}</Text></Text>
          <Text style={styles.rmItem}>RR minimo: <Text style={styles.bold}>1:{s.risk_management.min_rr}</Text></Text>
        </View>
      </Card>

      {/* Performance stimata (parametri auto-validati out-of-sample su dati simulati) */}
      {s.expected ? (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.sm }}>
            <SectionLabel>Performance stimata</SectionLabel>
            <Badge
              text={s.expected.robust ? "SOLIDA" : "DA VALIDARE"}
              bg={s.expected.robust ? colors.green : colors.yellow}
            />
          </View>
          <Text style={styles.expParams}>
            Parametri auto-validati: RR 1:{s.expected.rr} · Stop {s.expected.slAtrMult}× ATR
          </Text>
          <View style={styles.bento}>
            <MiniCard label="Rendimento" value={`${s.expected.netPnlPct}%`} accent={s.expected.netPnlPct >= 0 ? colors.green : colors.red} />
            <MiniCard label="Win rate" value={`${s.expected.winRate}%`} accent={colors.blue} />
          </View>
          <View style={styles.bento}>
            <MiniCard label="Profit factor" value={String(s.expected.profitFactor)} accent={s.expected.profitFactor >= 1 ? colors.green : colors.red} />
            <MiniCard label="Max drawdown" value={`${s.expected.maxDrawdownPct}%`} accent={s.expected.maxDrawdownPct > 10 ? colors.red : colors.yellow} />
          </View>
          <Text style={styles.expNote}>
            ⚠️ Stima su dati simulati ({s.expected.trades} trade, out-of-sample). Non è una garanzia:
            premi "Backtest" e carica un CSV reale per validarla sul mercato vero.
          </Text>
        </Card>
      ) : null}

      {/* Regole di ingresso numerate */}
      <Card>
        <SectionLabel>Regole di Ingresso</SectionLabel>
        {s.entry_rules.map((r, i) => (
          <View key={i} style={styles.numRow}>
            <View style={styles.numBadge}>
              <Text style={styles.numTxt}>{i + 1}</Text>
            </View>
            <Text style={styles.ruleTxt}>{r}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <SectionLabel>Regole di Uscita</SectionLabel>
        {s.exit_rules.map((r, i) => (
          <Text key={i} style={styles.bullet}>→ {r}</Text>
        ))}
      </Card>

      {/* Routine timeline */}
      <Card>
        <SectionLabel>Routine Giornaliera</SectionLabel>
        {s.daily_routine.map((r, i) => (
          <View key={i} style={styles.timelineRow}>
            <Text style={styles.timeTxt}>{r.time}</Text>
            <View style={styles.timelineLine} />
            <Text style={styles.timelineTask}>{r.task}</Text>
          </View>
        ))}
      </Card>

      {/* Do / Don't */}
      <View style={styles.bento}>
        <View style={[styles.ddCard, { borderColor: colors.green }]}>
          <Text style={[styles.ddTitle, { color: colors.green }]}>✓ DA FARE</Text>
          {s.do.map((d, i) => (
            <Text key={i} style={styles.ddItem}>• {d}</Text>
          ))}
        </View>
      </View>
      <View style={styles.bento}>
        <View style={[styles.ddCard, { borderColor: colors.red }]}>
          <Text style={[styles.ddTitle, { color: colors.red }]}>✕ DA NON FARE</Text>
          {s.dont.map((d, i) => (
            <Text key={i} style={styles.ddItem}>• {d}</Text>
          ))}
        </View>
      </View>

      <ScoreEditor strategy={s} onUpdate={setStrategy} />

      <EaModal
        visible={eaOpen}
        onClose={() => setEaOpen(false)}
        strategy={s}
      />
    </ScrollView>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  highlight,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.iconAction, highlight && { backgroundColor: colors.blue }]}
    >
      <Ionicons name={icon} size={18} color={colors.white} />
      <Text style={styles.iconActionTxt}>{label}</Text>
    </Pressable>
  );
}

function MiniCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <View style={styles.miniCard}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={[styles.miniValue, accent ? { color: accent } : null]}>{value}</Text>
      {sub ? <Text style={styles.miniSub}>{sub}</Text> : null}
    </View>
  );
}

function ScoreEditor({
  strategy,
  onUpdate,
}: {
  strategy: Strategy;
  onUpdate: (s: Strategy) => void;
}) {
  const [val, setVal] = useState(String(strategy.score ?? ""));
  const [saving, setSaving] = useState(false);
  async function save() {
    const score = Math.max(0, Math.min(100, Number(val) || 0));
    setSaving(true);
    try {
      await api.setScore(strategy.id, score);
      onUpdate({ ...strategy, score });
      Alert.alert("Salvato", `Strategy Score impostato a ${score}/100`);
    } catch (e: any) {
      Alert.alert("Errore", e?.message || "Impossibile salvare");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card>
      <SectionLabel>Strategy Score (post-implementazione)</SectionLabel>
      <Text style={styles.scoreHint}>
        Valuta l'efficacia reale della strategia da 0 a 100 dopo averla usata.
      </Text>
      <View style={styles.scoreRow}>
        <TextInput
          style={styles.scoreInput}
          keyboardType="numeric"
          value={val}
          onChangeText={setVal}
          placeholder="0-100"
          placeholderTextColor={colors.muted}
        />
        <Button title="Salva Score" onPress={save} loading={saving} small />
      </View>
    </Card>
  );
}

function EaModal({
  visible,
  onClose,
  strategy,
}: {
  visible: boolean;
  onClose: () => void;
  strategy: Strategy;
}) {
  const defaultType = (strategy.request?.strategy_type as string) || "trend_pullback";
  const defaultSymbol =
    strategy.request?.asset_class === "metals"
      ? "XAUUSD"
      : strategy.request?.asset_class === "indices"
      ? "US30"
      : "EURUSD";
  const [stype, setStype] = useState(defaultType);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [riskPct, setRiskPct] = useState(String(strategy.risk_management.risk_per_trade_pct));
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const code = await api.strategyToEa({
        strategy_id: strategy.id,
        strategy_type: stype,
        symbol,
        risk_pct: Number(riskPct) || 1,
        timeframe: (strategy.request?.timeframe as string) || "H1",
      });
      await saveEaFile(code, `FTMO_${stype}_${symbol}.mq4`);
      onClose();
    } catch (e: any) {
      Alert.alert("Errore", e?.message || "Generazione EA fallita");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>GENERA EXPERT ADVISOR (.mq4)</Text>
          <Text style={styles.modalHint}>
            EA pronto per MetaTrader 4 con gestione rischio FTMO integrata
            (max daily 5%, overall 10%, lot sizing automatico, reset giornaliero).
          </Text>

          <SectionLabel>Tipo di strategia (scegli tu)</SectionLabel>
          <ChipRow options={EA_STRATEGIES} value={stype} onChange={setStype} />

          <SectionLabel>Simbolo</SectionLabel>
          <TextInput
            style={styles.modalInput}
            value={symbol}
            onChangeText={setSymbol}
            autoCapitalize="characters"
            placeholder="EURUSD"
            placeholderTextColor={colors.muted}
          />

          <SectionLabel>Rischio % per trade</SectionLabel>
          <TextInput
            style={styles.modalInput}
            value={riskPct}
            onChangeText={setRiskPct}
            keyboardType="numeric"
            placeholder="1.0"
            placeholderTextColor={colors.muted}
          />

          <View style={{ height: space.md }} />
          <Button title="Scarica EA .mq4" onPress={generate} loading={busy} />
          <Button title="Annulla" variant="secondary" onPress={onClose} style={{ marginTop: space.sm }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },

  heroTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: space.md },
  heroTitle: { ...t.h1, color: colors.white },
  heroSummary: { ...t.body, color: "#D4D4D4", marginTop: space.sm, lineHeight: 21 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.lg },
  heroMeta: { ...t.small, color: "#9CA3AF", marginTop: space.md, fontWeight: "700" },
  iconAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: colors.white,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  iconActionTxt: { color: colors.white, fontSize: 12, fontWeight: "700" },

  bento: { flexDirection: "row", gap: space.md, marginBottom: space.md },
  miniCard: { flex: 1, backgroundColor: colors.white, ...hardBorder, padding: space.md },
  miniLabel: { ...t.label, color: colors.muted, textTransform: "uppercase" },
  miniValue: { fontSize: 22, fontWeight: "900", color: colors.black, marginTop: 4 },
  miniSub: { ...t.small, color: colors.muted, marginTop: 2 },

  monoBox: { backgroundColor: colors.paper, ...hardBorder, padding: space.md },
  mono: { fontFamily: fonts.mono, fontSize: 13, color: colors.black, lineHeight: 19 },
  rmRow: { flexDirection: "row", justifyContent: "space-between", marginTop: space.md },
  rmItem: { ...t.small, color: colors.black },
  bold: { fontWeight: "900" },
  expParams: { ...t.body, color: colors.blue, fontWeight: "800", marginBottom: space.md },
  expNote: { ...t.small, color: colors.muted, marginTop: space.sm, lineHeight: 18 },

  numRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: space.md },
  numBadge: {
    width: 26, height: 26, backgroundColor: colors.black,
    alignItems: "center", justifyContent: "center", marginRight: space.md,
  },
  numTxt: { color: colors.white, fontWeight: "900", fontSize: 13 },
  ruleTxt: { flex: 1, ...t.body, color: colors.ink, lineHeight: 21 },
  bullet: { ...t.body, color: colors.ink, marginBottom: space.sm, lineHeight: 21 },

  timelineRow: { flexDirection: "row", alignItems: "center", marginBottom: space.md },
  timeTxt: { fontFamily: fonts.mono, fontSize: 13, fontWeight: "700", width: 52, color: colors.blue },
  timelineLine: { width: 2, height: 24, backgroundColor: colors.black, marginHorizontal: space.md },
  timelineTask: { flex: 1, ...t.small, color: colors.ink, lineHeight: 19 },

  ddCard: { flex: 1, backgroundColor: colors.white, borderWidth: 2, padding: space.md },
  ddTitle: { fontSize: 14, fontWeight: "900", marginBottom: space.sm, letterSpacing: 0.5 },
  ddItem: { ...t.small, color: colors.ink, marginBottom: 6, lineHeight: 19 },

  scoreHint: { ...t.small, color: colors.muted, marginBottom: space.md },
  scoreRow: { flexDirection: "row", gap: space.md, alignItems: "center" },
  scoreInput: {
    ...hardBorder, flex: 1, paddingHorizontal: space.md, paddingVertical: 10,
    fontSize: 16, fontWeight: "700", color: colors.black, backgroundColor: colors.white,
  },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.paper, borderTopWidth: 3, borderColor: colors.black,
    padding: space.lg, paddingBottom: 36,
  },
  modalHandle: { width: 44, height: 4, backgroundColor: colors.black, alignSelf: "center", marginBottom: space.md },
  modalTitle: { ...t.h2, color: colors.black, marginBottom: space.sm },
  modalHint: { ...t.small, color: colors.muted, marginBottom: space.lg, lineHeight: 18 },
  modalInput: {
    ...hardBorder, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 16,
    fontWeight: "700", color: colors.black, backgroundColor: colors.white, marginBottom: space.md,
  },
});
