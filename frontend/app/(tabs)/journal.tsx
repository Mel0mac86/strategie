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
import { api, Trade, TradeStats } from "@/api";
import { Button, ChipRow, SectionLabel, Stat, Badge } from "@/components/ui";
import { colors, space, fonts, hardBorder, type as t } from "@/theme";

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

  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

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
        <Button title="+ Nuovo Trade" onPress={openModal} small />
      </View>

      {renderStats()}

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
