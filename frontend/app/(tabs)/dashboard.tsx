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
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
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
      const data = await api.listChallenges();
      setChallenges(data);
      setSelectedId((prev) => {
        if (prev && data.some((c) => c.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch (e: any) {
      // store locale: in caso di errore mostra lista vuota
      setChallenges([]);
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

  const addAccount = async () => {
    const size = parseNum(accountSize);
    if (size <= 0) {
      Alert.alert("Dato mancante", "Seleziona una dimensione conto valida.");
      return;
    }
    setSubmitting(true);
    try {
      const created: any = await api.addChallenge({
        account_size: size,
        phase,
        current_balance: parseNum(balance) || size,
        daily_start_balance: parseNum(balance) || size,
        label: label.trim() || undefined,
        broker: broker.trim() || undefined,
      });
      setShowSetup(false);
      setLabel("");
      setBroker("");
      if (created?.id) setSelectedId(created.id);
      await load(true);
    } catch (e: any) {
      Alert.alert("Errore", "Impossibile aggiungere il conto. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitUpdateBalance = async () => {
    if (!selectedId) return;
    const bal = parseNum(newBalance);
    if (bal <= 0) {
      Alert.alert("Dato non valido", "Inserisci un saldo maggiore di zero.");
      return;
    }
    setUpdating(true);
    try {
      await api.updateChallengeBalance(selectedId, bal);
      setUpdateOpen(false);
      setNewBalance("");
      await load(false);
    } catch (e: any) {
      Alert.alert("Errore", "Impossibile aggiornare il saldo. Riprova.");
    } finally {
      setUpdating(false);
    }
  };

  const resetSelected = () => {
    const sel = challenges.find((c) => c.id === selectedId);
    if (!sel?.id || !sel.account_size) return;
    Alert.alert("Reset conto", "Riportare il saldo alla dimensione conto?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          try {
            await api.updateChallengeBalance(sel.id!, sel.account_size!, sel.account_size!);
            await load(true);
          } catch {
            Alert.alert("Errore", "Reset non riuscito. Riprova.");
          }
        },
      },
    ]);
  };

  const deleteAccount = (id: string, name: string) => {
    Alert.alert("Elimina conto", `Eliminare "${name}"?`, [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteChallengeById(id);
            await load(true);
          } catch {
            Alert.alert("Errore", "Eliminazione non riuscita.");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.black} size="large" />
        <Text style={styles.loaderText}>Caricamento…</Text>
      </View>
    );
  }

  const selected = challenges.find((c) => c.id === selectedId) || challenges[0] || null;
  const hasAccounts = challenges.length > 0;

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
        {hasAccounts
          ? `${challenges.length} cont${challenges.length === 1 ? "o" : "i"} · tocca un conto per i dettagli.`
          : "Configura la tua challenge per avviare il tracking."}
      </Text>

      {hasAccounts && <SummaryHeader list={challenges} />}

      {hasAccounts && (
        <>
          {challenges.map((c) => (
            <AccountCard
              key={c.id}
              ch={c}
              selected={c.id === selected?.id}
              onPress={() => setSelectedId(c.id!)}
              onDelete={() => deleteAccount(c.id!, c.label || "Conto")}
            />
          ))}
          <Button
            title={showSetup ? "Chiudi" : "+ Aggiungi conto"}
            variant="secondary"
            onPress={() => setShowSetup((s) => !s)}
            style={{ marginBottom: space.lg }}
          />
        </>
      )}

      {(showSetup || !hasAccounts) && (
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
          onSubmit={addAccount}
        />
      )}

      {hasAccounts && selected?.progress && (
        <LiveTracking
          challenge={selected}
          progress={selected.progress}
          onOpenUpdate={() => {
            setNewBalance(String(selected.progress!.current_balance));
            setUpdateOpen(true);
          }}
          onReset={resetSelected}
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
          title="Aggiungi conto"
          variant="primary"
          loading={props.submitting}
          onPress={props.onSubmit}
        />
      </View>
    </Card>
  );
}

function SummaryHeader({ list }: { list: Challenge[] }) {
  const accts = list.filter((c) => c.progress);
  if (accts.length < 1) return null;
  const cap = accts.reduce((s, c) => s + (c.account_size || 0), 0);
  const eq = accts.reduce((s, c) => s + (c.progress!.current_balance || 0), 0);
  const pnl = eq - cap;
  const pnlPct = cap ? (pnl / cap) * 100 : 0;
  const near = accts.filter(
    (c) => c.progress!.risk_color === "red" || computeAlerts(c.progress!).some((a) => a.level === "critical")
  ).length;
  const target = accts.filter((c) => c.progress!.target_reached).length;
  const pnlColor = pnl >= 0 ? colors.green : colors.red;
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryLabel}>RIEPILOGO · {accts.length} CONTI</Text>
      <Text style={styles.summaryEquity}>{money(eq)}</Text>
      <Text style={[styles.summaryPnl, { color: pnlColor }]}>
        {pnl >= 0 ? "+" : ""}{money(pnl)} ({pnl >= 0 ? "+" : ""}{pct(pnlPct)})
      </Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryStat}>
          <Text style={[styles.summaryStatVal, { color: near > 0 ? colors.red : colors.green }]}>{near}</Text>
          <Text style={styles.summaryStatLbl}>VICINI AI LIMITI</Text>
        </View>
        <View style={styles.summaryStat}>
          <Text style={[styles.summaryStatVal, { color: colors.green }]}>{target}</Text>
          <Text style={styles.summaryStatLbl}>TARGET RAGGIUNTI</Text>
        </View>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryStatVal}>{money(cap)}</Text>
          <Text style={styles.summaryStatLbl}>CAPITALE TOT.</Text>
        </View>
      </View>
    </View>
  );
}

