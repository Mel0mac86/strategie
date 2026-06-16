import React, { useCallback, useState } from "react";
import {
  FlatList,
  Text,
  View,
  StyleSheet,
  Pressable,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Strategy } from "@/api";
import { Badge } from "@/components/ui";
import { colors, hardBorder, space, type as t } from "@/theme";

export default function HistoryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Strategy[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setItems(await api.listStrategies());
    } catch {
      /* offline */
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function confirmDelete(item: Strategy) {
    Alert.alert("Elimina strategia", `Eliminare "${item.title}"?`, [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          setItems((prev) => prev.filter((x) => x.id !== item.id));
          try {
            await api.deleteStrategy(item.id);
          } catch {
            load();
          }
        },
      },
    ]);
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(i) => i.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.black} />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyTxt}>Nessuna strategia salvata.</Text>
          <Text style={styles.emptySub}>Genera la tua prima strategia dalla home.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => router.push(`/strategy/${item.id}`)}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowTop}>
              <Badge
                text={item.generated_by === "ai" ? "AI" : "LOCALE"}
                bg={item.generated_by === "ai" ? colors.blue : colors.muted}
              />
              {item.score ? <Badge text={`${item.score}/100`} bg={colors.green} /> : null}
            </View>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.sub} numberOfLines={2}>{item.summary}</Text>
            <Text style={styles.meta}>
              {new Date(item.created_at).toLocaleDateString("it-IT")} · conto $
              {item.ftmo?.account_size?.toLocaleString("it-IT")}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={() => confirmDelete(item)} style={styles.del}>
            <Ionicons name="trash-outline" size={20} color={colors.red} />
          </Pressable>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: 48, flexGrow: 1 },
  row: {
    flexDirection: "row",
    backgroundColor: colors.white,
    ...hardBorder,
    padding: space.md,
    marginBottom: space.md,
    alignItems: "center",
  },
  rowTop: { flexDirection: "row", gap: space.sm, marginBottom: 6 },
  title: { ...t.h3, color: colors.black },
  sub: { ...t.small, color: colors.muted, marginTop: 4, lineHeight: 18 },
  meta: { ...t.label, color: colors.muted, marginTop: 6 },
  del: { padding: space.sm },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyTxt: { ...t.h3, color: colors.muted, marginTop: space.md },
  emptySub: { ...t.small, color: colors.muted, marginTop: 4 },
});
