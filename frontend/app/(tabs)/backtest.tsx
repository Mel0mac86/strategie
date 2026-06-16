import React, { useState } from "react";
import { ScrollView, Text, View, StyleSheet, TextInput, Alert, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Badge, Button, Card, ChipRow, SectionLabel, Stat } from "@/components/ui";
import { EquityChart } from "@/components/EquityChart";
import { colors, fonts, hardBorder, space, type as t } from "@/theme";
import { TIMEFRAMES, generateBars, parseCsv, Bar } from "@/backtest/data";
import { runBacktest, BacktestResult } from "@/backtest/engine";

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
  const [source, setSource] = useState<"sim" | "csv">("sim");
  const [bars, setBars] = useState("1500");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);

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

  function run() {
    setRunning(true);
    setResult(null);
    // setTimeout per dare modo alla UI di mostrare lo stato "in corso"
    setTimeout(() => {
      try {
        let data: Bar[];
        if (source === "csv") {
          data = parseCsv(csv);
          if (data.length < 60) {
            Alert.alert(
              "Dati insufficienti",
              "Incolla almeno ~250 barre OHLC (CSV da MT4/TradingView) per un backtest affidabile."
            );
            setRunning(false);
            return;
          }
        } else {
          const count = Math.max(300, Math.min(20000, Number(bars) || 1500));
          data = generateBars(asset, timeframe, count);
        }
        const res = runBacktest(data, {
          strategyType,
          accountSize: Number(accountSize),
          phase,
          riskPct: Number(riskPct) || 1,
          rr: Number(rr) || 2,
          slAtrMult: 1.5,
          maxDailyTrades: 5,
        });
        setResult(res);
      } catch (e: any) {
        Alert.alert("Errore", e?.message || "Backtest fallito");
      } finally {
        setRunning(false);
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
        </View>
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

      {result && <Results res={result} accountSize={Number(accountSize)} />}
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