function AccountCard(props: {
  ch: Challenge;
  selected: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { ch, selected, onPress, onDelete } = props;
  const p = ch.progress;
  if (!p) return null;
  const risk = riskMeta(p.risk_color);
  const alerts = computeAlerts(p);
  const critical = alerts.some((a) => a.level === "critical");
  const warning = alerts.some((a) => a.level === "warning");
  const targetPct = Math.max(0, Math.min(100, p.progress_to_target_pct));
  return (
    <Pressable
      onPress={onPress}
      style={[styles.acctCard, selected && { borderColor: colors.blue, borderWidth: 3 }]}
    >
      <View style={styles.acctTop}>
        <View style={[styles.riskDot, { backgroundColor: risk.color }]} />
        <Text style={styles.acctLabel} numberOfLines={1}>
          {ch.label || "Conto"}{ch.broker ? ` · ${ch.broker}` : ""}
        </Text>
        {(critical || warning) && (
          <View style={[styles.acctAlert, { backgroundColor: critical ? colors.red : colors.yellow }]}>
            <Text style={styles.acctAlertTxt}>!</Text>
          </View>
        )}
        <Pressable hitSlop={8} onPress={onDelete} style={{ paddingHorizontal: 6 }}>
          <Text style={{ color: colors.red, fontWeight: "900" }}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.acctRow}>
        <Text style={styles.acctBalance}>{money(p.current_balance)}</Text>
        <Text style={[styles.acctPnl, { color: p.pnl >= 0 ? colors.green : colors.red }]}>
          {p.pnl >= 0 ? "+" : ""}{pct(p.pnl_pct)}
        </Text>
      </View>
      <View style={styles.acctBarTrack}>
        <View style={[styles.acctBarFill, { width: `${targetPct}%` }]} />
      </View>
      <Text style={styles.acctMeta}>
        Target {pct(p.progress_to_target_pct)} · DD {pct(p.overall_drawdown_pct)} · {String(ch.phase).replace("phase", "Fase ")}
      </Text>
    </Pressable>
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
  acctCard: { ...hardBorder, backgroundColor: colors.white, padding: space.md, marginBottom: space.md },
  acctTop: { flexDirection: "row", alignItems: "center", marginBottom: space.sm },
  riskDot: { width: 12, height: 12, borderRadius: 6, marginRight: space.sm },
  acctLabel: { flex: 1, ...t.h3, color: colors.black },
  acctAlert: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: space.sm },
  acctAlertTxt: { color: colors.white, fontWeight: "900", fontSize: 13 },
  acctRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  acctBalance: { fontSize: 22, fontWeight: "900", color: colors.black, fontFamily: fonts.mono },
  acctPnl: { fontSize: 16, fontWeight: "900" },
  acctBarTrack: { height: 8, ...hardBorder, backgroundColor: colors.paper, marginTop: space.sm },
  acctBarFill: { height: "100%", backgroundColor: colors.green },
  acctMeta: { ...t.label, color: colors.muted, marginTop: 6 },
  summary: { ...hardBorder, backgroundColor: colors.black, padding: space.lg, marginBottom: space.lg },
  summaryLabel: { ...t.label, color: "#9CA3AF" },
  summaryEquity: { fontSize: 30, fontWeight: "900", color: colors.white, fontFamily: fonts.mono, marginTop: 4 },
  summaryPnl: { fontSize: 16, fontWeight: "900", marginTop: 2 },
  summaryRow: { flexDirection: "row", marginTop: space.md, borderTopWidth: 1, borderTopColor: "#333", paddingTop: space.md },
  summaryStat: { flex: 1 },
  summaryStatVal: { fontSize: 18, fontWeight: "900", color: colors.white },
  summaryStatLbl: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5, color: "#9CA3AF", marginTop: 2 },

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
