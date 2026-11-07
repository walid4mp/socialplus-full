import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { Avatar, s } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { RootParams } from "../navigation/RootNavigator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Message, Profile } from "../lib/database.types";

export function ChatRoomScreen({ navigation }: NativeStackScreenProps<RootParams, "ChatRoom">) {
  const { t } = useI18n();
  const route = (navigation.getState().routes.at(-1)?.params ?? {}) as any;
  const conversationId: string = route.conversationId ?? "demo";
  const title: string = route.title ?? "Chat";
  const me = useAppStore((st) => st.profile);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`conv-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId]);

  const load = async () => {
    const { data } = await supabase
      .from("messages")
      .select("*, profiles:profiles!messages_sender_id_fkey(*)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setMsgs((data as Message[]) ?? []);
  };

  const send = async () => {
    if (!text.trim() || !me) return;
    if (editing) {
      await supabase.from("messages").update({ content: text, edited: true }).eq("id", editing);
      setEditing(null);
    } else {
      await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: me.id, content: text, kind: "text" });
    }
    setText("");
    load();
  };

  const del = (m: Message) =>
    Alert.alert("", "حذف الرسالة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => { await supabase.from("messages").update({ deleted: true }).eq("id", m.id); load(); } },
    ]);

  const call = (video: boolean) => navigation.navigate(video ? "VideoCall" : "AudioCall", { name: title });

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: 54, paddingHorizontal: 14, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface }}>
        <Pressable onPress={() => navigation.goBack()}><Text style={{ color: "#fff", fontSize: 22 }}>‹</Text></Pressable>
        <Avatar size={38} />
        <Text style={{ color: "#fff", fontWeight: "800", flex: 1 }}>{title}</Text>
        <Pressable onPress={() => call(false)}><Text style={{ fontSize: 20 }}>📞</Text></Pressable>
        <Pressable onPress={() => call(true)}><Text style={{ fontSize: 20 }}>🎥</Text></Pressable>
      </View>

      <FlatList
        style={{ flex: 1, paddingHorizontal: 12 }}
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingVertical: 12, gap: 8 }}
        renderItem={({ item }) => {
          const mine = item.sender_id === me?.id;
          if (item.deleted) return <Text style={{ color: colors.muted, alignSelf: "center", fontSize: 12 }}>🚫 تم حذف رسالة</Text>;
          return (
            <Pressable onLongPress={() => mine && del(item)} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", backgroundColor: mine ? colors.primary : colors.surface2, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 }}>
              <Text style={{ color: "#fff" }}>{item.content}</Text>
              {item.edited && <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }}>معدّلة</Text>}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>ابدأ المحادثة…</Text>}
      />

      <View style={{ padding: 12, flexDirection: "row", gap: 8 }}>
        <Pressable><Text style={{ fontSize: 22, alignSelf: "center" }}>📎</Text></Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t("typeMessage")}
          placeholderTextColor={colors.muted}
          style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 16, height: 46, color: "#fff" }}
        />
        <Pressable onPress={send} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 18 }}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
