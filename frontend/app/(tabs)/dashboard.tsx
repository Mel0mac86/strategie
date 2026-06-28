/**
 * Dashboard Progressi Challenge FTMO.
 * Setup challenge + tracking live di drawdown, limiti e target (Swiss Brutalist).
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { colors, space, fonts, hardBorder, type as t } from "@/theme";
import {
  Card,
  ChipRow,
  SectionLabel,
  Button,
  Stat,
  Badge,
} from "@/components/ui";
import { api, Challenge, ChallengeProgress } from "@/api";

const ACCOUNT_OPTIONS = [
  { label: "$10k", value: "10000" },
  { label: "$25k", value: "25000" },
  { label: "$50k", value: "50000" },
  { label: "$100k", value: "100000" },
  { label: "$200k", value: "200000" },
];

const PHASE_OPTIONS = [
  { label: "Fase 1", value: "phase1" },
  { label: "Fase 2", value: "phase2" },
  { label: "Funded", value: "funded" },
];

function parseNum(s: string): number {
  const n = parseFloat((s || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function money(n: number | undefined): string {
  const v = Number(n || 0);
  return `$${v.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;
}

function pct(n: number | undefined): string {
  return `${Number(n || 0).toFixed(1)}%`;
}

function riskMeta(color: ChallengeProgress["risk_color"]): {
  color: string;
  soft: string;
  label: string;
} {
  if (color === "red")
    return { color: colors.red, soft: colors.redSoft, label: "ALTO RISCHIO" };
  if (color === "yellow")
    return { color: colors.yellow, soft: colors.yellowSoft, label: "MEDIO" };
  return { color: colors.green, soft: colors.greenSoft, label: "BASSO" };
}

type FtmoAlert = { level: "critical" | "warning" | "good"; title: string; body: string };

/** Genera gli alert sulle regole FTMO in base allo stato live della challenge. */
function computeAlerts(p: ChallengeProgress): FtmoAlert[] {
  const out: FtmoAlert[] = [];
  if (p.overall_limit_breached)
    out.push({ level: "critical", title: "⛔ LIMITE TOTALE -10% SUPERATO", body: "Challenge fallita: drawdown massimo complessivo violato." });
  if (p.daily_limit_breached)
    out.push({ level: "critical", title: "⛔ LIMITE GIORNALIERO -5% SUPERATO", body: "Challenge fallita: perdita giornaliera oltre il limite." });

  if (!p.daily_limit_breached && !p.overall_limit_breached) {
    const dailyUsed = p.max_daily_loss > 0 ? p.daily_loss / p.max_daily_loss : 0;
    const overallUsed = p.max_overall_loss > 0 ? p.overall_drawdown / p.max_overall_loss : 0;
    if (dailyUsed >= 0.8)
      out.push({ level: "critical", title: "🚨 Stop per oggi", body: `Hai usato il ${Math.round(dailyUsed * 100)}% del limite giornaliero. Restano ${money(p.remaining_to_daily_limit)}: smetti di tradare.` });
    else if (dailyUsed >= 0.5)
      out.push({ level: "warning", title: "⚠️ Attenzione perdita giornaliera", body: `${Math.round(dailyUsed * 100)}% del limite -5% usato. Riduci il rischio.` });
    if (overallUsed >= 0.8)
      out.push({ level: "critical", title: "🚨 Vicino al limite totale", body: `${Math.round(overallUsed * 100)}% del drawdown massimo. Restano ${money(p.remaining_to_overall_limit)}.` });
    else if (overallUsed >= 0.5)
      out.push({ level: "warning", title: "⚠️ Drawdown complessivo in crescita", body: `${Math.round(overallUsed * 100)}% del limite -10% usato.` });
  }

  if (p.target_reached)
    out.push({ level: "good", title: "🎉 Target raggiunto!", body: "Hai centrato l'obiettivo di profitto: valuta di fermarti e proteggere il risultato." });
  return out;
}

