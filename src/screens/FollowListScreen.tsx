import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { supabase } from "../lib/supabase";
import { Avatar, Empty, Input, s } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { colors } from "../theme";
import type { FollowUser } from "../lib/database.types";

export function FollowListScreen({ navigation, route }: any) {
  const userId: string = route?.params?.userId;
  const kind: "followers" | "following" = route?.params?.kind ?? "followers";
  const me = useAppStore((st: any) => st.profile);
  const [rows, setRows] = useState<FollowUser[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data } = await supabase.rpc("follow_list", { p_user: userId, p_kind: kind });
    setRows((data as FollowUser[]) ?? []);
  };
  useEffect(() => { load(); }, [userId, kind]);

  const toggle = async (u: FollowUser) => {
    setBusy(u.id);
    if (u.is_following) await supabase.rpc("unfollow_user", { p_target: u.id });
    else await supabase.rpc("follow_user", { p_target: u.id });
    setBusy(null);
    load();
  };

  const shown = rows.filter((u) => (u.username ?? "").toLowerCase().includes(q.toLowerCase()) || (u.full_name ?? "").includes(q));

  return (
    <View style={[s.screen, { paddingTop: 54, paddingHorizontal: 14 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}><Text style={{ color: "#fff", fontSize: 22 }}>‹</Text></Pressable>
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900", flex: 1 }}>
          {kind === "followers" ? `المتابعون (${rows.length})` : `المتابعة (${rows.length})`}
        </Text>
      </View>
      <Input icon="🔍" placeholder="ابحث في القائمة" value={q} onChangeText={setQ} />
      <FlatList
        style={{ marginTop: 12 }}
        data={shown}
        keyExtractor={(x) => x.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 }}>
            <Pressable onPress={() => navigation.navigate("Profile", { screen: "ProfileMain", params: { userId: item.id } })}>
              <Avatar uri={item.avatar_url} size={48} />
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate("Profile", { screen: "ProfileMain", params: { userId: item.id } })}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text style={{ color: "#fff", fontWeight: "700" }} numberOfLines={1}>{item.full_name ?? item.username}</Text>
                {!!item.is_verified && <Text style={{ color: colors.accent, fontSize: 12 }}>✔︎</Text>}
                {!!item.is_private && <Text style={{ color: colors.muted, fontSize: 10 }}>🔒</Text>}
              </View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>@{item.username}</Text>
            </Pressable>
            {me?.id !== item.id && (
              <Pressable
                disabled={busy === item.id}
                onPress={() => toggle(item)}
                style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: item.is_following ? colors.surface2 : colors.primary, borderWidth: 1, borderColor: item.is_following ? colors.border : colors.primary }}
              >
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{busy === item.id ? "…" : item.is_following ? "متابَع" : "متابعة"}</Text>
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={<Empty text={kind === "followers" ? "لا يوجد متابعون بعد" : "لا يتابع أحداً بعد"} />}
      />
    </View>
  );
}
