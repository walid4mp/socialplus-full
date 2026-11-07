import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Image } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import Animated, { useSharedValue, withTiming, Easing } from "react-native-reanimated";
import { supabase } from "../lib/supabase";
import { Avatar, s } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { RootParams } from "../navigation/RootNavigator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Story, Profile } from "../lib/database.types";

export function StoryViewerScreen({ navigation }: NativeStackScreenProps<RootParams, "StoryViewer">) {
  const { t } = useI18n();
  const userId = (navigation.getState().routes.at(-1)?.params as any)?.userId as string | undefined;
  const me = useAppStore((st) => st.profile);
  const [stories, setStories] = useState<Story[]>([]);
  const [idx, setIdx] = useState(0);
  const [reply, setReply] = useState("");
  const progress = useSharedValue(0);

  useEffect(() => {
    supabase
      .from("stories")
      .select("*, profiles:profiles!stories_user_id_fkey(*)")
      .gt("expires_at", new Date().toISOString())
      .then(({ data }) => {
        const list = ((data as Story[]) ?? []).filter((x) => !userId || x.user_id === userId);
        setStories(list);
        if (list.length) {
          progress.value = withTiming(1, { duration: 5000, easing: Easing.linear });
          const id = setTimeout(next, 5000);
          return () => clearTimeout(id);
        }
      });
  }, [userId]);

  const next = () => {
    setIdx((i) => (i + 1 < stories.length ? i + 1 : i));
    progress.value = 0;
    progress.value = withTiming(1, { duration: 5000, easing: Easing.linear });
  };

  const sendReply = async () => {
    const story = stories[idx];
    if (!story || !reply.trim() || !me) return;
    const { data: conv } = await supabase
      .from("conversations")
      .insert({ is_group: false }).select().single();
    await supabase.from("conversation_members").insert({ conversation_id: conv.id, user_id: me.id });
    await supabase.from("conversation_members").insert({ conversation_id: conv.id, user_id: story.user_id });
    await supabase.from("messages").insert({ conversation_id: conv.id, sender_id: me.id, content: `↩️ رد على قصة: ${reply}`, kind: "text" });
    setReply("");
    navigation.goBack();
  };

  const story = stories[idx];
  const p = story?.profiles as Profile | undefined;

  return (
    <LinearGradient colors={["#000", "#101028", "#000"]} style={s.screen}>
      <View style={{ paddingTop: 60, paddingHorizontal: 14, gap: 8 }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.surface2, overflow: "hidden" }}>
          <Animated.View style={{ height: "100%", backgroundColor: colors.accent, width: "100%", transform: [{ scaleX: progress }] }} />
        </View>
        {story && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Avatar uri={p?.avatar_url} ring size={40} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>@{p?.username}</Text>
            <Pressable onPress={() => navigation.goBack()} style={{ marginInlineStart: "auto" }}>
              <Text style={{ color: "#fff", fontSize: 22 }}>✕</Text>
            </Pressable>
          </View>
        )}
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {story?.media_url ? (
          <Image source={{ uri: story.media_url }} style={{ width: "100%", height: "70%" }} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: 70 }}>🌙</Text>
        )}
        {!!story?.caption && <Text style={{ color: "#fff", marginTop: 12, fontSize: 16 }}>{story.caption}</Text>}
      </View>
      <View style={{ padding: 18, flexDirection: "row", gap: 10 }}>
        <TextInput
          value={reply}
          onChangeText={setReply}
          placeholder={t("addComment")}
          placeholderTextColor={colors.muted}
          style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 18, height: 48, color: "#fff" }}
        />
        <Pressable onPress={sendReply} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 18 }}>↩️</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}
