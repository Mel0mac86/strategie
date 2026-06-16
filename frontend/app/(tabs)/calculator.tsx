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

    return { riskAmount, lots, microLots, pipValue };
  }, [capitale, rischio, slPips, asset]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>CALCOLATORE LOT SIZE</Text>
      <Text style={styles.subtitle}>
        Calcolo del lotto in tempo reale in base al rischio.
      </Text>

      <Card>
        <SectionLabel>Capitale (USD)</SectionLabel>
        <TextInput
          style={styles.input}
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
});
