/** Grafico a candele del backtest con marker di ingresso/uscita (senza librerie). */
import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { colors, space, fonts, hardBorder, type as t } from "@/theme";
import type { Bar } from "@/backtest/data";
import type { BTTrade } from "@/backtest/engine";

const H = 200;
const COL = 7;
const WINDOW = 160;

export function CandleChart({ bars, trades }: { bars: Bar[]; trades: BTTrade[] }) {
  if (!bars || bars.length < 3) return null;
  const start = Math.max(0, bars.length - WINDOW);
  const view = bars.slice(start);
  const W = view.length * COL;

  let min = Infinity;
  let max = -Infinity;
  for (const b of view) {
    if (b.low < min) min = b.low;
    if (b.high > max) max = b.high;
  }
  const range = max - min || 1;
  const y = (p: number) => H * (1 - (p - min) / range);

  const markers: { x: number; y: number; color: string }[] = [];
  for (const tr of trades) {
    const ei = tr.index - start;
    const xi = tr.exitIndex - start;
    if (ei >= 0 && ei < view.length)
      markers.push({ x: ei * COL + COL / 2, y: y(tr.entry), color: colors.blue });
    if (xi >= 0 && xi < view.length)
      markers.push({ x: xi * COL + COL / 2, y: y(tr.exit), color: tr.pnl >= 0 ? colors.green : colors.red });
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.scroll}>
        <View style={{ width: W, height: H }}>
          {view.map((b, i) => {
            const xc = i * COL + COL / 2;
            const up = b.close >= b.open;
            const col = up ? colors.green : colors.red;
            const bodyTop = y(Math.max(b.open, b.close));
            const bodyH = Math.max(1, Math.abs(y(b.open) - y(b.close)));
            return (
              <React.Fragment key={i}>
                <View style={{ position: "absolute", left: xc - 0.5, top: y(b.high), width: 1, height: Math.max(1, y(b.low) - y(b.high)), backgroundColor: col }} />
                <View style={{ position: "absolute", left: i * COL + 1, top: bodyTop, width: COL - 2, height: bodyH, backgroundColor: col }} />
              </React.Fragment>
            );
          })}
          {markers.map((m, i) => (
            <View
              key={"m" + i}
              style={{ position: "absolute", left: m.x - 4, top: m.y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: m.color, borderWidth: 1, borderColor: colors.white }}
            />
          ))}
        </View>
      </ScrollView>
      <Text style={styles.legend}>
        Ultime {view.length} barre · <Text style={{ color: colors.blue, fontWeight: "900" }}>● ingresso</Text>{" "}
        <Text style={{ color: colors.green, fontWeight: "900" }}>● uscita+</Text>{" "}
        <Text style={{ color: colors.red, fontWeight: "900" }}>● uscita−</Text> · scorri →
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { ...hardBorder, backgroundColor: colors.white },
  legend: { ...t.small, color: colors.muted, marginTop: space.xs, fontFamily: fonts.mono, fontSize: 11 },
});
