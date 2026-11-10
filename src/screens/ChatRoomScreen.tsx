import React, { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, Modal } from "react-native";
import { supabase, uploadMedia } from "../lib/supabase";
import { Avatar, s } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { Message, Profile } from "../lib/database.types";
import { useAudioRecorder, useAudioPlayer, AudioModule } from "expo-audio";
import * as ImagePicker from "expo-image-picker";

export function ChatRoomScreen({ navigation }: any) {
  const { t } = useI18n();
  const route = (navigation.getState().routes.at(-1)?.params ?? {}) as any;
  const conversationId: string = route.conversationId ?? "demo";
  const title: string = route.title ?? "Chat";
  const me = useAppStore((st: any) => st.profile);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typing, setTyping] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addUser, setAddUser] = useState("");
  const [recording, setRecording] = useState(false);
  const recorder = useAudioRecorder({ extension: "m4a", sampleRate: 44100, numberOfChannels: 1, bitRate: 128000, output: "mp4" } as any);
  const listRef = useRef<FlatList>(null);

  useEffect(() => { load(); loadMembers(); }, [conversationId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`conv-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => { load(); })
      .on("broadcast", { event: "typing" }, (p: any) => setTyping(!!p.payload?.typing))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId]);

  const load = async () => {
    const { data } = await supabase
      .from("messages")
      .select("*, profiles:profiles!messages_sender_id_fkey(*)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setMsgs((data as Message[]) ?? []);
    if (me) supabase.rpc("mark_read", { p_conv: conversationId }).then(() => {});
  };
  const loadMembers = async () => {
    const { data } = await supabase.from("conversation_members").select("profiles:profiles!conversation_members_user_id_fkey(*)").eq("conversation_id", conversationId);
    setMembers(((data as any) ?? []).map((x: any) => x.profiles));
  };

  const onType = (v: string) => {
    setText(v);
    supabase.channel(`conv-${conversationId}`).send({ type: "broadcast", event: "typing", payload: { typing: true } });
  };

  const send = async () => {
    if (!text.trim() || !me) return;
    if (editing) {
      await supabase.from("messages").update({ content: text, edited: true }).eq("id", editing);
      setEditing(null);
    } else {
      await supabase.from("messages").insert({
        conversation_id: conversationId, sender_id: me.id, content: text, kind: "text",
        reply_to: replyTo?.id ?? null,
      });
      setReplyTo(null);
    }
    setText("");
    load();
  };

  const attachImage = async () => {
    if (!me) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (r.canceled) return;
    const url = await uploadMedia("media", `chat/${me.id}/${Date.now()}.jpg`, r.assets[0].uri);
    if (!url) return Alert.alert("⚠️", "فشل إرفاق الصورة");
    await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: me.id, content: "📷 صورة", kind: "image", media_url: url });
    load();
  };

  const startRec = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return Alert.alert("⚠️", "صلاحية الميكروفون مطلوبة");
      recorder.record();
      setRecording(true);
    } catch { Alert.alert("⚠️", "تعذر بدء التسجيل"); }
  };
  const stopRec = async () => {
    try {
      await recorder.stop();
      setRecording(false);
      const uri = recorder.uri;
      if (!uri || !me) return;
      const url = await uploadMedia("media", `chat/${me.id}/voice-${Date.now()}.m4a`, uri);
      if (!url) return Alert.alert("⚠️", "فشل حفظ الرسالة الصوتية");
      await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: me.id, content: "🎤 رسالة صوتية", kind: "voice", media_url: url });
      load();
    } catch { setRecording(false); }
  };

  const react = (m: Message) =>
    Alert.alert("تفاعل", "اختر تفاعلك", [
      ...["❤️", "😂", "👍", "🔥"].map((e) => ({ text: e, onPress: async () => { await supabase.from("message_reactions").insert({ message_id: m.id, user_id: me.id, emoji: e }); load(); } })),
      { text: "إلغاء", style: "cancel" as const },
    ]);

  const editOrDel = (m: Message) => {
    if (m.sender_id !== me?.id) return react(m);
    Alert.alert("", "", [
      { text: "رد", onPress: () => setReplyTo(m) },
      { text: "تعديل", onPress: () => { setEditing(m.id); setText(m.content); } },
      { text: "حذف", style: "destructive", onPress: async () => { await supabase.from("messages").update({ deleted: true }).eq("id", m.id); load(); } },
      { text: "إلغاء", style: "cancel" },
    ]);
  };

  const addMember = async () => {
    const uname = addUser.trim().replace(/^@/, "");
    if (!uname) return;
    const { data: u } = await supabase.from("profiles").select("id").eq("username", uname).single();
    if (!u) return Alert.alert("⚠️", "المستخدم غير موجود");
    await supabase.from("conversation_members").insert({ conversation_id: conversationId, user_id: u.id }).then(() => {});
    await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: me!.id, content: `تمت إضافة @${uname} إلى المجموعة`, kind: "text" });
    setAddUser(""); setAddOpen(false);
    loadMembers();
  };

  const call = (video: boolean) => navigation.navigate(video ? "VideoCall" : "AudioCall", { name: title });

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: 54, paddingHorizontal: 14, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface }}>
        <Pressable onPress={() => navigation.goBack()}><Text style={{ color: "#fff", fontSize: 22 }}>‹</Text></Pressable>
        <Avatar size={38} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>{title}</Text>
          <Text style={{ color: typing ? colors.accent : colors.muted, fontSize: 11 }}>{typing ? "يكتب الآن…" : `${members.length} عضو`}</Text>
        </View>
        <Pressable onPress={() => setAddOpen(true)}><Text style={{ fontSize: 18 }}>➕</Text></Pressable>
        <Pressable onPress={() => call(false)}><Text style={{ fontSize: 20 }}>📞</Text></Pressable>
        <Pressable onPress={() => call(true)}><Text style={{ fontSize: 20 }}>🎥</Text></Pressable>
      </View>

      <FlatList
        ref={listRef}
        style={{ flex: 1, paddingHorizontal: 12 }}
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingVertical: 12, gap: 8 }}
        renderItem={({ item }) => {
          const mine = item.sender_id === me?.id;
          if (item.deleted) return <Text style={{ color: colors.muted, alignSelf: "center", fontSize: 12 }}>🚫 تم حذف رسالة</Text>;
          const replyMsg = item.reply_to ? msgs.find((x) => x.id === item.reply_to) : null;
          return (
            <Pressable onLongPress={() => editOrDel(item)} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", backgroundColor: mine ? colors.primary : colors.surface2, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 }}>
              {replyMsg && <View style={{ borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: 6, marginBottom: 4 }}><Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{replyMsg.content}</Text></View>}
              {item.kind === "image" && item.media_url ? <Image source={{ uri: item.media_url }} style={{ width: 200, height: 140, borderRadius: 10, marginBottom: 4 }} /> : null}
              {item.kind === "voice" && item.media_url ? <VoiceBubble uri={item.media_url} mine={mine} /> : null}
              {item.kind !== "image" && item.kind !== "voice" && <Text style={{ color: "#fff" }}>{item.content}</Text>}
              <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 9, alignSelf: "flex-end" }}>{item.edited ? "معدّلة · " : ""}{item.read_at ? "✓✓" : "✓"}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>ابدأ المحادثة…</Text>}
      />

      {replyTo && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
          <View style={{ backgroundColor: colors.surface2, borderRadius: 10, padding: 8, flexDirection: "row" }}>
            <Text style={{ color: colors.muted, flex: 1, fontSize: 12 }} numberOfLines={1}>↩️ {replyTo.content}</Text>
            <Pressable onPress={() => setReplyTo(null)}><Text style={{ color: colors.danger }}>✕</Text></Pressable>
          </View>
        </View>
      )}

      <View style={{ padding: 12, flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Pressable onPress={attachImage}><Text style={{ fontSize: 22 }}>📎</Text></Pressable>
        <Pressable onPressIn={startRec} onPressOut={stopRec} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: recording ? colors.danger : colors.surface2, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16 }}>{recording ? "⏺" : "🎤"}</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={onType}
          placeholder={t("typeMessage")}
          placeholderTextColor={colors.muted}
          style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 16, height: 46, color: "#fff" }}
        />
        <Pressable onPress={send} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 18 }}>➤</Text>
        </Pressable>
      </View>

      <Modal visible={addOpen} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 30 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, alignSelf: "stretch", gap: 12 }}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>إضافة عضو (اسم المستخدم)</Text>
            <TextInput value={addUser} onChangeText={setAddUser} placeholder="@username" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface2, borderRadius: 12, height: 46, paddingHorizontal: 12, color: "#fff" }} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setAddOpen(false)} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.surface2, alignItems: "center" }}><Text style={{ color: "#fff" }}>إلغاء</Text></Pressable>
              <Pressable onPress={addMember} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>إضافة</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

import { Image } from "react-native";

function VoiceBubble({ uri, mine }: { uri: string; mine: boolean }) {
  const player = useAudioPlayer(uri);
  return (
    <Pressable onPress={() => player.play()} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
      <Text style={{ fontSize: 20 }}>▶️</Text>
      <Text style={{ color: mine ? "#fff" : "#fff", fontSize: 12 }}>🎤 رسالة صوتية</Text>
    </Pressable>
  );
}
