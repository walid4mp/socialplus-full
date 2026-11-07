import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Image, ScrollView } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { supabase } from "../lib/supabase";
import { useAppStore } from "../store/useAppStore";
import { Avatar, GradientButton, Empty, s } from "../components/ui";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { RootParams } from "../navigation/RootNavigator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Post } from "../lib/database.types";

export function ProfileScreen({ navigation }: any) {
  const { t } = useI18n();
  const profile = useAppStore((st) => st.profile);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 });

  useEffect(() => {
    if (!profile) return;
    supabase.from("posts").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).then(({ data }) => setPosts((data as Post[]) ?? []));
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id).then(({ count }) => setStats((st) => ({ ...st, followers: count ?? 0 })));
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id).then(({ count }) => setStats((st) => ({ ...st, following: count ?? 0 })));
  }, [profile]);

  if (!profile) return <View style={s.screen}><Empty text="سجّل الدخول لعرض البروفايل" /></View>;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 90 }}>
      <Image source={{ uri: profile.cover_url ?? undefined }} style={{ width: "100%", height: 150, backgroundColor: colors.surface2 }} />
      <View style={{ paddingHorizontal: 16, marginTop: -50 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <Avatar uri={profile.avatar_url} size={96} ring />
          <View style={{ flex: 1, alignItems: "flex-end", paddingBottom: 6 }}>
            <GradientButton label={t("editProfile")} onPress={() => navigation.navigate("EditProfile")} style={{ paddingVertical: 0 }} labelStyle={{ fontSize: 13 }} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>{profile.full_name}</Text>
          {!!profile.is_verified && <Text style={{ color: colors.accent, fontSize: 16 }}>✔︎ {t("verified")}</Text>}
        </View>
        <Text style={{ color: colors.muted }}>@{profile.username}</Text>
        {!!profile.bio && <Text style={{ color: "#fff", marginTop: 8, lineHeight: 20 }}>{profile.bio}</Text>}

        <View style={{ flexDirection: "row", marginTop: 18, justifyContent: "space-around" }}>
          {[[stats.posts, t("posts")], [stats.followers, t("followers")], [stats.following, t("following")]].map(([n, l], i) => (
            <View key={i} style={{ alignItems: "center" }}>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>{String(n)}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{String(l)}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
          <Pressable onPress={() => navigation.navigate("Wallet")} style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 20 }}>🪙</Text>
            <Text style={{ color: "#fff", marginTop: 4 }}>{profile.coins} {t("coins")}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Settings")} style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 20 }}>⚙️</Text>
            <Text style={{ color: "#fff", marginTop: 4 }}>{t("settings")}</Text>
          </Pressable>
        </View>

        <Text style={{ color: "#fff", fontWeight: "800", marginTop: 22, marginBottom: 10 }}>{t("posts")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {posts.map((p) => (
            <View key={p.id} style={{ width: "32%", aspectRatio: 1, borderRadius: 10, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}>
              {p.media_urls?.[0] ? <Image source={{ uri: p.media_urls[0] }} style={{ width: "100%", height: "100%", borderRadius: 10 }} /> : <Text style={{ color: colors.muted }}>Aa</Text>}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
