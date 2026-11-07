import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput } from "react-native";
import { supabase } from "../lib/supabase";
import { Avatar, GlassCard, Input, s } from "../components/ui";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { RootParams } from "../navigation/RootNavigator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Conversation } from "../lib/database.types";

export function ChatsScreen({ navigation }: any) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<"all" | "unread" | "groups">("all");
  const [q, setQ] = useState("");
  const [chats, setChats] = useState<(Conversation & { unread?: number })[]>([]);

  useEffect(() => {
    supabase.from("conversations").select("*").order("updated_at", { ascending: false }).then(({ data }) => setChats((data as any) ?? []));
  }, []);

  const seed = [
    { id: "s1", name: "Sara Mohammed", msg: "أرسلت لك صورة ✨", time: "9:40", unread: 2 },
    { id: "s2", name: "Moaz", msg: "تم تكوين المجموعة", time: "8:15", unread: 0 },
    { id: "s3", name: "Family 👨‍👩‍👧", msg: "متطيق يا ودبيتا", time: "7:50", unread: 0, group: true },
    { id: "s4", name: "Lina", msg: "أُكدوكا في وقت لاحق!", time: "8:30", unread: 0 },
    { id: "s5", name: "Omar", msg: "أرسل لي الملف 📎", time: "أمس", unread: 1 },
    { id: "s6", name: "Reem", msg: "إنها ممتازة! 🔥", time: "الأمس", unread: 0 },
  ];

  const shown = seed
    .filter((c) => (filter === "unread" ? c.unread > 0 : filter === "groups" ? c.group : true))
    .filter((c) => c.name.includes(q));

  return (
    <View style={[s.screen, { paddingTop: 54, paddingHorizontal: 14 }]}>
      <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900", marginBottom: 12 }}>{t("chats")}</Text>
      <Input icon="🔍" placeholder={t("searchPlaceholder")} value={q} onChangeText={setQ} />
      <View style={{ flexDirection: "row", gap: 8, marginVertical: 12 }}>
        {([["all", t("all")], ["unread", t("unread")], ["groups", t("groups")]] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: filter === k ? colors.primary : colors.surface2, borderWidth: 1, borderColor: filter === k ? colors.primary : colors.border }}>
            <Text style={{ color: filter === k ? "#fff" : colors.muted, fontSize: 13, fontWeight: "700" }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={[...chats.map((c) => ({ id: c.id, name: c.title ?? (c.is_group ? "Group" : "Chat"), msg: c.last_message ?? "", time: "", unread: 0, db: true })), ...shown.map((x) => ({ ...x, db: false }))]}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("ChatRoom", { conversationId: item.id, title: item.name })}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}
          >
            <Avatar ring={item.unread > 0} size={50} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>{item.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>{item.msg}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{item.time}</Text>
              {item.unread > 0 && (
                <View style={{ backgroundColor: colors.primary, borderRadius: 10, minWidth: 20, alignItems: "center", paddingHorizontal: 6 }}>
                  <Text style={{ color: "#fff", fontSize: 11 }}>{item.unread}</Text>
                </View>
              )}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
