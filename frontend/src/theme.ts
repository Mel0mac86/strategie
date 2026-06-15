/**
 * Design Swiss Brutalist — bianco/nero high-contrast con accenti.
 * Bordi netti, tipografia forte, nessun gradiente morbido.
 */
import { Platform } from "react-native";

export const colors = {
  black: "#000000",
  white: "#FFFFFF",
  paper: "#F4F4F2",
  ink: "#0A0A0A",
  border: "#000000",
  muted: "#6B6B6B",
  line: "#E2E2E0",

  // accenti
  blue: "#1D4ED8",
  green: "#15803D",
  red: "#DC2626",
  yellow: "#CA8A04",

  greenSoft: "#DCFCE7",
  redSoft: "#FEE2E2",
  blueSoft: "#DBEAFE",
  yellowSoft: "#FEF9C3",
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  none: 0,
  sm: 2,
  md: 4,
};

export const fonts = {
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "ui-monospace, SFMono-Regular, Menlo, monospace",
  }) as string,
  body: Platform.select({
    ios: "System",
    android: "sans-serif",
    default: "system-ui, -apple-system, sans-serif",
  }) as string,
};

export const type = {
  hero: { fontSize: 34, fontWeight: "900" as const, letterSpacing: -1 },
  h1: { fontSize: 26, fontWeight: "800" as const, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: "800" as const },
  h3: { fontSize: 16, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  small: { fontSize: 13, fontWeight: "400" as const },
  label: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1 },
};

/** Bordo brutalist standard. */
export const hardBorder = {
  borderWidth: 2,
  borderColor: colors.black,
};

/** Ombra "hard" tipica del brutalismo (offset netto, no blur su web). */
export const hardShadow = {
  ...Platform.select({
    web: { boxShadow: "4px 4px 0px #000000" } as any,
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 4,
    },
  }),
};
