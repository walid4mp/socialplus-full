
import React, { useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Alert, Image, ActivityIndicator } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { supabase, uploadMedia } from "../lib/supabase";
import { GradientButton, GlassCard, Row, s } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { colors } from "../theme";

export function CreatePostScreen({ navigation }: any) {
  const { t } = useI18n();
  const profile = useAppStore((st: any) => st.profile);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<{ uri: string; video: boolean }[]>([]);
  const [busy, setBusy] = useState(false);

  const pick = async (video: boolean) => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: video ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      quality: 0.75, allowsMultipleSelection: !video,
    });
    if (r.canceled) return;
    setMedia((m) => [...m, ...r.assets.map((a) => ({ uri: a.uri, video }))].slice(0, 6));
  };

  const share = async () => {
    if (!profile || (!text.trim() && !media.length)) return Alert.alert("", t("whatsOnYourMind"));
    setBusy(true);
    const urls: string[] = [];
    for (const m of media) {
      const ext = m.video ? "mp4" : "jpg";
      const url = await uploadMedia("media", `posts/${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`, m.uri);
      if (url) urls.push(url);
    }
    const hasVideo = media.some((m) => m.video);
    const { error } = await supabase.from("posts").insert({
      user_id: profile.id, content: text,
      media_urls: urls,
      media_type: urls.length ? (hasVideo ? "video" : "image") : "text",
    });
    setBusy(false);
    if (error) return Alert.alert("⚠️", error.message);
    if (media.length && urls.length === 0) return Alert.alert("⚠️", "فشل رفع الوسائط — تحقّق من bucket «media»");
    setText(""); setMedia([]);
    Alert.alert("✅", "تم النشر!");
    navigation.navigate("Home");
  };

  return (
    <LinearGradient colors={["#0D0E15", "#141B3A", "#0D0E15"]} style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 60, paddingBottom: 120, gap: 16 }}>
        <Row>
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900", flex: 1 }}>منشور جديد</Text>
          <GradientButton label={t("share")} onPress={share} busy={busy} style={{ paddingHorizontal: 24, paddingVertical: 0 }} labelStyle={{ fontSize: 14 }} />
        </Row>
        <GlassCard style={{ padding: 16, gap: 12 }}>
          <Row gap={10}>
            <Text style={{ fontSize: 26 }}>🧑</Text>
            <Text style={{ color: "#fff", fontWeight: "700" }}>{profile?.username ?? "أنت"}</Text>
          </Row>
          <TextInput
            value={text} onChangeText={setText} placeholder={t("whatsOnYourMind")}
            placeholderTextColor={colors.muted} multiline
            style={{ color: "#fff", minHeight: 100, fontSize: 16, textAlignVertical: "top" }}
          />
          {media.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {media.map((m, i) => (
                <Pressable key={i} onPress={() => setMedia((x) => x.filter((_, k) => k !== i))} style={{ position: "relative" }}>
                  <Image source={{ uri: m.uri }} style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: "#000" }} resizeMode="cover" />
                  {m.video && <Text style={{ position: "absolute", bottom: 6, left: 6, color: "#fff" }}>▶️</Text>}
                  <View style={{ position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 9, width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#fff", fontSize: 11 }}>✕</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => pick(false)} style={{ flex: 1, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.primary, borderRadius: 16, padding: 16, alignItems: "center" }}>
              <Text style={{ color: colors.accent }}>🖼 صور</Text>
            </Pressable>
            <Pressable onPress={() => pick(true)} style={{ flex: 1, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.secondary, borderRadius: 16, padding: 16, alignItems: "center" }}>
              <Text style={{ color: colors.secondary }}>🎥 فيديو</Text>
            </Pressable>
          </View>
          {busy && <ActivityIndicator color={colors.accent} />}
        </GlassCard>
        <Pressable onPress={() => navigation.navigate("Stories")} style={{ alignItems: "center", padding: 12, backgroundColor: colors.surface2, borderRadius: 14 }}>
          <Text style={{ color: colors.accent }}>✨ إنشاء قصة جديدة</Text>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}
