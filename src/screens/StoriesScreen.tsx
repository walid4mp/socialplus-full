
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, Image, Alert, Modal, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { supabase, uploadMedia } from "../lib/supabase";
import { useAppStore } from "../store/useAppStore";
import { GlassCard, Empty, s } from "../components/ui";
import { colors } from "../theme";
import type { Story, Profile } from "../lib/database.types";

const TRACKS = [
  { name: "Neon Nights", url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a7bd3c.mp3" },
  { name: "Golden Hour", url: "https://cdn.pixabay.com/download/audio/2021/11/25/audio_00fa5593f0.mp3" },
  { name: "Deep Vibes", url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3" },
  { name: "Sunset Drive", url: "https://cdn.pixabay.com/download/audio/2022/10/25/audio_946bc2f6ba.mp3" },
];

export function StoriesScreen({ navigation }: any) {
  const me = useAppStore((st: any) => st.profile);
  const [stories, setStories] = useState<Story[]>([]);
  const [uploading, setUploading] = useState(false);
  const [composer, setComposer] = useState(false);
  const [asset, setAsset] = useState<{ uri: string; video: boolean } | null>(null);
  const [caption, setCaption] = useState("");
  const [track, setTrack] = useState<{ name: string; url: string } | null>(null);
  const [customAudio, setCustomAudio] = useState<{ name: string; uri: string } | null>(null);

  const load = async () => {
    const { data } = await supabase.from("stories").select("*, profiles:profiles!stories_user_id_fkey(*)")
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
    setStories((data as Story[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const pick = async (video: boolean) => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: video ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (r.canceled || !r.assets?.[0]) return;
    setAsset({ uri: r.assets[0].uri, video });
    setComposer(true);
  };

  const pickAudio = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    setCustomAudio({ name: r.assets[0].name ?? "صوتي", uri: r.assets[0].uri });
    setTrack(null);
  };

  const publish = async () => {
    if (!me || !asset) return;
    setUploading(true);
    const ext = asset.video ? "mp4" : "jpg";
    const mediaUrl = await uploadMedia("media", `stories/${me.id}/${Date.now()}.${ext}`, asset.uri);
    let musicName: string | null = track?.name ?? customAudio?.name ?? null;
    let musicUrl: string | null = track?.url ?? null;
    if (customAudio) {
      musicUrl = await uploadMedia("media", `stories/${me.id}/audio-${Date.now()}.mp3`, customAudio.uri);
      musicName = customAudio.name;
    }
    setUploading(false);
    if (!mediaUrl) return Alert.alert("⚠️", "فشل رفع الوسائط");
    const { error } = await supabase.from("stories").insert({ user_id: me.id, media_url: mediaUrl, caption: caption || null, music: musicName, music_name: musicName, music_url: musicUrl });
    if (error) return Alert.alert("⚠️", error.message);
    setComposer(false); setAsset(null); setCaption(""); setTrack(null); setCustomAudio(null);
    load();
    Alert.alert("✅", "نُشرت القصة — تختفي بعد 24 ساعة");
  };

  return (
    <View style={[s.screen, { paddingTop: 54, paddingHorizontal: 14 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}><Text style={{ color: "#fff", fontSize: 22 }}>‹</Text></Pressable>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900", flex: 1 }}>القصص</Text>
        <Pressable onPress={() => pick(false)} style={{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>🖼 صورة</Text>
        </Pressable>
        <Pressable onPress={() => pick(true)} style={{ backgroundColor: colors.secondary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>🎥 فيديو</Text>
        </Pressable>
      </View>

      <FlatList
        data={stories}
        numColumns={2}
        keyExtractor={(x) => x.id}
        columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
        renderItem={({ item }) => {
          const p = item.profiles as Profile | undefined;
          const mine = item.user_id === me?.id;
          return (
            <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate("StoryViewer", { userId: item.user_id })}>
              <GlassCard>
                {item.media_url ? (
                  <Image source={{ uri: item.media_url }} style={{ width: "100%", height: 210 }} resizeMode="cover" />
                ) : (
                  <LinearGradient colors={[colors.primary, colors.secondary]} style={{ height: 210, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 36 }}>✨</Text>
                  </LinearGradient>
                )}
                {!!(item as any).music_name && (
                  <View style={{ position: "absolute", bottom: 44, left: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", gap: 4 }}>
                    <Text style={{ color: "#fff", fontSize: 10 }}>🎵 {(item as any).music_name}</Text>
                  </View>
                )}
                <View style={{ padding: 9, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12, flex: 1 }} numberOfLines={1}>@{p?.username ?? "story"}</Text>
                  {mine && (
                    <Pressable onPress={() => Alert.alert("حذف القصة", "", [
                      { text: "إلغاء", style: "cancel" },
                      { text: "حذف", style: "destructive", onPress: async () => { await supabase.from("stories").delete().eq("id", item.id); load(); } },
                    ])}><Text>🗑</Text></Pressable>
                  )}
                </View>
              </GlassCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Empty text="لا قصص نشطة — أضف أول قصة" />}
      />

      <Modal visible={composer} animationType="slide" onRequestClose={() => setComposer(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 50, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900", flex: 1 }}>قصة جديدة</Text>
            <Pressable onPress={() => setComposer(false)}><Text style={{ color: colors.muted }}>إلغاء</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
            {!!asset && <Image source={{ uri: asset.uri }} style={{ width: "100%", height: 320, borderRadius: 18, backgroundColor: "#000" }} resizeMode="cover" />}
            <TextInput value={caption} onChangeText={setCaption} placeholder="أضف نصاً على القصة…" placeholderTextColor={colors.muted} multiline
              style={{ color: "#fff", backgroundColor: colors.surface2, borderRadius: 14, padding: 14, minHeight: 70, borderWidth: 1, borderColor: colors.border }} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>🎵 الموسيقى</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {TRACKS.map((t) => (
                <Pressable key={t.name} onPress={() => { setTrack(t); setCustomAudio(null); }}
                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: track?.name === t.name ? colors.secondary : colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: "#fff", fontSize: 12 }}>♪ {t.name}</Text>
                </Pressable>
              ))}
              <Pressable onPress={pickAudio} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: customAudio ? colors.secondary : colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: "#fff", fontSize: 12 }}>📂 من جهازي</Text>
              </Pressable>
            </ScrollView>
            {!!(track || customAudio) && (
              <Pressable onPress={() => { setTrack(null); setCustomAudio(null); }}>
                <Text style={{ color: colors.danger, fontSize: 12 }}>إزالة الموسيقى</Text>
              </Pressable>
            )}
            <Pressable onPress={publish} disabled={uploading}
              style={{ backgroundColor: colors.primary, borderRadius: 16, padding: 16, alignItems: "center", marginTop: 6 }}>
              {uploading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "900" }}>نشر القصة</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
