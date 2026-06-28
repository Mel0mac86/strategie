import React, { useCallback, useState } from "react";
import { ScrollView, Text, View, StyleSheet, TextInput, Alert, Platform, Pressable } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Badge, Button, Card, ChipRow, SectionLabel, Stat } from "@/components/ui";
import { EquityChart } from "@/components/EquityChart";
import { colors, fonts, hardBorder, space, type as t } from "@/theme";
import { TIMEFRAMES, generateBars, parseCsv, Bar } from "@/backtest/data";
import { runBacktest, BacktestResult } from "@/backtest/engine";
import { optimize, OptOutcome, OptItem } from "@/backtest/optimizer";
import { storage } from "@/utils/storage";

const SAVED_KEY = "store:backtests";
type SavedBacktest = {
  id: string;
  date: string;
  strategyType: string;
  timeframe: string;
  asset: string;
  source: string;
  netPnlPct: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct: number;
  trades: number;
  ftmoPassed: boolean;
};

const STRATEGIES = [
  { label: "Trend + Pullback", value: "trend_pullback" },
  { label: "Breakout Sessione", value: "session_breakout" },
  { label: "XAU Scalper", value: "xau_scalper" },
  { label: "Mean Reversion", value: "mean_reversion" },
];
const ASSETS = [
  { label: "Forex", value: "forex" },
  { label: "Indici", value: "indices" },
  { label: "Metalli", value: "metals" },
  { label: "Crypto", value: "crypto" },
];
const SIZES = [
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

export default function BacktestScreen() {
  const params = useLocalSearchParams<{
    strategy_type?: string;
    asset_class?: string;
    account_size?: string;
    timeframe?: string;
    risk_pct?: string;
  }>();

  const [strategyType, setStrategyType] = useState(params.strategy_type || "trend_pullback");
  const [asset, setAsset] = useState(params.asset_class || "forex");
  const [timeframe, setTimeframe] = useState(params.timeframe || "H1");
  const [accountSize, setAccountSize] = useState(params.account_size || "50000");
  const [phase, setPhase] = useState("phase1");
  const [riskPct, setRiskPct] = useState(params.risk_pct || "1");
  const [rr, setRr] = useState("2");
  const [slMult, setSlMult] = useState("1.5");
  const [cost, setCost] = useState("5");
  const [sizing, setSizing] = useState<"fixed" | "martingale" | "antimartingale">("fixed");
  const [sizeMult, setSizeMult] = useState("2");
  const [source, setSource] = useState<"sim" | "csv">("sim");
  const [bars, setBars] = useState("1500");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [optResult, setOptResult] = useState<OptOutcome | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [saved, setSaved] = useState<SavedBacktest[]>([]);

  const loadSaved = useCallback(async () => {
    setSaved((await storage.get<SavedBacktest[]>(SAVED_KEY)) || []);
  }, []);
  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved])
  );

  async function saveResult() {
    if (!result) return;
    const entry: SavedBacktest = {
      id: Date.now().toString(36),
      date: new Date().toISOString(),
      strategyType,
      timeframe,
      asset,
      source: source === "csv" ? "CSV" : "Simulato",
      netPnlPct: result.netPnlPct,
      winRate: result.winRate,
      profitFactor: result.profitFactor,
      maxDrawdownPct: result.maxDrawdownPct,
      trades: result.trades,
      ftmoPassed: result.ftmoPassed,
    };
    const next = [entry, ...saved].slice(0, 50);
    setSaved(next);
    await storage.set(SAVED_KEY, next);
    Alert.alert("Salvato", "Risultato aggiunto allo storico backtest.");
  }

  async function deleteSaved(id: string) {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    await storage.set(SAVED_KEY, next);
  }

  async function pickFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      let text = "";
      if (Platform.OS === "web") {
        const r = await fetch(asset.uri);
        text = await r.text();
      } else {
        text = await FileSystem.readAsStringAsync(asset.uri);
      }
      const parsed = parseCsv(text);
      if (parsed.length < 60) {
        Alert.alert(
          "File non valido",
          `"${asset.name}" contiene solo ${parsed.length} barre riconosciute. Servono almeno ~250 barre OHLC.`
        );
        return;
      }
      setCsv(text);
      setSource("csv");
      setFileName(asset.name || "file.csv");
      Alert.alert("File caricato", `${asset.name}: ${parsed.length} barre riconosciute.`);
    } catch (e: any) {
      Alert.alert("Errore", e?.message || "Impossibile leggere il file.");
    }
  }

  // Carica i dati (CSV o simulati); ritorna null se insufficienti.
  function loadData(): Bar[] | null {
    if (source === "csv") {
      const data = parseCsv(csv);
      if (data.length < 60) {
        Alert.alert(
          "Dati insufficienti",
          "Carica/incolla almeno ~250 barre OHLC (CSV da MT4/TradingView) per un backtest affidabile."
        );
        return null;
      }
      return data;
    }
    const count = Math.max(300, Math.min(20000, Number(bars) || 1500));
    return generateBars(asset, timeframe, count);
  }

  function baseParams() {
    return {
      accountSize: Number(accountSize),
      phase,
      riskPct: Number(riskPct) || 1,
      maxDailyTrades: 5,
      costPctOfRisk: Number(cost) || 0,
      sizing,
      sizingMult: Number(sizeMult) || 2,
      sizingMaxSteps: 3,
    };
  }

  function run() {
    setRunning(true);
    setResult(null);
    setOptResult(null);
    setTimeout(() => {
      try {
        const data = loadData();
        if (!data) return;
        const res = runBacktest(data, {
          ...baseParams(),
          strategyType,
          rr: Number(rr) || 2,
          slAtrMult: Number(slMult) || 1.5,
        });
        setResult(res);
      } catch (e: any) {
        Alert.alert("Errore", e?.message || "Backtest fallito");
      } finally {
        setRunning(false);
      }
    }, 30);
  }

  function runOptimize() {
    setOptimizing(true);
    setOptResult(null);
    setResult(null);
    setTimeout(() => {
      try {
        const data = loadData();
        if (!data) return;
        const out = optimize(data, baseParams(), {
          strategies: ["trend_pullback", "session_breakout", "xau_scalper", "mean_reversion"],
        });
        setOptResult(out);
      } catch (e: any) {
        Alert.alert("Errore", e?.message || "Ottimizzazione fallita");
      } finally {
        setOptimizing(false);
      }
    }, 30);
  }

  // Applica una configurazione ottimizzata al form ed esegue il backtest completo.
  function applyConfig(item: OptItem) {
    setStrategyType(item.config.strategyType);
    setRr(String(item.config.rr));
    setSlMult(String(item.config.slAtrMult));
    setOptResult(null);
    setTimeout(() => {
      try {
        const data = loadData();
        if (!data) return;
        setResult(
          runBacktest(data, {
            ...baseParams(),
            strategyType: item.config.strategyType,
            rr: item.config.rr,
            slAtrMult: item.config.slAtrMult,
          })
        );
      } catch {
        /* ignore */
      }
    }, 30);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.hero}>BACKTEST</Text>
      <Text style={styles.heroSub}>
        Testa la strategia su uno storico e verifica l'esito secondo le regole FTMO.
      </Text>

      <Card>
        <SectionLabel>Strategia</SectionLabel>
        <ChipRow options={STRATEGIES} value={strategyType} onChange={setStrategyType} />
        <SectionLabel>Timeframe</SectionLabel>
        <ChipRow
          options={TIMEFRAMES.map((t) => ({ label: t.label, value: t.value }))}
          value={timeframe}
          onChange={setTimeframe}
        />
        <SectionLabel>Asset</SectionLabel>
        <ChipRow options={ASSETS} value={asset} onChange={setAsset} />
        <SectionLabel>Dimensione conto</SectionLabel>
        <ChipRow options={SIZES} value={accountSize} onChange={setAccountSize} />
        <SectionLabel>Fase</SectionLabel>
        <ChipRow options={PHASES} value={phase} onChange={setPhase} />

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <SectionLabel>Rischio %</SectionLabel>
            <TextInput style={styles.input} value={riskPct} onChangeText={setRiskPct} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <SectionLabel>Risk:Reward</SectionLabel>
            <TextInput style={styles.input} value={rr} onChangeText={setRr} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <SectionLabel>SL × ATR</SectionLabel>
            <TextInput style={styles.input} value={slMult} onChangeText={setSlMult} keyboardType="numeric" />
          </View>
        </View>

        <SectionLabel>Costi per trade (% del rischio)</SectionLabel>
        <TextInput style={styles.input} value={cost} onChangeText={setCost} keyboardType="numeric" />
        <Text style={styles.hint}>
          Approssima spread + commissioni sottratti a ogni trade (es. 5% = 0,05R di costo per
          operazione). Penalizza correttamente le strategie con molti trade.
        </Text>

        <SectionLabel>Gestione size</SectionLabel>
        <ChipRow
          options={[
            { label: "Fisso", value: "fixed" },
            { label: "Martingala", value: "martingale" },
            { label: "Antimartingala", value: "antimartingale" },
          ]}
          value={sizing}
          onChange={(v) => setSizing(v as typeof sizing)}
        />
        {sizing !== "fixed" && (
          <>
            <SectionLabel>Moltiplicatore</SectionLabel>
            <TextInput style={styles.input} value={sizeMult} onChangeText={setSizeMult} keyboardType="numeric" />
          </>
        )}
        {sizing === "martingale" && (
          <Text style={styles.warn}>
            ⚠️ Martingala: raddoppia la size dopo ogni perdita per recuperare. Aumenta molto il
            drawdown e può violare i limiti FTMO in pochi trade. Sconsigliata in challenge.
          </Text>
        )}
        {sizing === "antimartingale" && (
          <Text style={styles.hint}>
            Antimartingala: aumenta la size dopo le vincite (cavalca le serie positive) e torna
            alla base dopo una perdita. Più prudente della martingala.
          </Text>
        )}
      </Card>

      <Card>
        <SectionLabel>Sorgente dati</SectionLabel>
        <ChipRow
          options={[
            { label: "Dati simulati", value: "sim" },
            { label: "Importa CSV", value: "csv" },
          ]}
          value={source}
          onChange={(v) => setSource(v as "sim" | "csv")}
        />
        {source === "sim" ? (
          <>
            <SectionLabel>Numero di barre</SectionLabel>
            <TextInput style={styles.input} value={bars} onChangeText={setBars} keyboardType="numeric" />
            <Text style={styles.hint}>
              I dati simulati servono per una prova rapida del comportamento della strategia, non
              rappresentano il mercato reale. Per risultati reali usa "Importa CSV".
            </Text>
          </>
        ) : (
          <>
            <Button title="📂 Carica file .csv" variant="secondary" onPress={pickFile} />
            {fileName ? (
              <Text style={styles.fileName}>✓ {fileName} caricato</Text>
            ) : null}
            <View style={{ height: space.md }} />
            <SectionLabel>…oppure incolla il CSV OHLC</SectionLabel>
            <TextInput
              style={[styles.input, styles.csvInput]}
              value={csv}
              onChangeText={(v) => {
                setCsv(v);
                if (fileName) setFileName("");
              }}
              multiline
              placeholder={"AAAA.MM.GG,HH:MM,open,high,low,close,volume\noppure: date,open,high,low,close"}
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.hint}>
              Carica un file .csv (su iPhone dall'app File) oppure incollalo. In MT4: Strumenti →
              Centro Storia → Esporta; va bene anche un CSV da TradingView. Riconosce header o
              formato MT4; accetta anche una sola colonna di prezzi di chiusura.
            </Text>
          </>
        )}
      </Card>

      <Button
        title={running ? "Esecuzione..." : "Esegui Backtest"}
        onPress={run}
        loading={running}
      />
      <Button
        title={optimizing ? "Ottimizzazione..." : "🎯 Ottimizza (trova la migliore)"}
        variant="success"
        onPress={runOptimize}
        loading={optimizing}
        style={{ marginTop: space.sm }}
      />
      <Text style={styles.optHint}>
        Cerca la combinazione migliore di strategia + RR + stop su una parte dei dati e la valida
        sui dati NON visti (out-of-sample): i numeri mostrati sono quelli realistici.
      </Text>

      {optResult && <OptResults out={optResult} onApply={applyConfig} />}

      {result && <Results res={result} accountSize={Number(accountSize)} />}
      {result && (
        <Button
          title="💾 Salva risultato nello storico"
          variant="secondary"
          onPress={saveResult}
          style={{ marginTop: space.md }}
        />
      )}

      {saved.length > 0 && (
        <View style={{ marginTop: space.xl }}>
          <SectionLabel>Backtest salvati ({saved.length})</SectionLabel>
          {saved.map((s) => (
            <View key={s.id} style={styles.savedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.savedTitle}>
                  {STRATEGIES.find((x) => x.value === s.strategyType)?.label || s.strategyType} ·{" "}
                  {s.timeframe} · {s.asset}
                </Text>
                <Text style={styles.savedMeta}>
                  {new Date(s.date).toLocaleDateString("it-IT")} · {s.source} · {s.trades} trade
                </Text>
                <Text style={styles.savedMetrics}>
                  <Text style={{ color: s.netPnlPct >= 0 ? colors.green : colors.red, fontWeight: "900" }}>
                    {s.netPnlPct >= 0 ? "+" : ""}{s.netPnlPct}%
                  </Text>{" "}
                  · WR {s.winRate}% · PF {s.profitFactor} · DD {s.maxDrawdownPct}%{" "}
                  · {s.ftmoPassed ? "✓ FTMO" : "✕ FTMO"}
                </Text>
              </View>
              <Pressable hitSlop={10} onPress={() => deleteSaved(s.id)} style={{ padding: space.sm }}>
                <Ionicons name="trash-outline" size={18} color={colors.red} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Results({ res, accountSize }: { res: BacktestResult; accountSize: number }) {
  const pnlColor = res.netPnl >= 0 ? colors.green : colors.red;
  return (
    <View style={{ marginTop: space.lg }}>
      {/* Esito FTMO */}
      <View style={[styles.verdict, { backgroundColor: res.ftmoPassed ? colors.green : colors.red }]}>
        <Text style={styles.verdictTxt}>
          {res.ftmoPassed ? "✓ CHALLENGE SUPERATA" : "✕ CHALLENGE NON SUPERATA"}
        </Text>
        <Text style={styles.verdictSub}>
          {res.targetReached ? "Target raggiunto · " : ""}
          {res.overallBreached ? "Limite totale violato · " : ""}
          {res.dailyBreached ? "Limite giornaliero violato" : ""}
          {!res.targetReached && !res.overallBreached && !res.dailyBreached ? "Target non raggiunto" : ""}
        </Text>
      </View>

      <View style={styles.bento}>
        <Mini label="P&L netto" value={`$${res.netPnl.toLocaleString("it-IT")}`} accent={pnlColor} />
        <Mini label="Rendimento" value={`${res.netPnlPct}%`} accent={pnlColor} />
      </View>
      <View style={styles.bento}>
        <Mini label="Trade" value={String(res.trades)} />
        <Mini label="Win rate" value={`${res.winRate}%`} accent={colors.blue} />
      </View>
      <View style={styles.bento}>
        <Mini label="Profit factor" value={String(res.profitFactor)} accent={res.profitFactor >= 1 ? colors.green : colors.red} />
        <Mini label="Max drawdown" value={`${res.maxDrawdownPct}%`} accent={res.maxDrawdownPct > 10 ? colors.red : colors.yellow} />
      </View>
      <View style={styles.bento}>
        <Mini label="Avg R" value={String(res.avgR)} />
        <Mini label="Saldo finale" value={`$${res.finalBalance.toLocaleString("it-IT")}`} />
      </View>

      <Card>
        <SectionLabel>Curva equity</SectionLabel>
        <EquityChart data={res.equityCurve} initial={accountSize} />
      </Card>

      {res.note ? <Text style={styles.note}>{res.note}</Text> : null}
      <Text style={styles.disclaimer}>
        ⚠️ Backtest illustrativo: usa la stessa logica dell'EA (ATR stop, ingresso alla barra
        successiva, una posizione per volta). I risultati passati non garantiscono quelli futuri.
      </Text>
    </View>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.miniCard}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={[styles.miniValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

function stratLabel(v: string) {
  return STRATEGIES.find((x) => x.value === v)?.label || v;
}

function OptResults({ out, onApply }: { out: OptOutcome; onApply: (i: OptItem) => void }) {
  const best = out.best;
  return (
    <View style={{ marginTop: space.lg }}>
      <View style={[styles.verdict, { backgroundColor: colors.black }]}>
        <Text style={styles.verdictTxt}>🎯 MIGLIORE CONFIGURAZIONE</Text>
        <Text style={styles.verdictSub}>
          {out.splitOk
            ? "Validata su dati non visti (out-of-sample)"
            : "Ottimizzazione sull'intero storico"}
        </Text>
      </View>

      {!best ? (
        <Card>
          <Text style={styles.optNote}>
            Nessuna configurazione valida trovata su questi dati. Prova un altro asset/timeframe o
            un CSV reale più lungo.
          </Text>
        </Card>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.sm }}>
              <Text style={styles.optBestTitle}>
                {stratLabel(best.config.strategyType)}
              </Text>
              <Badge
                text={best.robust ? "SOLIDA" : "DEBOLE"}
                bg={best.robust ? colors.green : colors.yellow}
              />
            </View>
            <Text style={styles.optParams}>
              RR 1:{best.config.rr} · Stop {best.config.slAtrMult}× ATR
            </Text>
            <Text style={styles.optSectionTitle}>Risultati attesi (out-of-sample)</Text>
            <View style={styles.bento}>
              <Mini label="Rendimento" value={`${best.test.netPnlPct}%`} accent={best.test.netPnlPct >= 0 ? colors.green : colors.red} />
              <Mini label="Win rate" value={`${best.test.winRate}%`} accent={colors.blue} />
            </View>
            <View style={styles.bento}>
              <Mini label="Profit factor" value={String(best.test.profitFactor)} accent={best.test.profitFactor >= 1 ? colors.green : colors.red} />
              <Mini label="Avg R" value={String(best.test.avgR)} accent={best.test.avgR >= 0 ? colors.green : colors.red} />
            </View>
            <View style={styles.bento}>
              <Mini label="Max drawdown" value={`${best.test.maxDrawdownPct}%`} accent={best.test.maxDrawdownPct > 10 ? colors.red : colors.yellow} />
              <Mini label="Trade" value={String(best.test.trades)} />
            </View>
            <Text style={styles.optInSample}>
              In-sample (training): WR {best.train.winRate}% · PF {best.train.profitFactor} · avgR {best.train.avgR}
            </Text>
            <Button title="Applica e testa questa configurazione" onPress={() => onApply(best)} style={{ marginTop: space.md }} />
          </Card>

          {out.ranked.length > 1 && (
            <Card>
              <SectionLabel>Classifica (out-of-sample)</SectionLabel>
              {out.ranked.slice(0, 6).map((it, i) => (
                <Pressable key={i} style={styles.rankRow} onPress={() => onApply(it)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rankTitle}>
                      {i + 1}. {stratLabel(it.config.strategyType)} · RR {it.config.rr} · SL {it.config.slAtrMult}×
                    </Text>
                    <Text style={styles.rankMetrics}>
                      <Text style={{ color: it.test.netPnlPct >= 0 ? colors.green : colors.red, fontWeight: "900" }}>
                        {it.test.netPnlPct >= 0 ? "+" : ""}{it.test.netPnlPct}%
                      </Text>{" "}
                      · WR {it.test.winRate}% · PF {it.test.profitFactor} · {it.test.trades} trade
                      {it.robust ? " · ✓" : ""}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              ))}
            </Card>
          )}
        </>
      )}

      {out.note ? <Text style={styles.optNote}>{out.note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: 48 },
  hero: { ...t.hero, color: colors.black },
  heroSub: { ...t.small, color: colors.muted, marginTop: space.sm, marginBottom: space.lg, lineHeight: 18 },
  row2: { flexDirection: "row", gap: space.md },
  input: {
    ...hardBorder, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 16,
    fontWeight: "700", color: colors.black, backgroundColor: colors.white,
  },
  csvInput: { height: 120, textAlignVertical: "top", fontFamily: fonts.mono, fontSize: 12, fontWeight: "400" },
  hint: { ...t.small, color: colors.muted, marginTop: space.sm, lineHeight: 17 },
  fileName: { ...t.small, color: colors.green, fontWeight: "700", marginTop: space.sm },
  savedRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.white, ...hardBorder, padding: space.md, marginBottom: space.sm },
  savedTitle: { ...t.h3, color: colors.black },
  savedMeta: { ...t.label, color: colors.muted, marginTop: 2 },
  savedMetrics: { ...t.small, color: colors.ink, marginTop: 4 },
  optHint: { ...t.small, color: colors.muted, marginTop: space.sm, lineHeight: 17 },
  warn: { ...t.small, color: colors.red, marginTop: space.sm, lineHeight: 18, fontWeight: "700" },
  optBestTitle: { ...t.h2, color: colors.black, flex: 1 },
  optParams: { ...t.body, color: colors.blue, fontWeight: "800", marginBottom: space.md },
  optSectionTitle: { ...t.label, color: colors.muted, textTransform: "uppercase", marginBottom: space.sm },
  optInSample: { ...t.small, color: colors.muted, marginTop: space.sm },
  optNote: { ...t.small, color: colors.yellow, marginTop: space.md, lineHeight: 18 },
  rankRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: space.sm },
  rankTitle: { ...t.small, color: colors.black, fontWeight: "700" },
  rankMetrics: { ...t.small, color: colors.ink, marginTop: 2 },
  verdict: { ...hardBorder, padding: space.lg, marginBottom: space.lg },
  verdictTxt: { ...t.h2, color: colors.white },
  verdictSub: { ...t.small, color: colors.white, marginTop: 4, opacity: 0.9 },
  bento: { flexDirection: "row", gap: space.md, marginBottom: space.md },
  miniCard: { flex: 1, backgroundColor: colors.white, ...hardBorder, padding: space.md },
  miniLabel: { ...t.label, color: colors.muted, textTransform: "uppercase" },
  miniValue: { fontSize: 20, fontWeight: "900", color: colors.black, marginTop: 4 },
  note: { ...t.small, color: colors.yellow, marginTop: space.md },
  disclaimer: { ...t.small, color: colors.muted, marginTop: space.md, lineHeight: 17 },
});
