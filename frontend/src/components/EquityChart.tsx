/** Mini grafico equity (barre verticali) senza dipendenze esterne. */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, space, fonts } from "@/theme";

export function EquityChart({ data, initial }: { data: number[]; initial: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data, initial);
  const max = Math.max(...data, initial);
  const range = max - min || 1;
  const up = data[data.length - 1] >= initial;
  return (
    <View>
      <View style={styles.chart}>
        {data.map((v, i) => {
          const h = 6 + ((v - min) / range) * 84;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                backgroundColor: v >= initial ? colors.green : colors.red,
                marginHorizontal: 0.5,
              }}
            />
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisTxt}>${min.toLocaleString("it-IT")}</Text>
        <Text style={[styles.axisTxt, { color: up ? colors.green : colors.red }]}>
          ${max.toLocaleString("it-IT")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 120,
    borderWidth: 2,
    borderColor: colors.black,
    backgroundColor: colors.white,
    padding: 4,
  },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  axisTxt: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
});
