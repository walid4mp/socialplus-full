import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, Image } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { supabase } from "../lib/supabase";
import { GlassCard, s } from "../components/ui";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { Story, Profile } from "../lib/database.types";
import type { RootParams } from "../navigation/RootNavigator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export function StoriesScreen({ navigation }: any) {
  const { t } = useI18n();
  const [stories, setStories] = useState<Story[]>([]);
  useEffect(() => {
    supabase
      .from("stories")
      .select("*, profiles:profiles!stories_user_id_fkey(*)")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .then(({ data }) => setStories((data as Story[]) ?? []));
  }, []);

  return (
    <View style={[s.screen, { paddingTop: 54, paddingHorizontal: 14 }]}>
      <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900", marginBottom: 14 }}>{t("stories")}</Text>
      <FlatList
        data={stories}
        numColumns={2}
        keyExtractor={(x) => x.id}
        columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
        renderItem={({ item }) => {
          const p = item.profiles as Profile | undefined;
          return (
            <Pressable onPress={() => navigation.navigate("StoryViewer", { userId: item.user_id })} style={{ flex: 1 }}>
              <GlassCard style={{ overflow: "hidden" }}>
                {item.media_url ? (
                  <Image source={{ uri: item.media_url }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
                ) : (
                  <LinearGradient colors={[colors.primary, colors.secondary]} style={{ height: 200, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 40 }}>✨</Text>
                  </LinearGradient>
                )}
                <View style={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 20 }}>🧑</Text>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{p?.username ?? "story"}</Text>
                </View>
              </GlassCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>لا توجد قصص نشطة</Text>}
      />
    </View>
  );
}
