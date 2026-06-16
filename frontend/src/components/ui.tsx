/** Componenti UI brutalisti riusabili. */
import React from "react";
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { colors, hardBorder, hardShadow, space, type as t } from "@/theme";

export function Card({
  children,
  style,
  flat,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  flat?: boolean;
}) {
  return (
    <View style={[styles.card, !flat && hardShadow, style]}>{children}</View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "success";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  small?: boolean;
}) {
  const bg =
    variant === "primary"
      ? colors.black
      : variant === "danger"
      ? colors.red
      : variant === "success"
      ? colors.green
      : colors.white;
  const fg = variant === "secondary" ? colors.black : colors.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, small && { fontSize: 12 }, { color: fg }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? colors.black : colors.white },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? colors.white : colors.black },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          active={value === o.value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

export function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        <Text style={accent ? { color: accent } : undefined}>{value}</Text>
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Badge({
  text,
  color = colors.blue,
  bg,
}: {
  text: string;
  color?: string;
  bg?: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: bg || color }]}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    ...hardBorder,
    padding: space.lg,
    marginBottom: space.lg,
  },
  sectionLabel: {
    ...t.label,
    color: colors.black,
    marginBottom: space.sm,
    textTransform: "uppercase",
  },
  button: {
    ...hardBorder,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: space.md },
  buttonText: { ...t.h3, letterSpacing: 0.5, textTransform: "uppercase" },
  chip: {
    ...hardBorder,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  chipText: { fontSize: 13, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  stat: { paddingHorizontal: space.md, minWidth: 90 },
  statValue: { fontSize: 20, fontWeight: "900", color: colors.black },
  statLabel: {
    ...t.label,
    color: colors.muted,
    marginTop: 2,
    textTransform: "uppercase",
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  divider: { height: 2, backgroundColor: colors.black, marginVertical: space.md },
});
