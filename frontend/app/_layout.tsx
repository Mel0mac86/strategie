import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ScrollView, Text, View } from "react-native";
import { colors, space, type as t } from "@/theme";
import { Onboarding } from "@/components/Onboarding";

/**
 * Mostra l'errore invece di una pagina bianca se un componente lancia un'eccezione.
 * expo-router usa automaticamente l'export `ErrorBoundary` del layout root.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.xl, backgroundColor: colors.paper }}>
      <View style={{ borderWidth: 2, borderColor: colors.red, backgroundColor: colors.white, padding: space.lg }}>
        <Text style={{ ...t.h2, color: colors.red, marginBottom: space.sm }}>Si è verificato un errore</Text>
        <Text style={{ ...t.small, color: colors.ink, marginBottom: space.md }}>{String(error?.message || error)}</Text>
        <Text onPress={retry} style={{ ...t.h3, color: colors.blue }}>Riprova</Text>
      </View>
    </ScrollView>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.white },
          headerTintColor: colors.black,
          headerTitleStyle: { fontWeight: "900" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="history" options={{ title: "Storico Strategie" }} />
        <Stack.Screen
          name="strategy/[id]"
          options={{ title: "Strategia", headerBackTitle: "Indietro" }}
        />
      </Stack>
      <Onboarding />
    </SafeAreaProvider>
  );
}
