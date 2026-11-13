
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Image, ScrollView, Alert, RefreshControl } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { supabase, uploadMedia } from "../lib/supabase";
import { useAppStore } from "../store/useAppStore";
import { Avatar, GradientButton, Empty, s } from "../components/ui";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { Post, Profile } from "../lib/database.types";

export function ProfileScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const me = useAppStore((st: any) => st.profile);
  const refresh = useAppStore((st: any) => st.refreshProfile);
  const viewId: string | undefined = route?.params?.userId;
  const isMe = !viewId || viewId === me?.id;
  const uid = isMe ? me?.id : viewId;
  const [user, setUser] = useState<Profile | null>(isMe ? me : null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 });
  const [followState, setFollowState] = useState<"none" | "pending" | "following">("none");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!uid) return;
    if (!isMe) {
      const [{ data: prof }, { data: f }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).single(),
        supabase.from("follows").select("status").eq("follower_id", me?.id ?? "").eq("following_id", uid).maybeSingle(),
      ]);
      setUser(prof as Profile);
      setFollowState((f as any)?.status === "accepted" ? "following" : (f as any)?.status === "pending" ? "pending" : "none");
    } else if (me) setUser(me);
    const [{ data: pp }, { data: st }] = await Promise.all([
      supabase.from("posts").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.rpc("profile_stats", { p_user: uid }),
    ]);
    setPosts((pp as Post[]) ?? []);
    const row: any = Array.isArray(st) ? st[0] : st;
    setStats({ followers: Number(row?.followers ?? 0), following: Number(row?.following ?? 0), posts: Number(row?.posts ?? (pp?.length ?? 0)) });
    setRefreshing(false);
  };
  useEffect(() => { load(); }, [uid, me?.id]);

  const pickImage = async (kind: "avatar" | "cover") => {
    if (!isMe || !me) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75, allowsEditing: kind === "avatar", aspect: [1, 1] });
    if (r.canceled || !r.assets?.[0]) return;
    const url = await uploadMedia("media", `${me.id}/${kind}-${Date.now()}.jpg`, r.assets[0].uri);
    if (!url) return Alert.alert("⚠️", "فشل رفع الصورة — تحقّق من bucket «media» وسياساته");
    const { error } = await supabase.from("profiles").update(kind === "avatar" ? { avatar_url: url } : { cover_url: url }).eq("id", me.id);
    if (error) return Alert.alert("⚠️", error.message);
    await refresh(); await load();
    Alert.alert("✅", "تم التحديث");
  };

  const toggleFollow = async () => {
    if (!me || isMe || !user) return;
    if (followState === "none") {
      const { data } = await supabase.rpc("follow_user", { p_target: user.id });
      setFollowState(data === "pending" ? "pending" : "following");
    } else {
      await supabase.rpc("unfollow_user", { p_target: user.id });
      setFollowState("none");
    }
    load();
  };

  const block = () => Alert.alert("حظر المستخدم", `حظر @${user?.username}؟`, [
    { text: "إلغاء", style: "cancel" },
    { text: "حظر", style: "destructive", onPress: async () => {
      await supabase.from("blocks").insert({ blocker_id: me.id, blocked_id: user!.id });
      await supabase.rpc("unfollow_user", { p_target: user!.id });
      Alert.alert("✅", "تم الحظر"); navigation.goBack();
    } },
  ]);

  const report = () => Alert.alert("الإبلاغ", "سبب البلاغ", [
    { text: "إلغاء", style: "cancel" },
    { text: "محتوى مسيء", onPress: async () => { await supabase.from("reports").insert({ reporter_id: me.id, entity_type: "user", entity_id: user!.id, reason: "abuse" }); Alert.alert("✅", "تم إرسال البلاغ"); } },
    { text: "انتحال", onPress: async () => { await supabase.from("reports").insert({ reporter_id: me.id, entity_type: "user", entity_id: user!.id, reason: "impersonation" }); Alert.alert("✅", "تم إرسال البلاغ"); } },
  ]);

  if (!user) return <View style={s.screen}><Empty text="جارٍ التحميل…" /></View>;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}>
      <Pressable onPress={() => pickImage("cover")} >
        {user.cover_url
          ? <Image source={{ uri: user.cover_url }} style={{ width: "100%", height: 160, backgroundColor: colors.surface2 }} resizeMode="cover" />
          : <LinearGradient colors={["#5B67F1", "#8B5CF6", "#00D4FF"]} style={{ width: "100%", height: 160 }} />}
      </Pressable>

      <View style={{ paddingHorizontal: 16, marginTop: -48 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <Pressable onPress={() => pickImage("avatar")}>
            <Avatar uri={user.avatar_url} size={96} ring />
          </Pressable>
          <View style={{ flex: 1, alignItems: "flex-end", paddingBottom: 4 }}>
            {isMe ? (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable onPress={() => navigation.navigate("EditProfile")} style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>تعديل الملف</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate("Settings")} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: "#fff", fontSize: 13 }}>⚙️</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable onPress={toggleFollow} style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: followState === "none" ? colors.primary : colors.surface2, borderWidth: 1, borderColor: followState === "none" ? colors.primary : colors.border }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>
                    {followState === "following" ? "متابَع ✓" : followState === "pending" ? "⏳ طلب مُرسل" : "متابعة"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate("ChatRoom", { title: user.full_name ?? user.username, otherId: user.id })} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13 }}>💬</Text>
                </Pressable>
                <Pressable onPress={block} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13 }}>🚫</Text>
                </Pressable>
                <Pressable onPress={report} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13 }}>🚩</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
          <Text style={{ color: "#fff", fontSize: 19, fontWeight: "900" }}>{user.full_name ?? user.username}</Text>
          {!!user.is_verified && <Text style={{ color: colors.accent, fontSize: 15 }}>✔︎</Text>}
          {!!user.is_private && <Text style={{ color: colors.muted, fontSize: 11 }}>🔒 خاص</Text>}
          {!!user.is_admin && <Text style={{ color: colors.gold, fontSize: 10, fontWeight: "900" }}>ADMIN</Text>}
        </View>
        <Text style={{ color: colors.muted }}>@{user.username}</Text>
        {!!user.bio && <Text style={{ color: "#EAEAF2", marginTop: 8, lineHeight: 20 }}>{user.bio}</Text>}

        <View style={{ flexDirection: "row", marginTop: 16, gap: 10 }}>
          <Pressable style={{ flex: 1, alignItems: "center", backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>{stats.posts}</Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{t("posts")}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("FollowList", { userId: uid, kind: "followers" })}
            style={{ flex: 1, alignItems: "center", backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>{stats.followers}</Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{t("followers")}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("FollowList", { userId: uid, kind: "following" })}
            style={{ flex: 1, alignItems: "center", backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>{stats.following}</Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{t("following")}</Text>
          </Pressable>
        </View>

        {isMe && (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable onPress={() => navigation.navigate("Wallet")} style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border, flexDirection: "row", justifyContent: "center", gap: 8 }}>
              <Text style={{ fontSize: 18 }}>🪙</Text>
              <Text style={{ color: "#fff", fontWeight: "800" }}>{me?.coins ?? 0} {t("coins")}</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate("LiveList")} style={{ flex: 1, backgroundColor: "rgba(244,63,94,0.15)", borderRadius: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(244,63,94,0.4)", flexDirection: "row", justifyContent: "center", gap: 8 }}>
              <Text style={{ fontSize: 18 }}>🔴</Text>
              <Text style={{ color: "#fff", fontWeight: "800" }}>البث المباشر</Text>
            </Pressable>
          </View>
        )}

        <Text style={{ color: "#fff", fontWeight: "900", marginTop: 20, marginBottom: 10 }}>{t("posts")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
          {posts.map((p) => (
            <View key={p.id} style={{ width: "32%", aspectRatio: 1, borderRadius: 12, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {p.media_urls?.[0]
                ? <Image source={{ uri: p.media_urls[0] }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                : <Text style={{ color: colors.muted, padding: 8, fontSize: 11, textAlign: "center" }} numberOfLines={4}>{p.content || "Aa"}</Text>}
              {p.media_urls?.length > 1 && (
                <View style={{ position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 6, paddingHorizontal: 4 }}>
                  <Text style={{ color: "#fff", fontSize: 9 }}>⧉ {p.media_urls.length}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
        {posts.length === 0 && <Empty text="لا منشورات بعد" />}
      </View>
    </ScrollView>
  );
}
