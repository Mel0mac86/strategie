import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TextInput,
  Modal,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { api, Trade, TradeStats } from "@/api";
import { Button, ChipRow, SectionLabel, Stat, Badge } from "@/components/ui";
import { colors, space, fonts, hardBorder, type as t } from "@/theme";
import { parseMt4Trades } from "@/utils/mt4Import";
import { EquityChart } from "@/components/EquityChart";

const DIRECTIONS = [
  { label: "Long", value: "long" },
  { label: "Short", value: "short" },
];

function fmtUsd(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function pnlColor(n: number): string {
  if (n > 0) return colors.green;
  if (n < 0) return colors.red;
  return colors.ink;
}

function parseNum(s: string): number {
  const v = parseFloat((s || "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}

export default function JournalScreen() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdv, setShowAdv] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Import MT4
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState("");
  const [importing, setImporting] = useState(false);

  // form
  const [asset, setAsset] = useState("");
  const [direction, setDirection] = useState("long");
  const [entry, setEntry] = useState("");
  const [exit, setExit] = useState("");
  const [pnl, setPnl] = useState("");
  const [rMultiple, setRMultiple] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const [tr, st] = await Promise.all([api.listTrades(), api.tradeStats()]);
      setTrades(tr);
      setStats(st);
    } catch (e: any) {
      Alert.alert(
        "Errore di caricamento",
        "Impossibile contattare il server. Verifica che il backend sia attivo.\n\n" +
          (e?.message ?? "")
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const resetForm = () => {
    setAsset("");
    setDirection("long");
    setEntry("");
    setExit("");
    setPnl("");
    setRMultiple("");
    setNotes("");
  };

  const pickImportFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/html", "text/csv", "text/plain", "application/vnd.ms-excel", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      let text = "";
      if (Platform.OS === "web") {
        text = await (await fetch(a.uri)).text();
      } else {
        text = await FileSystem.readAsStringAsync(a.uri);
      }
      setImportText(text);
      setImportFile(a.name || "file");
    } catch (e: any) {
      Alert.alert("Errore", e?.message || "Impossibile leggere il file.");
    }
  };

  const doImport = async () => {
    const parsed = parseMt4Trades(importText);
    if (!parsed.length) {
      Alert.alert(
        "Nessun trade trovato",
        "Carica/incolla lo statement MT4 (Cronologia conto → Salva come Report dettagliato) o un CSV con colonne symbol/type/price/profit."
      );
      return;
    }
    setImporting(true);
    try {
      for (const tr of parsed) {
        await api.createTrade(tr);
      }
      setImportOpen(false);
      setImportText("");
      setImportFile("");
      await load();
      Alert.alert("Import completato", `${parsed.length} trade importati nel journal.`);
    } catch (e: any) {
      Alert.alert("Errore", e?.message || "Import non riuscito.");
    } finally {
      setImporting(false);
    }
  };

  const openModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalVisible(false);
  };

  const onSave = async () => {
    if (!asset.trim()) {
      Alert.alert("Asset mancante", "Inserisci il nome dell'asset.");
      return;
    }
    setSaving(true);
    try {
      await api.createTrade({
        asset: asset.trim(),
        direction,
        entry: parseNum(entry),
        exit: exit.trim() === "" ? null : parseNum(exit),
        pnl: parseNum(pnl),
        r_multiple: parseNum(rMultiple),
        notes: notes.trim(),
      });
      setModalVisible(false);
      resetForm();
      await load();
    } catch (e: any) {
      Alert.alert(
        "Errore di salvataggio",
        "Impossibile salvare il trade.\n\n" + (e?.message ?? "")
      );
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (trade: Trade) => {
    Alert.alert(
      "Elimina trade",
      `Vuoi eliminare il trade ${trade.asset}?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteTrade(trade.id);
              await load();
            } catch (e: any) {
              Alert.alert(
                "Errore",
                "Impossibile eliminare il trade.\n\n" + (e?.message ?? "")
              );
            }
          },
        },
      ]
    );
  };

  const renderStats = () => {
    const s = stats;
    return (
      <View style={styles.statsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsStrip}
        >
          <Stat label="Trade" value={String(s?.total_trades ?? 0)} />
          <View style={styles.statSep} />
          <Stat
            label="Win rate"
            value={`${(s?.win_rate ?? 0).toFixed(0)}%`}
          />
          <View style={styles.statSep} />
          <Stat
            label="P&L"
            value={fmtUsd(s?.total_pnl ?? 0)}
            accent={pnlColor(s?.total_pnl ?? 0)}
          />
          <View style={styles.statSep} />
          <Stat label="Avg R" value={(s?.avg_r ?? 0).toFixed(2)} />
          <View style={styles.statSep} />
          <Stat
            label="Profit factor"
            value={(s?.profit_factor ?? 0).toFixed(2)}
          />
        </ScrollView>
      </View>
    );
  };

  const renderItem = ({ item }: { item: Trade }) => {
    const isLong = (item.direction || "").toLowerCase() === "long";
    return (
      <View style={styles.row}>
        <View style={styles.rowMain}>
          <View style={styles.rowHeader}>
            <Text style={styles.asset}>{item.asset}</Text>
            <Badge
              text={isLong ? "LONG" : "SHORT"}
              color={isLong ? colors.green : colors.red}
            />
          </View>

          <Text style={styles.prices}>
            {item.entry}
            <Text style={styles.arrow}>{"  →  "}</Text>
            {item.exit ?? "—"}
          </Text>

          <View style={styles.metricsRow}>
            <Text style={[styles.pnl, { color: pnlColor(item.pnl) }]}>
              {fmtUsd(item.pnl)}
            </Text>
            <Text style={styles.rMult}>{item.r_multiple.toFixed(2)} R</Text>
          </View>

          {item.notes ? (
            <Text style={styles.notes} numberOfLines={3}>
              {item.notes}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => onDelete(item)}
          hitSlop={10}
          style={styles.deleteBtn}
        >
          <Ionicons name="trash-outline" size={22} color={colors.red} />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.title}>JOURNAL</Text>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title="Importa MT4" variant="secondary" onPress={() => setImportOpen(true)} small />
          <Button title="+ Nuovo" onPress={openModal} small />
        </View>
      </View>

      {renderStats()}

      {trades.length > 0 && (
        <View style={styles.advWrap}>
          <Pressable onPress={() => setShowAdv((s) => !s)} style={styles.advToggle}>
            <Text style={styles.advToggleTxt}>
              {showAdv ? "▲ Nascondi statistiche avanzate" : "▼ Statistiche avanzate"}
            </Text>
          </Pressable>
          {showAdv && <AdvancedStats trades={trades} />}
        </View>
      )}

      <FlatList
        data={trades}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.black}
            colors={[colors.black]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nessun trade registrato.</Text>
            <Text style={styles.emptySub}>
              Tocca "+ Nuovo Trade" per iniziare.
            </Text>
          </View>
        }
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.backdrop}
        >
          <Pressable style={styles.backdropFill} onPress={closeModal} />
          <View style={styles.sheet}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.sheetTitle}>NUOVO TRADE</Text>

              <SectionLabel>Asset</SectionLabel>
              <TextInput
                style={styles.input}
                value={asset}
                onChangeText={setAsset}
                placeholder="es. EUR/USD"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
              />

              <SectionLabel>Direzione</SectionLabel>
              <ChipRow
                options={DIRECTIONS}
                value={direction}
                onChange={setDirection}
              />

              <View style={styles.formRow}>
                <View style={styles.formCol}>
                  <SectionLabel>Entry</SectionLabel>
                  <TextInput
                    style={styles.input}
                    value={entry}
                    onChangeText={setEntry}
                    placeholder="0.00"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formColSpacer} />
                <View style={styles.formCol}>
                  <SectionLabel>Exit</SectionLabel>
                  <TextInput
                    style={styles.input}
                    value={exit}
                    onChangeText={setExit}
                    placeholder="0.00"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formCol}>
                  <SectionLabel>P&L (USD)</SectionLabel>
                  <TextInput
                    style={styles.input}
                    value={pnl}
                    onChangeText={setPnl}
                    placeholder="0.00"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formColSpacer} />
                <View style={styles.formCol}>
                  <SectionLabel>R-Multiple</SectionLabel>
                  <TextInput
                    style={styles.input}
                    value={rMultiple}
                    onChangeText={setRMultiple}
                    placeholder="0.00"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <SectionLabel>Note</SectionLabel>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Setup, emozioni, errori..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <View style={styles.sheetActions}>
                <View style={styles.actionCol}>
                  <Button
                    title="Annulla"
                    variant="secondary"
                    onPress={closeModal}
                  />
                </View>
                <View style={styles.actionColSpacer} />
                <View style={styles.actionCol}>
                  <Button
                    title="Salva"
                    variant="success"
                    onPress={onSave}
                    loading={saving}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={importOpen} transparent animationType="slide" onRequestClose={() => setImportOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setImportOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>IMPORTA TRADE DA MT4</Text>
            <Text style={styles.importHint}>
              In MT4: scheda Cronologia conto → click destro → "Salva come Report dettagliato"
              (HTML), poi carica il file qui. Funziona anche con un CSV (symbol, type, price,
              profit…).
            </Text>
            <Button title="📂 Carica file (HTML/CSV)" variant="secondary" onPress={pickImportFile} />
            {importFile ? <Text style={styles.importFile}>✓ {importFile}</Text> : null}
            <View style={{ height: space.sm }} />
            <SectionLabel>…oppure incolla qui</SectionLabel>
            <TextInput
              style={styles.importInput}
              value={importText}
              onChangeText={(v) => { setImportText(v); if (importFile) setImportFile(""); }}
              multiline
              placeholder="Incolla lo statement MT4 o il CSV dei trade chiusi"
              placeholderTextColor={colors.muted}
            />
            <View style={{ height: space.md }} />
            <Button
              title={importing ? "Importazione..." : "Importa nel journal"}
              variant="success"
              onPress={doImport}
              loading={importing}
            />
            <Button title="Annulla" variant="secondary" onPress={() => setImportOpen(false)} style={{ marginTop: space.sm }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function AdvancedStats({ trades }: { trades: Trade[] }) {
  const DAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  // Equity curve dei trade reali (P&L cumulato in ordine cronologico)
  const chrono = [...trades].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  let cum = 0;
  const equity = [0, ...chrono.map((t) => (cum += Number(t.pnl) || 0))];

  // Per asset
  const byAsset: Record<string, { n: number; w: number; pnl: number; r: number }> = {};
  for (const t of trades) {
    const k = t.asset || "?";
    byAsset[k] = byAsset[k] || { n: 0, w: 0, pnl: 0, r: 0 };
    byAsset[k].n++;
    if (Number(t.pnl) > 0) byAsset[k].w++;
    byAsset[k].pnl += Number(t.pnl) || 0;
    byAsset[k].r += Number(t.r_multiple) || 0;
  }
  const assets = Object.entries(byAsset).sort((a, b) => b[1].pnl - a[1].pnl);

  // Per giorno della settimana
  const byDay: { n: number; w: number; pnl: number }[] = DAYS.map(() => ({ n: 0, w: 0, pnl: 0 }));
  for (const t of trades) {
    const d = new Date(t.created_at).getDay();
    if (d >= 0 && d < 7) {
      byDay[d].n++;
      if (Number(t.pnl) > 0) byDay[d].w++;
      byDay[d].pnl += Number(t.pnl) || 0;
    }
  }

  const money = (n: number) => `${n >= 0 ? "+" : ""}$${Math.round(n)}`;
  return (
    <View>
      <View style={styles.advCard}>
        <SectionLabel>Equity curve (trade reali)</SectionLabel>
        <EquityChart data={equity} initial={0} />
      </View>

      <View style={styles.advCard}>
        <SectionLabel>Per asset</SectionLabel>
        {assets.map(([k, v]) => (
          <View key={k} style={styles.advRow}>
            <Text style={styles.advName}>{k}</Text>
            <Text style={styles.advMetric}>{v.n} trade</Text>
            <Text style={styles.advMetric}>{Math.round((v.w / v.n) * 100)}% WR</Text>
            <Text style={[styles.advMetric, styles.advBold, { color: v.pnl >= 0 ? colors.green : colors.red }]}>
              {money(v.pnl)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.advCard}>
        <SectionLabel>Per giorno della settimana</SectionLabel>
        {byDay.map((v, i) =>
          v.n > 0 ? (
            <View key={i} style={styles.advRow}>
              <Text style={styles.advName}>{DAYS[i]}</Text>
              <Text style={styles.advMetric}>{v.n} trade</Text>
              <Text style={styles.advMetric}>{Math.round((v.w / v.n) * 100)}% WR</Text>
              <Text style={[styles.advMetric, styles.advBold, { color: v.pnl >= 0 ? colors.green : colors.red }]}>
                {money(v.pnl)}
              </Text>
            </View>
          ) : null
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  title: {
    ...t.h1,
    color: colors.black,
  },
  statsWrap: {
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.black,
    backgroundColor: colors.white,
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
  },
  statSep: {
    width: 2,
    alignSelf: "stretch",
    backgroundColor: colors.line,
    marginVertical: 2,
  },
  listContent: {
    padding: space.lg,
    paddingBottom: space.xxl,
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    backgroundColor: colors.white,
    ...hardBorder,
    padding: space.md,
    marginBottom: space.md,
  },
  rowMain: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space.xs,
  },
  asset: {
    ...t.h3,
    color: colors.black,
    marginRight: space.sm,
  },
  prices: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.ink,
    marginBottom: space.xs,
  },
  arrow: {
    color: colors.muted,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pnl: {
    ...t.h3,
    fontFamily: fonts.mono,
    marginRight: space.md,
  },
  rMult: {
    ...t.small,
    fontFamily: fonts.mono,
    color: colors.muted,
    fontWeight: "700",
  },
  notes: {
    ...t.small,
    color: colors.muted,
    marginTop: space.sm,
  },
  deleteBtn: {
    paddingLeft: space.md,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: space.xxl,
  },
  emptyText: {
    ...t.h3,
    color: colors.black,
  },
  emptySub: {
    ...t.small,
    color: colors.muted,
    marginTop: space.xs,
  },
  // modal
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopWidth: 3,
    borderColor: colors.black,
    padding: space.lg,
    maxHeight: "88%",
  },
  sheetTitle: {
    ...t.h2,
    color: colors.black,
    marginBottom: space.lg,
  },
  handle: { width: 44, height: 4, backgroundColor: colors.black, alignSelf: "center", marginBottom: space.md },
  advWrap: { paddingHorizontal: space.lg },
  advToggle: { paddingVertical: space.sm },
  advToggleTxt: { ...t.h3, color: colors.blue },
  advCard: { ...hardBorder, backgroundColor: colors.white, padding: space.md, marginBottom: space.md },
  advRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 6 },
  advName: { flex: 1.3, ...t.small, color: colors.black, fontWeight: "800" },
  advMetric: { flex: 1, textAlign: "right", ...t.small, color: colors.ink },
  advBold: { fontWeight: "900" },
  modalTitle: { ...t.h2, color: colors.black, marginBottom: space.sm },
  importHint: { ...t.small, color: colors.muted, marginBottom: space.md, lineHeight: 18 },
  importFile: { ...t.small, color: colors.green, fontWeight: "700", marginTop: space.sm },
  importInput: {
    ...hardBorder, backgroundColor: colors.white, color: colors.black, height: 120,
    textAlignVertical: "top", padding: space.md, fontFamily: fonts.mono, fontSize: 12,
  },
  input: {
    ...hardBorder,
    backgroundColor: colors.white,
    color: colors.black,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 15,
    marginBottom: space.md,
  },
  inputMultiline: {
    minHeight: 90,
    paddingTop: space.sm,
  },
  formRow: {
    flexDirection: "row",
  },
  formCol: {
    flex: 1,
  },
  formColSpacer: {
    width: space.md,
  },
  sheetActions: {
    flexDirection: "row",
    marginTop: space.sm,
  },
  actionCol: {
    flex: 1,
  },
  actionColSpacer: {
    width: space.md,
  },
});
