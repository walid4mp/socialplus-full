
import React, { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, Dimensions, Alert, ActivityIndicator, TextInput, Modal, Image } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import * as ImagePicker from "expo-image-picker";
import { supabase, uploadMedia } from "../lib/supabase";
import { Avatar } from "../components/ui";
import { colors } from "../theme";
import { useAppStore } from "../store/useAppStore";
import type { Reel, Profile } from "../lib/database.types";

const { width, height } = Dimensions.get("window");

function ReelItem({ reel, active, liked, onLike, onComment }: { reel: Reel; active: boolean; liked: boolean; onLike: () => void; onComment: () => void }) {
  const player = useVideoPlayer(reel.video_url, (p) => { p.loop = true; p.muted = false; });
  useEffect(() => { if (active) player.play(); else player.pause(); }, [active]);
  const p = reel.profiles as Profile | undefined;
  return (
    <View style={{ width, height }}>
      <VideoView player={player} style={{ width, height }} contentFit="cover" nativeControls={false} />
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 110, backgroundColor: "rgba(0,0,0,0.35)" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Avatar uri={p?.avatar_url} size={38} ring />
          <Text style={{ color: "#fff", fontWeight: "900" }}>@{p?.username ?? "user"}</Text>
        </View>
        {!!reel.caption && <Text style={{ color: "#fff", marginTop: 6 }} numberOfLines={3}>{reel.caption}</Text>}
        <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 6 }}>♪ {(reel as any).sound_name ?? "الصوت الأصلي"}</Text>
      </View>
      <View style={{ position: "absolute", right: 12, bottom: 140, alignItems: "center", gap: 16 }}>
        <Pressable onPress={onLike} style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 26 }}>{liked ? "❤️" : "🤍"}</Text>
          <Text style={{ color: "#fff", fontSize: 11 }}>{reel.like_count ?? 0}</Text>
        </Pressable>
        <Pressable onPress={onComment} style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 24 }}>💬</Text>
          <Text style={{ color: "#fff", fontSize: 11 }}>{reel.comment_count ?? 0}</Text>
        </Pressable>
        <Pressable onPress={() => Alert.alert("مشاركة", `socialplus://reel/${reel.id}`)} style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 22 }}>↗️</Text>
          <Text style={{ color: "#fff", fontSize: 11 }}>مشاركة</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ReelsScreen({ navigation }: any) {
  const me = useAppStore((st: any) => st.profile);
  const [reels, setReels] = useState<Reel[]>([]);
  const [idx, setIdx] = useState(0);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [commentFor, setCommentFor] = useState<Reel | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [cText, setCText] = useState("");

  const load = async () => {
    const { data } = await supabase.from("reels").select("*, profiles:profiles!reels_user_id_fkey(*)").order("created_at", { ascending: false }).limit(20);
    setReels((data as Reel[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const upload = async () => {
    if (!me) return Alert.alert("", "سجّل الدخول أولاً");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 1 });
    if (r.canceled || !r.assets?.[0]) return;
    setUploading(true);
    const url = await uploadMedia("media", `reels/${me.id}/${Date.now()}.mp4`, r.assets[0].uri);
    setUploading(false);
    if (!url) return Alert.alert("⚠️", "فشل رفع الفيديو");
    const { error } = await supabase.from("reels").insert({ user_id: me.id, video_url: url, caption: "" });
    if (error) return Alert.alert("⚠️", error.message);
    load();
  };

  const like = async (r: Reel) => {
    const isL = !!liked[r.id];
    setLiked((m) => ({ ...m, [r.id]: !isL }));
    setReels((list) => list.map((x) => x.id === r.id ? { ...x, like_count: Math.max(0, (x.like_count ?? 0) + (isL ? -1 : 1)) } : x));
    const { error } = await supabase.rpc("toggle_reel_like", { p_reel: r.id });
    if (error) { setLiked((m) => ({ ...m, [r.id]: isL })); Alert.alert("⚠️", error.message); }
  };

  const openComments = async (r: Reel) => {
    setCommentFor(r);
    const { data } = await supabase.from("reel_comments").select("*, profiles:profiles!reel_comments_user_id_fkey(*)").eq("reel_id", r.id).order("created_at");
    setComments((data as any[]) ?? []);
  };
  const sendComment = async () => {
    if (!commentFor || !cText.trim()) return;
    const { error } = await supabase.rpc("add_reel_comment", { p_reel: commentFor.id, p_content: cText.trim() });
    if (error) return Alert.alert("⚠️", error.message);
    setCText("");
    openComments(commentFor);
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.accent} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <FlatList
        data={reels}
        keyExtractor={(x) => x.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={height}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.y / height))}
        renderItem={({ item, index }) => (
          <ReelItem reel={item} active={index === idx} liked={!!liked[item.id]} onLike={() => like(item)} onComment={() => openComments(item)} />
        )}
        ListEmptyComponent={
          <View style={{ width, height, alignItems: "center", justifyContent: "center", gap: 12 }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>لا ريلز بعد</Text>
            <Pressable onPress={upload} style={{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>ارفع أول ريل</Text>
            </Pressable>
          </View>
        }
      />
      <Pressable onPress={upload} disabled={uploading}
        style={{ position: "absolute", top: 50, right: 14, backgroundColor: colors.primary, width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontSize: 24 }}>{uploading ? "…" : "＋"}</Text>
      </Pressable>

      <Modal visible={!!commentFor} transparent animationType="slide" onRequestClose={() => setCommentFor(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setCommentFor(null)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, maxHeight: "70%" }}>
            <Text style={{ color: "#fff", fontWeight: "900", textAlign: "center", marginBottom: 8 }}>التعليقات ({comments.length})</Text>
            <FlatList
              data={comments}
              keyExtractor={(x) => x.id}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <View style={{ flexDirection: "row", gap: 8, paddingVertical: 7 }}>
                  <Avatar uri={item.profiles?.avatar_url} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>@{item.profiles?.username}</Text>
                    <Text style={{ color: "#EAEAF2", fontSize: 13 }}>{item.content}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", padding: 18 }}>لا تعليقات بعد</Text>}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, paddingBottom: 18 }}>
              <TextInput value={cText} onChangeText={setCText} placeholder="اكتب تعليقاً…" placeholderTextColor={colors.muted}
                style={{ flex: 1, color: "#fff", backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 14, height: 44 }} />
              <Pressable onPress={sendComment} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff" }}>➤</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