export default function DashboardScreen() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Setup form state
  const [accountSize, setAccountSize] = useState("50000");
  const [phase, setPhase] = useState("phase1");
  const [balance, setBalance] = useState("50000");
  const [label, setLabel] = useState("");
  const [broker, setBroker] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Update balance modal
  const [updateOpen, setUpdateOpen] = useState(false);
  const [newBalance, setNewBalance] = useState("");
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await api.getChallenge();
      setChallenge(data);
      if (data?.active && data.account_size) {
        setAccountSize(String(data.account_size));
        if (data.phase) setPhase(data.phase);
        setBalance(String(data.current_balance ?? data.account_size));
        setLabel(data.label ?? "");
        setBroker(data.broker ?? "");
      }
    } catch (e: any) {
      Alert.alert(
        "Errore di connessione",
        "Impossibile caricare la challenge. Verifica la connessione al server."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(false);
  }, [load]);

  // Quando cambia la dimensione conto nel setup, allinea il saldo se è ancora di default
  const handleAccountSize = (v: string) => {
    setAccountSize(v);
    setBalance((prev) => (prev === accountSize || prev === "" ? v : prev));
  };

  const startTracking = async () => {
    const size = parseNum(accountSize);
    if (size <= 0) {
      Alert.alert("Dato mancante", "Seleziona una dimensione conto valida.");
      return;
    }
    setSubmitting(true);
    try {
      await api.upsertChallenge({
        account_size: size,
        phase,
        current_balance: parseNum(balance) || size,
        daily_start_balance: parseNum(balance) || size,
        label: label.trim() || undefined,
        broker: broker.trim() || undefined,
      });
      await load(true);
    } catch (e: any) {
      Alert.alert("Errore", "Impossibile avviare il tracking. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitUpdateBalance = async () => {
    if (!challenge?.account_size) return;
    const bal = parseNum(newBalance);
    if (bal <= 0) {
      Alert.alert("Dato non valido", "Inserisci un saldo maggiore di zero.");
      return;
    }
    setUpdating(true);
    try {
      await api.upsertChallenge({
        account_size: challenge.account_size,
        phase: challenge.phase,
        current_balance: bal,
        label: challenge.label,
        broker: challenge.broker,
      });
      setUpdateOpen(false);
      setNewBalance("");
      await load(false);
    } catch (e: any) {
      Alert.alert("Errore", "Impossibile aggiornare il saldo. Riprova.");
    } finally {
      setUpdating(false);
    }
  };

  const resetChallenge = () => {
    if (!challenge?.account_size) return;
    Alert.alert(
      "Reset challenge",
      "Vuoi azzerare i progressi riportando il saldo alla dimensione conto?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await api.upsertChallenge({
                account_size: challenge.account_size,
                phase: challenge.phase,
                current_balance: challenge.account_size,
                daily_start_balance: challenge.account_size,
                label: challenge.label,
                broker: challenge.broker,
              });
              await load(true);
            } catch (e: any) {
              Alert.alert("Errore", "Reset non riuscito. Riprova.");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.black} size="large" />
        <Text style={styles.loaderText}>Caricamento…</Text>
      </View>
    );
  }

  const isActive = !!challenge?.active;
  const progress = challenge?.progress;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.black}
          colors={[colors.black]}
        />
      }
    >
      <Text style={styles.title}>PROGRESSI CHALLENGE</Text>
      <Text style={styles.subtitle}>
        {isActive
          ? "Monitora drawdown, limiti FTMO e target in tempo reale."
          : "Configura la tua challenge per avviare il tracking."}
      </Text>

      {!isActive || !progress ? (
        <SetupForm
          accountSize={accountSize}
          onAccountSize={handleAccountSize}
          phase={phase}
          onPhase={setPhase}
          balance={balance}
          onBalance={setBalance}
          label={label}
          onLabel={setLabel}
          broker={broker}
          onBroker={setBroker}
          submitting={submitting}
          onSubmit={startTracking}
        />
      ) : (
        <LiveTracking
          challenge={challenge!}
          progress={progress}
          onOpenUpdate={() => {
            setNewBalance(String(progress.current_balance));
            setUpdateOpen(true);
          }}
          onReset={resetChallenge}
        />
      )}

      <Modal
        visible={updateOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUpdateOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setUpdateOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <SectionLabel>Aggiorna saldo attuale</SectionLabel>
            <TextInput
              style={styles.input}
              value={newBalance}
              onChangeText={setNewBalance}
              keyboardType="numeric"
              placeholder="es. 51200"
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Button
                title="Annulla"
                variant="secondary"
                onPress={() => setUpdateOpen(false)}
                style={styles.modalBtn}
              />
              <View style={{ width: space.md }} />
              <Button
                title="Salva"
                variant="primary"
                loading={updating}
                onPress={submitUpdateBalance}
                style={styles.modalBtn}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function SetupForm(props: {
  accountSize: string;
  onAccountSize: (v: string) => void;
  phase: string;
  onPhase: (v: string) => void;
  balance: string;
  onBalance: (v: string) => void;
  label: string;
  onLabel: (v: string) => void;
  broker: string;
  onBroker: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <SectionLabel>Dimensione conto</SectionLabel>
      <ChipRow
        options={ACCOUNT_OPTIONS}
        value={props.accountSize}
        onChange={props.onAccountSize}
      />

      <View style={styles.block}>
        <SectionLabel>Fase</SectionLabel>
        <ChipRow
          options={PHASE_OPTIONS}
          value={props.phase}
          onChange={props.onPhase}
        />
      </View>

      <View style={styles.block}>
        <SectionLabel>Saldo attuale (USD)</SectionLabel>
        <TextInput
          style={styles.input}
          value={props.balance}
          onChangeText={props.onBalance}
          keyboardType="numeric"
          placeholder={props.accountSize}
          placeholderTextColor={colors.muted}
        />
      </View>

      <View style={styles.block}>
        <SectionLabel>Etichetta (opzionale)</SectionLabel>
        <TextInput
          style={styles.input}
          value={props.label}
          onChangeText={props.onLabel}
          placeholder="es. Challenge Q3"
          placeholderTextColor={colors.muted}
        />
      </View>

      <View style={styles.block}>
        <SectionLabel>Broker (opzionale)</SectionLabel>
        <TextInput
          style={styles.input}
          value={props.broker}
          onChangeText={props.onBroker}
          placeholder="es. FTMO"
          placeholderTextColor={colors.muted}
        />
      </View>

      <View style={styles.block}>
        <Button
          title="Avvia Tracking"
          variant="primary"
          loading={props.submitting}
          onPress={props.onSubmit}
        />
      </View>
    </Card>
  );
}

function LiveTracking(props: {
  challenge: Challenge;
  progress: ChallengeProgress;
  onOpenUpdate: () => void;
  onReset: () => void;
}) {
  const { challenge, progress, onOpenUpdate, onReset } = props;
  const pnlPositive = progress.pnl >= 0;
  const pnlColor = pnlPositive ? colors.green : colors.red;
  const targetPct = Math.max(0, Math.min(100, progress.progress_to_target_pct));
  const risk = riskMeta(progress.risk_color);

  const alerts = computeAlerts(progress);
  const [notifOn, setNotifOn] = useState(false);

  // Notifica web quando compare un nuovo alert critico/positivo (PWA iOS 16.4+).
  const topSig = alerts.length ? `${alerts[0].level}:${alerts[0].title}` : "";
  useEffect(() => {
    if (!notifOn || Platform.OS !== "web" || !topSig) return;
    const top = alerts[0];
    if (top.level === "warning") return; // notifica solo critici e target
    try {
      const N: any = (globalThis as any).Notification;
      if (N && N.permission === "granted") new N(top.title, { body: top.body });
    } catch {
      /* notifiche non supportate */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topSig, notifOn]);

  async function enableNotif() {
    if (Platform.OS !== "web") {
      Alert.alert("Notifiche", "Sul web/PWA: gli avvisi compaiono qui e come notifica del sistema (iPhone: app aggiunta alla Home, iOS 16.4+).");
      return;
    }
    try {
      const N: any = (globalThis as any).Notification;
      if (!N) {
        Alert.alert("Non supportato", "Il browser non supporta le notifiche. Gli alert restano visibili qui nella dashboard.");
        return;
      }
      const perm = N.permission === "granted" ? "granted" : await N.requestPermission();
      if (perm === "granted") {
        setNotifOn(true);
        new N("Notifiche FTMO attive", { body: "Ti avviserò quando ti avvicini ai limiti." });
      } else {
        Alert.alert("Permesso negato", "Attiva le notifiche dalle impostazioni del browser per riceverle.");
      }
    } catch {
      Alert.alert("Errore", "Impossibile attivare le notifiche.");
    }
  }

  return (
    <>
      {alerts.map((al, i) => {
        const bg = al.level === "critical" ? colors.red : al.level === "good" ? colors.green : colors.yellow;
        return (
          <View key={i} style={[styles.alertBanner, { backgroundColor: bg, borderColor: bg }]}>
            <Text style={styles.alertText}>{al.title}</Text>
            <Text style={styles.alertSub}>{al.body}</Text>
          </View>
        );
      })}

      <Pressable onPress={enableNotif} style={styles.notifBtn}>
        <Text style={styles.notifTxt}>
          {notifOn ? "🔔 Notifiche FTMO attive" : "🔔 Attiva avvisi FTMO"}
        </Text>
      </Pressable>

      {/* HERO */}
      <View style={styles.hero}>
        {challenge.label ? (
          <Text style={styles.heroMeta}>
            {challenge.label}
            {challenge.broker ? ` · ${challenge.broker}` : ""}
          </Text>
        ) : null}
        <Text style={styles.heroLabel}>SALDO ATTUALE</Text>
        <Text style={styles.heroBalance}>{money(progress.current_balance)}</Text>
        <View style={styles.heroPnlRow}>
          <Text style={[styles.heroPnl, { color: pnlColor }]}>
            {pnlPositive ? "+" : ""}
            {money(progress.pnl)}
          </Text>
          <Text style={[styles.heroPnlPct, { color: pnlColor }]}>
            ({pnlPositive ? "+" : ""}
            {pct(progress.pnl_pct)})
          </Text>
        </View>
      </View>

      {/* PROGRESS TO TARGET */}
      <Card>
        <View style={styles.rowBetween}>
          <SectionLabel>Verso il target</SectionLabel>
          {progress.target_reached ? (
            <Badge text="TARGET RAGGIUNTO" color={colors.green} />
          ) : null}
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${targetPct}%` }]}
          />
        </View>
        <Text style={styles.progressLabel}>
          {pct(progress.progress_to_target_pct)} verso{" "}
          {money(progress.profit_target)}
        </Text>
      </Card>

      {/* LIMITI AFFIANCATI */}
      <View style={styles.row}>
        <Card style={styles.halfCard}>
          <SectionLabel>Max Daily Loss</SectionLabel>
          <Text style={styles.limitValue}>{money(progress.max_daily_loss)}</Text>
          <View style={styles.limitRow}>
            <Text style={styles.limitMeta}>Perdita oggi</Text>
            <Text style={[styles.limitMetaVal, { color: colors.red }]}>
              {money(progress.daily_loss)} ({pct(progress.daily_loss_pct)})
            </Text>
          </View>
          <View style={styles.limitRow}>
            <Text style={styles.limitMeta}>Rimanente</Text>
            <Text style={[styles.limitMetaVal, { color: colors.green }]}>
              {money(progress.remaining_to_daily_limit)}
            </Text>
          </View>
        </Card>

        <View style={{ width: space.md }} />

        <Card style={styles.halfCard}>
          <SectionLabel>Max Overall Loss</SectionLabel>
          <Text style={styles.limitValue}>
            {money(progress.max_overall_loss)}
          </Text>
          <View style={styles.limitRow}>
            <Text style={styles.limitMeta}>Drawdown</Text>
            <Text style={[styles.limitMetaVal, { color: colors.red }]}>
              {money(progress.overall_drawdown)} (
              {pct(progress.overall_drawdown_pct)})
            </Text>
          </View>
          <View style={styles.limitRow}>
            <Text style={styles.limitMeta}>Rimanente</Text>
            <Text style={[styles.limitMetaVal, { color: colors.green }]}>
              {money(progress.remaining_to_overall_limit)}
            </Text>
          </View>
        </Card>
      </View>

      {/* DRAWDOWN / RISCHIO */}
      <Card
        style={{
          ...styles.riskCard,
          borderColor: risk.color,
          backgroundColor: risk.soft,
        }}
        flat
      >
        <SectionLabel>Drawdown attuale</SectionLabel>
        <Text style={[styles.riskValue, { color: risk.color }]}>
          {pct(progress.overall_drawdown_pct)}
        </Text>
        <View style={[styles.riskBadge, { backgroundColor: risk.color }]}>
          <Text style={styles.riskBadgeText}>{risk.label}</Text>
        </View>
      </Card>

      {/* AZIONI */}
      <View style={styles.actions}>
        <Button
          title="Aggiorna saldo"
          variant="primary"
          onPress={onOpenUpdate}
        />
        <View style={{ height: space.md }} />
        <Button title="Reset challenge" variant="danger" onPress={onReset} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.paper },
  content: { padding: space.lg },
  loader: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  loaderText: { ...t.small, color: colors.muted, marginTop: space.md },
  title: { ...t.h1, color: colors.black, textTransform: "uppercase" },
  subtitle: {
    ...t.small,
    color: colors.muted,
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  block: { marginTop: space.lg },
  input: {
    ...hardBorder,
    backgroundColor: colors.white,
    color: colors.black,
    fontWeight: "700",
    fontSize: 18,
    paddingVertical: 12,
    paddingHorizontal: space.md,
  },

  // Hero
  hero: {
    ...hardBorder,
    backgroundColor: colors.black,
    padding: space.lg,
    marginBottom: space.lg,
  },
  heroMeta: {
    ...t.label,
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: space.xs,
  },
  heroLabel: {
    ...t.label,
    color: colors.muted,
    textTransform: "uppercase",
  },
  heroBalance: {
    fontSize: 44,
    fontWeight: "900",
    color: colors.white,
    fontFamily: fonts.mono,
    letterSpacing: -1.5,
    marginTop: space.xs,
  },
  heroPnlRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: space.sm,
  },
  heroPnl: { fontSize: 22, fontWeight: "900", fontFamily: fonts.mono },
  heroPnlPct: { fontSize: 16, fontWeight: "800", marginLeft: space.sm },

  // Progress
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressTrack: {
    ...hardBorder,
    height: 28,
    backgroundColor: colors.white,
    justifyContent: "center",
    marginTop: space.xs,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.green,
  },
  progressLabel: {
    ...t.small,
    color: colors.black,
    fontWeight: "700",
    marginTop: space.sm,
    fontFamily: fonts.mono,
  },

  // Limiti
  row: { flexDirection: "row" },
  halfCard: { flex: 1 },
  limitValue: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.black,
    fontFamily: fonts.mono,
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  limitRow: { marginTop: space.sm },
  limitMeta: { ...t.label, color: colors.muted, textTransform: "uppercase" },
  limitMetaVal: {
    fontSize: 14,
    fontWeight: "800",
    fontFamily: fonts.mono,
    marginTop: 2,
  },

  // Rischio
  riskCard: {
    borderWidth: 2,
    alignItems: "center",
  },
  riskValue: {
    fontSize: 48,
    fontWeight: "900",
    fontFamily: fonts.mono,
    letterSpacing: -1,
    marginVertical: space.sm,
  },
  riskBadge: {
    paddingVertical: 5,
    paddingHorizontal: space.md,
  },
  riskBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  // Alert
  alertBanner: {
    ...hardBorder,
    borderColor: colors.red,
    backgroundColor: colors.red,
    padding: space.md,
    marginBottom: space.lg,
  },
  alertText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  alertSub: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "600",
    marginTop: space.xs,
  },
  notifBtn: {
    ...hardBorder,
    backgroundColor: colors.white,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: space.lg,
  },
  notifTxt: { ...t.h3, color: colors.black },

  // Azioni
  actions: { marginTop: space.sm, marginBottom: space.xl },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: space.lg,
  },
  modalCard: {
    ...hardBorder,
    backgroundColor: colors.white,
    padding: space.lg,
  },
  modalActions: {
    flexDirection: "row",
    marginTop: space.lg,
  },
  modalBtn: { flex: 1 },
});
