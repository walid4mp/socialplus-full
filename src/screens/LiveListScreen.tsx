import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, Image, RefreshControl, Alert } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { supabase } from "../lib/supabase";
import { Avatar, Empty, s } from "../components/ui";
import { colors } from "../theme";
import type { LiveRow } from "../lib/database.types";
import { useAppStore } from "../store/useAppStore";

export function LiveListScreen({ navigation }: any) {
  const me = useAppStore((st: any) => st.profile);
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data } = await supabase.rpc("live_streams");
    setRows((data as LiveRow[]) ?? []);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("live-list").on("postgres_changes", { event: "*", schema: "public", table: "streams" }, load).subscribe();
    const t = setInterval(load, 15000);
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, []);

  const goLive = async () => {
    if (!me) return Alert.alert("", "سجّل الدخول أولاً");
    const { data, error } = await supabase.rpc("start_stream", { p_title: `${me.username} مباشر` });
    if (error) return Alert.alert("⚠️", error.message);
    navigation.navigate("LiveStream", { streamId: data });
  };

  return (
    <View style={[s.screen, { paddingTop: 54, paddingHorizontal: 14 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}><Text style={{ color: "#fff", fontSize: 22 }}>‹</Text></Pressable>
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900", flex: 1 }}>🔴 البث المباشر</Text>
        <Pressable onPress={goLive} style={{ backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>بث الآن</Text>
        </Pressable>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(x) => x.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}
        renderItem={({ item }) => (
          <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate("LiveStream", { streamId: item.id })}>
            <View style={{ borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(244,63,94,0.45)", backgroundColor: colors.surface2 }}>
              <LinearGradient colors={["#2A1240", "#0D0E15"]} style={{ height: 130, alignItems: "center", justifyContent: "center" }}>
                <Avatar uri={item.host_avatar} size={62} ring />
              </LinearGradient>
              <View style={{ position: "absolute", top: 8, left: 8, backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>● LIVE</Text>
              </View>
              <View style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>👁 {item.viewer_count}</Text>
              </View>
              <View style={{ padding: 9 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }} numberOfLines={1}>{item.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>@{item.host_username}</Text>
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Empty text="لا يوجد بث مباشر الآن — كن أول من يبث" />}
      />
    </View>
  );
}
