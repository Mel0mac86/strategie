/**
 * Calcolatore Lot Size standalone.
 * Calcolo in tempo reale lato client (Swiss Brutalist).
 */
import React, { useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { colors, space, fonts, hardBorder, type as t } from "@/theme";
import { Card, ChipRow, SectionLabel, Stat } from "@/components/ui";
// Calcolo lot size effettuato localmente in tempo reale (stessa formula del backend /api/lot-size).

type AssetClass = "forex" | "indices" | "metals" | "crypto";

const PIP_VALUE_PER_LOT: Record<AssetClass, number> = {
  forex: 10,
  indices: 1,
  metals: 10,
  crypto: 1,
};

const ASSET_OPTIONS = [
  { label: "Forex", value: "forex" },
  { label: "Indici", value: "indices" },
  { label: "Metalli", value: "metals" },
  { label: "Crypto", value: "crypto" },
];

// Preset capitale: include conti piccoli reali (€50…) oltre alle taglie FTMO.
const ACCOUNT_PRESETS = [
  { label: "50", value: "50" },
  { label: "100", value: "100" },
  { label: "500", value: "500" },
  { label: "1k", value: "1000" },
  { label: "10k", value: "10000" },
  { label: "50k", value: "50000" },
  { label: "100k", value: "100000" },
];

const MIN_LOT = 0.01; // lotto minimo tipico (broker standard)

function parseNum(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function CalculatorScreen() {
  const [capitale, setCapitale] = useState("50000");
  const [rischio, setRischio] = useState("1.0");
  const [slPips, setSlPips] = useState("20");
  const [asset, setAsset] = useState<AssetClass>("forex");

  const calc = useMemo(() => {
    const capitaleN = parseNum(capitale);
    const rischioN = parseNum(rischio);
    const slN = parseNum(slPips);
    const pipValue = PIP_VALUE_PER_LOT[asset];

    const riskAmount = (capitaleN * rischioN) / 100;
    const denom = slN * pipValue;
    const lots = denom > 0 ? riskAmount / denom : 0;
    const microLots = Math.round(lots * 100);

    // Analisi conto piccolo: rischio reale operando al lotto minimo (0,01).
    const minLotRisk = MIN_LOT * pipValue * slN; // USD a rischio a 0,01 lotti
    const minLotRiskPct = capitaleN > 0 ? (minLotRisk / capitaleN) * 100 : 0;
    const belowMinLot = lots > 0 && lots < MIN_LOT; // posizione richiesta sotto il minimo
    const isSmall = capitaleN > 0 && capitaleN < 2000;

    return { riskAmount, lots, microLots, pipValue, minLotRisk, minLotRiskPct, belowMinLot, isSmall };
  }, [capitale, rischio, slPips, asset]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>CALCOLATORE LOT SIZE</Text>
      <Text style={styles.subtitle}>
        Calcolo del lotto in tempo reale in base al rischio.
      </Text>

      <Card>
        <SectionLabel>Capitale</SectionLabel>
        <ChipRow options={ACCOUNT_PRESETS} value={capitale} onChange={setCapitale} />
        <TextInput
          style={[styles.input, { marginTop: space.sm }]}
          value={capitale}
          onChangeText={setCapitale}
          keyboardType="numeric"
          placeholder="50000"
          placeholderTextColor={colors.muted}
        />

        <View style={styles.row}>
          <View style={styles.col}>
            <SectionLabel>Rischio %</SectionLabel>
            <TextInput
              style={styles.input}
              value={rischio}
              onChangeText={setRischio}
              keyboardType="numeric"
              placeholder="1.0"
              placeholderTextColor={colors.muted}
            />
          </View>
          <View style={styles.colSpacer} />
          <View style={styles.col}>
            <SectionLabel>Stop Loss (pips)</SectionLabel>
            <TextInput
              style={styles.input}
              value={slPips}
              onChangeText={setSlPips}
              keyboardType="numeric"
              placeholder="20"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        <View style={styles.assetBlock}>
          <SectionLabel>Asset</SectionLabel>
          <ChipRow
            options={ASSET_OPTIONS}
            value={asset}
            onChange={(v) => setAsset(v as AssetClass)}
          />
        </View>
      </Card>

      <Card>
        <SectionLabel>Risultato</SectionLabel>
        <Text style={styles.bigLabel}>LOTTI</Text>
        <Text style={styles.bigValue}>{calc.lots.toFixed(2)}</Text>

        <View style={styles.statsRow}>
          <Stat
            label="Micro lotti"
            value={String(calc.microLots)}
            accent={colors.blue}
          />
          <Stat
            label="A rischio (USD)"
            value={`$${calc.riskAmount.toFixed(2)}`}
            accent={colors.red}
          />
          <Stat
            label="Pip value / lotto"
            value={`$${calc.pipValue}`}
            accent={colors.green}
          />
        </View>
      </Card>

      {(calc.isSmall || calc.belowMinLot) && (
        <View style={[styles.smallCard, { borderColor: calc.belowMinLot ? colors.red : colors.yellow }]}>
          <Text style={[styles.smallTitle, { color: calc.belowMinLot ? colors.red : colors.yellow }]}>
            {calc.belowMinLot ? "⚠️ CONTO TROPPO PICCOLO" : "CONTI PICCOLI"}
          </Text>
          <Text style={styles.smallText}>
            Al lotto minimo (0,01) rischi{" "}
            <Text style={styles.smallBold}>${calc.minLotRisk.toFixed(2)}</Text> per trade ={" "}
            <Text style={[styles.smallBold, { color: calc.minLotRiskPct > 5 ? colors.red : colors.green }]}>
              {calc.minLotRiskPct.toFixed(1)}%
            </Text>{" "}
            del capitale.
          </Text>
          {calc.belowMinLot && (
            <Text style={styles.smallText}>
              Il lotto calcolato ({calc.lots.toFixed(3)}) è sotto il minimo: non puoi rischiare così
              poco a 0,01 lotti.
            </Text>
          )}
          <Text style={styles.smallText}>
            Per un conto da {capitale}: usa un <Text style={styles.smallBold}>conto CENT</Text> (lotti
            ×100 più piccoli), riduci lo <Text style={styles.smallBold}>Stop Loss</Text>, scegli asset
            con pip value minore, e tieni il rischio ≤ 1–2%. Evita la martingala su conti piccoli.
          </Text>
        </View>
      )}

      <Text style={styles.formula}>
        lotti = (capitale x rischio% / 100) / (SL pips x pip value per lotto)
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.paper,
  },
  content: {
    padding: space.lg,
  },
  title: {
    ...t.h1,
    color: colors.black,
    textTransform: "uppercase",
  },
  subtitle: {
    ...t.small,
    color: colors.muted,
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  input: {
    ...hardBorder,
    backgroundColor: colors.white,
    color: colors.black,
    fontWeight: "700",
    fontSize: 18,
    paddingVertical: 12,
    paddingHorizontal: space.md,
  },
  row: {
    flexDirection: "row",
    marginTop: space.lg,
  },
  col: {
    flex: 1,
  },
  colSpacer: {
    width: space.md,
  },
  assetBlock: {
    marginTop: space.lg,
  },
  bigLabel: {
    ...t.label,
    color: colors.muted,
    textTransform: "uppercase",
    marginTop: space.xs,
  },
  bigValue: {
    fontSize: 40,
    fontWeight: "900",
    color: colors.black,
    fontFamily: fonts.mono,
    letterSpacing: -1,
    marginTop: space.xs,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: space.lg,
    marginLeft: -space.md,
    rowGap: space.md,
  },
  formula: {
    ...t.small,
    color: colors.muted,
    fontFamily: fonts.mono,
    marginTop: space.sm,
  },
  smallCard: {
    ...hardBorder,
    backgroundColor: colors.white,
    padding: space.lg,
    marginTop: space.lg,
  },
  smallTitle: { ...t.h3, marginBottom: space.sm },
  smallText: { ...t.small, color: colors.ink, lineHeight: 19, marginBottom: space.xs },
  smallBold: { fontWeight: "900" },
});
