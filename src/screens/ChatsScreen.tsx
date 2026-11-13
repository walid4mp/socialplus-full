
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, Modal, RefreshControl, Alert, ActivityIndicator } from "react-native";
import { useAppStore } from "../store/useAppStore";
import { supabase } from "../lib/supabase";
import { Avatar, Input, Empty, s } from "../components/ui";
import { colors } from "../theme";
import type { ConversationRow, Profile } from "../lib/database.types";

export function ChatsScreen({ navigation }: any) {
  const me = useAppStore((st: any) => st.profile);
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "groups">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [people, setPeople] = useState<Profile[]>([]);
  const [pq, setPq] = useState("");

  const load = async () => {
    const { data, error } = await supabase.rpc("my_conversations");
    if (error) setErr(error.message); else { setErr(null); setRows((data as ConversationRow[]) ?? []); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("chats-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const openPeople = async () => {
    setPeopleOpen(true);
    const { data } = await supabase.from("profiles").select("*").neq("id", me?.id ?? "").limit(50);
    setPeople((data as Profile[]) ?? []);
  };

  const startWith = async (other: Profile) => {
    const { data, error } = await supabase.rpc("start_conversation", { p_other: other.id });
    if (error) return Alert.alert("⚠️", error.message);
    setPeopleOpen(false);
    navigation.navigate("ChatRoom", { conversationId: data, title: other.full_name ?? other.username, otherId: other.id });
  };

  const createGroup = async () => {
    if (!me || !groupName.trim()) return;
    const { data: conv, error } = await supabase.from("conversations").insert({ is_group: true, title: groupName.trim() }).select().single();
    if (error || !conv) return Alert.alert("⚠️", error?.message ?? "فشل");
    await supabase.from("conversation_members").insert({ conversation_id: conv.id, user_id: me.id });
    setGroupName(""); setGroupOpen(false); load();
    navigation.navigate("ChatRoom", { conversationId: conv.id, title: groupName.trim() });
  };

  const shown = rows
    .filter((c) => (filter === "unread" ? c.unread > 0 : filter === "groups" ? c.is_group : true))
    .filter((c) => (c.title ?? c.other_name ?? c.other_username ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <View style={[s.screen, { paddingTop: 54, paddingHorizontal: 14 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Text style={{ color: "#fff", fontSize: 23, fontWeight: "900", flex: 1 }}>المحادثات</Text>
        <Pressable onPress={openPeople} style={{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>✏️ جديدة</Text>
        </Pressable>
        <Pressable onPress={() => setGroupOpen(true)} style={{ backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>＋ مجموعة</Text>
        </Pressable>
      </View>

      <Input icon="🔍" placeholder="ابحث في محادثاتك..." value={q} onChangeText={setQ} />
      <View style={{ flexDirection: "row", gap: 8, marginVertical: 12 }}>
        {([["all", "الكل"], ["unread", "غير مقروء"], ["groups", "المجموعات"]] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: filter === k ? colors.primary : colors.surface2, borderWidth: 1, borderColor: filter === k ? colors.primary : colors.border }}>
            <Text style={{ color: filter === k ? "#fff" : colors.muted, fontSize: 13, fontWeight: "700" }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {!!err && (
        <View style={{ backgroundColor: "rgba(244,63,94,0.12)", borderColor: colors.danger, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 10 }}>
          <Text style={{ color: colors.danger, fontSize: 12 }}>تعذر تحميل المحادثات: {err}</Text>
        </View>
      )}

      <FlatList
        data={shown}
        keyExtractor={(x) => x.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
        renderItem={({ item }) => {
          const name = item.is_group ? item.title ?? "مجموعة" : item.other_name ?? item.other_username ?? "محادثة";
          return (
            <Pressable onPress={() => navigation.navigate("ChatRoom", { conversationId: item.id, title: name, otherId: item.other_id })}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 }}>
              <Avatar ring={item.unread > 0} size={50} uri={item.other_avatar} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "700" }} numberOfLines={1}>{name}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>{item.last_message ?? "ابدأ المحادثة…"}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 5 }}>
                <Text style={{ color: colors.muted, fontSize: 10 }}>
                  {item.updated_at ? new Date(item.updated_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : ""}
                </Text>
                {item.unread > 0 && (
                  <View style={{ backgroundColor: colors.primary, borderRadius: 10, minWidth: 20, alignItems: "center", paddingHorizontal: 6 }}>
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{item.unread > 99 ? "99+" : item.unread}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} /> : <Empty text="لا توجد محادثات — اضغط «جديدة» لبدء محادثة" />}
      />

      {/* اختيار شخص */}
      <Modal visible={peopleOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", paddingTop: 70, paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 22, padding: 16, flex: 1, marginBottom: 40 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16, flex: 1 }}>اختر مستخدماً</Text>
              <Pressable onPress={() => setPeopleOpen(false)}><Text style={{ color: colors.muted }}>إغلاق</Text></Pressable>
            </View>
            <Input icon="🔍" placeholder="اسم المستخدم" value={pq} onChangeText={setPq} />
            <FlatList
              style={{ marginTop: 10 }}
              data={people.filter((p) => p.username.includes(pq) || (p.full_name ?? "").includes(pq))}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <Pressable onPress={() => startWith(item)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 }}>
                  <Avatar uri={item.avatar_url} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>{item.full_name ?? item.username}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>@{item.username}</Text>
                  </View>
                  <Text style={{ color: colors.accent, fontSize: 18 }}>›</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Empty text="لا نتائج" />}
            />
          </View>
        </View>
      </Modal>

      {/* مجموعة جديدة */}
      <Modal visible={groupOpen} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 30 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, alignSelf: "stretch", gap: 12 }}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>اسم المجموعة</Text>
            <TextInput value={groupName} onChangeText={setGroupName} placeholder="مثال: الأصدقاء" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface2, borderRadius: 12, height: 46, paddingHorizontal: 12, color: "#fff" }} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setGroupOpen(false)} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.surface2, alignItems: "center" }}><Text style={{ color: "#fff" }}>إلغاء</Text></Pressable>
              <Pressable onPress={createGroup} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>إنشاء</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
