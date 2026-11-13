
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, Image, Alert, ActivityIndicator, RefreshControl, ScrollView } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { supabase } from "../lib/supabase";
import { useAppStore } from "../store/useAppStore";
import { Avatar, GlassCard, Empty, s } from "../components/ui";
import { CommentsSheet } from "../components/CommentsSheet";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { Post, Profile, Story } from "../lib/database.types";

export function HomeScreen({ navigation }: any) {
  const { t } = useI18n();
  const profile = useAppStore((st: any) => st.profile);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);

  const load = async () => {
    const [{ data: pdata }, { data: sdata }, { data: likes }, { count: lc }] = await Promise.all([
      supabase.from("posts").select("*, profiles:profiles!posts_user_id_fkey(*)").order("created_at", { ascending: false }).limit(25),
      supabase.from("stories").select("*, profiles:profiles!stories_user_id_fkey(*)").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(30),
      supabase.from("post_likes").select("post_id").eq("user_id", profile?.id ?? "00000000-0000-0000-0000-000000000000"),
      supabase.from("streams").select("id", { count: "exact", head: true }).eq("status", "live"),
    ]);
    setPosts((pdata as Post[]) ?? []);
    setStories((sdata as Story[]) ?? []);
    const m: Record<string, boolean> = {};
    (likes ?? []).forEach((x: any) => { m[x.post_id] = true; });
    setLiked(m);
    setLiveCount(lc ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("home-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  const toggleLike = async (p: Post) => {
    const isLiked = !!liked[p.id];
    setLiked((m) => ({ ...m, [p.id]: !isLiked }));
    setPosts((list) => list.map((x) => x.id === p.id ? { ...x, like_count: Math.max(0, (x.like_count ?? 0) + (isLiked ? -1 : 1)) } : x));
    const { error } = await supabase.rpc("toggle_post_like", { p_post_id: p.id });
    if (error) { setLiked((m) => ({ ...m, [p.id]: isLiked })); return Alert.alert("⚠️", error.message); }
  };

  const toggleSave = async (p: Post) => {
    const isSaved = !!saved[p.id];
    setSaved((m) => ({ ...m, [p.id]: !isSaved }));
    if (isSaved) await supabase.from("saved_posts").delete().eq("post_id", p.id).eq("user_id", profile?.id);
    else await supabase.from("saved_posts").insert({ post_id: p.id, user_id: profile?.id });
    Alert.alert("", isSaved ? "أُزيل من المحفوظات" : "تم الحفظ في المفضلة");
  };

  const grouped = stories.reduce<Record<string, Story[]>>((acc, x) => { (acc[x.user_id] ||= []).push(x); return acc; }, {});
  const storyUsers = Object.keys(grouped);

  const renderMedia = (item: Post) => {
    const urls = item.media_urls ?? [];
    if (!urls.length) return null;
    if (item.media_type === "video") {
      return (
        <Pressable onPress={() => navigation.navigate("Reels")}>
          <View style={{ height: 220, borderRadius: 16, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 40 }}>▶️</Text>
            <Text style={{ color: "#fff", marginTop: 6, fontSize: 12 }}>اضغط للمشاهدة</Text>
          </View>
        </Pressable>
      );
    }
    if (urls.length === 1) return <Image source={{ uri: urls[0] }} style={{ width: "100%", height: 240, borderRadius: 16, backgroundColor: colors.surface2 }} resizeMode="cover" />;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {urls.slice(0, 6).map((u, i) => (
          <Image key={i} source={{ uri: u }} style={{ width: 240, height: 240, borderRadius: 14, backgroundColor: colors.surface2 }} resizeMode="cover" />
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={s.screen}>
      <View style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Text style={{ color: colors.accent, fontSize: 22, fontWeight: "900", flex: 1 }}>{t("appName")}</Text>
        <Pressable onPress={() => navigation.navigate("LiveList")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger }} />
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>بث {liveCount > 0 ? `(${liveCount})` : ""}</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate("Search")}><Text style={{ fontSize: 19 }}>🔍</Text></Pressable>
        <Pressable onPress={() => navigation.navigate("Notifications")}><Text style={{ fontSize: 19 }}>🔔</Text></Pressable>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={{ paddingBottom: 10 }}>
            <FlatList
              horizontal showsHorizontalScrollIndicator={false} data={storyUsers} keyExtractor={(x) => x}
              contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingVertical: 10 }}
              ListHeaderComponent={
                <Pressable onPress={() => navigation.navigate("Stories")} style={{ alignItems: "center", gap: 5 }}>
                  <View style={{ width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(91,103,241,0.12)" }}>
                    <Text style={{ color: "#fff", fontSize: 24 }}>＋</Text>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{t("myStory")}</Text>
                </Pressable>
              }
              renderItem={({ item: uid }) => {
                const st = grouped[uid][0];
                const u = st.profiles as Profile | undefined;
                return (
                  <Pressable onPress={() => navigation.navigate("StoryViewer", { userId: uid })} style={{ alignItems: "center", gap: 5 }}>
                    <View style={{ padding: 2.5, borderRadius: 34, borderWidth: 2, borderColor: colors.secondary }}>
                      <Avatar uri={u?.avatar_url} size={56} />
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{(u?.username ?? "").slice(0, 9)}</Text>
                  </Pressable>
                );
              }}
            />
            <Pressable onPress={() => navigation.navigate("LiveList")} style={{ marginHorizontal: 16, marginBottom: 6, borderRadius: 16, overflow: "hidden" }}>
              <LinearGradient colors={["#F43F5E", "#8B5CF6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 22 }}>🔴</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>البث المباشر</Text>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}>{liveCount > 0 ? `${liveCount} بث جارٍ الآن — انضم` : "ابدأ بثك الأول الآن"}</Text>
                </View>
                <Text style={{ color: "#fff", fontSize: 18 }}>›</Text>
              </LinearGradient>
            </Pressable>
          </View>
        }
        renderItem={({ item, index }) => {
          const p = item.profiles as Profile | undefined;
          const isMine = item.user_id === profile?.id;
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(380)} style={{ paddingHorizontal: 14, marginBottom: 16 }}>
              <GlassCard style={{ padding: 13, gap: 11 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Pressable onPress={() => navigation.navigate("Profile", { screen: "ProfileMain", params: { userId: item.user_id } })}>
                    <Avatar uri={p?.avatar_url} ring size={44} />
                  </Pressable>
                  <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate("Profile", { screen: "ProfileMain", params: { userId: item.user_id } })}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={{ color: "#fff", fontWeight: "700" }} numberOfLines={1}>{p?.full_name ?? "مستخدم"}</Text>
                      {!!p?.is_verified && <Text style={{ color: colors.accent, fontSize: 12 }}>✔︎</Text>}
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>@{p?.username ?? "user"} · {new Date(item.created_at).toLocaleDateString("ar-EG")}</Text>
                  </Pressable>
                  {isMine ? (
                    <Pressable onPress={async () => {
                      Alert.alert("المنشور", "", [
                        { text: "إلغاء", style: "cancel" },
                        { text: "حذف", style: "destructive", onPress: async () => { await supabase.from("posts").delete().eq("id", item.id); load(); } },
                      ]);
                    }}><Text style={{ color: colors.muted, fontSize: 18 }}>⋯</Text></Pressable>
                  ) : (
                    <Pressable onPress={async () => {
                      const { data } = await supabase.rpc("follow_user", { p_target: item.user_id });
                      Alert.alert("", data === "pending" ? "أُرسل طلب المتابعة" : "تمت المتابعة");
                    }}>
                      <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 12 }}>متابعة</Text>
                    </Pressable>
                  )}
                </View>
                {!!item.content && <Text style={{ color: "#F2F2F7", lineHeight: 21, fontSize: 14 }}>{item.content}</Text>}
                {renderMedia(item)}
                <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
                  <Pressable onPress={() => toggleLike(item)} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text style={{ fontSize: 17 }}>{liked[item.id] ? "❤️" : "🤍"}</Text>
                    <Text style={{ color: "#fff", fontSize: 13 }}>{item.like_count ?? 0}</Text>
                  </Pressable>
                  <Pressable onPress={() => setCommentsFor(item.id)} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text style={{ fontSize: 16 }}>💬</Text>
                    <Text style={{ color: "#fff", fontSize: 13 }}>{item.comment_count ?? 0}</Text>
                  </Pressable>
                  <Pressable hitSlop={6} onPress={() => Alert.alert("مشاركة", `socialplus://post/${item.id}`, [{ text: "حسناً" }])} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text style={{ fontSize: 15 }}>↗️</Text>
                    <Text style={{ color: "#fff", fontSize: 13 }}>مشاركة</Text>
                  </Pressable>
                  <Pressable onPress={() => toggleSave(item)} style={{ marginInlineStart: "auto" }} hitSlop={6}>
                    <Text style={{ fontSize: 16, opacity: saved[item.id] ? 1 : 0.6 }}>🔖</Text>
                  </Pressable>
                </View>
              </GlassCard>
            </Animated.View>
          );
        }}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} /> : <Empty text="لا منشورات بعد — أنشئ أول منشور من زر ＋" />}
      />
      <CommentsSheet postId={commentsFor} visible={!!commentsFor} onClose={() => setCommentsFor(null)}
        onCount={(n) => setPosts((l) => l.map((x) => x.id === commentsFor ? { ...x, comment_count: n } : x))} />
    </View>
  );
}
