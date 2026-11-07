import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { supabase } from "../lib/supabase";
import { GlassCard, s } from "../components/ui";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { RootParams } from "../navigation/RootNavigator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export function AdminScreen({ navigation }: NativeStackScreenProps<RootParams, "Admin">) {
  const { t } = useI18n();
  const [stats, setStats] = useState({ users: 0, posts: 0, reports: 0 });

  useEffect(() => {
    Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("posts").select("*", { count: "exact", head: true }),
      supabase.from("reports").select("*", { count: "exact", head: true }).eq("status", "open"),
    ]).then(([u, p, r]) => setStats({ users: u.count ?? 0, posts: p.count ?? 0, reports: r.count ?? 0 }));
  }, []);

  const items = [
    [t("manageUsers"), "👥"], [t("managePosts"), "📝"], [t("reports"), "🚩"],
    [t("ads"), "📢"], [t("gifts"), "🎁"], [t("analytics"), "📈"],
  ] as const;

  return (
    <LinearGradient colors={["#0D0E15", "#131c3f", "#0D0E15"]} style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 60, gap: 16 }}>
        <Text style={s.title}>🛡 {t("admin")}</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[[stats.users, t("totalUsers"), colors.primary], [stats.posts, t("managePosts"), colors.secondary], [stats.reports, t("reports"), colors.danger]].map(([n, l, c], i) => (
            <GlassCard key={i} style={{ flex: 1, padding: 14, alignItems: "center", borderTopWidth: 3, borderTopColor: String(c) }}>
              <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>{String(n)}</Text>
              <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center" }}>{String(l)}</Text>
            </GlassCard>
          ))}
        </View>
        <GlassCard style={{ padding: 8 }}>
          {items.map(([l, g]) => (
            <Pressable key={l} onPress={() => {}} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 18 }}>{g}</Text>
              <Text style={{ color: "#fff", flex: 1 }}>{l}</Text>
              <Text style={{ color: colors.muted }}>‹</Text>
            </Pressable>
          ))}
        </GlassCard>
        <Pressable onPress={() => navigation.goBack()} style={{ alignItems: "center", padding: 10 }}>
          <Text style={{ color: colors.muted }}>‹ رجوع</Text>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}
