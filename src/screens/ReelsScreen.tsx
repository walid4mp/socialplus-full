import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, Dimensions, ActivityIndicator } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { useWindowDimensions } from "react-native";
import { supabase } from "../lib/supabase";
import { GlassCard, Empty, s } from "../components/ui";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { Reel, Profile } from "../lib/database.types";

const H = Dimensions.get("window").height;

export function ReelsScreen() {
  const { t } = useI18n();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("reels")
      .select("*, profiles:profiles!reels_user_id_fkey(*)")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setReels((data as Reel[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) return <View style={[s.screen, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={colors.accent} /></View>;
  if (!reels.length) return <View style={s.screen}><Empty text="لا توجد ريلز بعد 🎬" /></View>;

  return (
    <FlatList
      style={s.screen}
      data={reels}
      pagingEnabled
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => {
        const p = item.profiles as Profile | undefined;
        return (
          <View style={{ height: H, backgroundColor: "#000" }}>
            {item.video_url ? (
              <VideoSizer uri={item.video_url} />
            ) : (
              <LinearGradient colors={["#1a1a2e", "#0d0e15"]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 60 }}>🎥</Text>
                <Text style={{ color: colors.muted }}>فيديو الريل غير متوفر للمعاينة</Text>
              </LinearGradient>
            )}
            <View style={{ position: "absolute", bottom: 110, insetInlineEnd: 14, gap: 22, alignItems: "center" }}>
              <Pressable><Text style={{ fontSize: 26 }}>❤️</Text><Text style={{ color: "#fff", textAlign: "center", fontSize: 11 }}>{item.like_count}</Text></Pressable>
              <Pressable><Text style={{ fontSize: 26 }}>💬</Text><Text style={{ color: "#fff", textAlign: "center", fontSize: 11 }}>{item.comment_count}</Text></Pressable>
              <Pressable><Text style={{ fontSize: 26 }}>↗️</Text><Text style={{ color: "#fff", textAlign: "center", fontSize: 11 }}>{item.share_count}</Text></Pressable>
              <Pressable><Text style={{ fontSize: 26 }}>🔖</Text></Pressable>
              <Pressable><Text style={{ fontSize: 26 }}>⤵️</Text></Pressable>
            </View>
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingTop: 30, padding: 16, paddingBottom: 90 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>@{p?.username ?? "user"}</Text>
                <View style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 12, paddingVertical: 3 }}>
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>{t("follow")}</Text>
                </View>
              </View>
              <Text style={{ color: "#fff", marginTop: 6 }}>{item.caption}</Text>
              <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>🎵 {t("originalSound")}</Text>
            </LinearGradient>
          </View>
        );
      }}
    />
  );
}

function VideoSizer({ uri }: { uri: string }) {
  return (
    <LinearGradient colors={["#151230", "#0d0e15"]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 50 }}>▶️</Text>
      <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12, textAlign: "center", paddingHorizontal: 30 }}>
        تشغيل الفيديو يتطلب بناء Expo (expo-av) على جهاز حقيقي
      </Text>
    </LinearGradient>
  );
}
