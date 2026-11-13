
import React, { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, Modal, Image, ActivityIndicator } from "react-native";
import { supabase, uploadMedia } from "../lib/supabase";
import { Avatar, s } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { colors } from "../theme";
import type { Message, Profile, Gift } from "../lib/database.types";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

export function ChatRoomScreen({ navigation, route }: any) {
  const params = route?.params ?? {};
  const [conversationId, setConversationId] = useState<string | undefined>(params.conversationId);
  const title: string = params.title ?? "محادثة";
  const otherId: string | undefined = params.otherId;
  const me = useAppStore((st: any) => st.profile);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftOpen, setGiftOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const chRef = useRef<any>(null);

  /* لو لم يوجد conversationId — أنشئ/اجلب محادثة ثنائية */
  useEffect(() => {
    if (conversationId || !otherId) return;
    (async () => {
      const { data, error } = await supabase.rpc("start_conversation", { p_other: otherId });
      if (error) return Alert.alert("⚠️", error.message);
      setConversationId(data);
    })();
  }, [otherId, conversationId]);

  const load = async () => {
    if (!conversationId) return;
    const { data, error } = await supabase
      .from("messages")
      .select("*, profiles:profiles!messages_sender_id_fkey(*)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) { Alert.alert("⚠️", error.message); return; }
    setMsgs((data as Message[]) ?? []);
    if (me) supabase.rpc("mark_read", { p_conv: conversationId }).then(() => {});
  };

  const loadMembers = async () => {
    if (!conversationId) return;
    const { data } = await supabase.from("conversation_members")
      .select("profiles:profiles!conversation_members_user_id_fkey(*)").eq("conversation_id", conversationId);
    setMembers(((data as any) ?? []).map((x: any) => x.profiles).filter(Boolean));
  };

  useEffect(() => {
    load(); loadMembers();
    supabase.from("gifts").select("*").order("price").then(({ data }) => setGifts((data as Gift[]) ?? []));
  }, [conversationId]);

  /* Realtime: رسائل جديدة + مؤشر كتابة */
  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase.channel(`conv-${conversationId}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => load())
      .on("broadcast", { event: "typing" }, (p: any) => {
        if (p.payload?.user && p.payload.user !== me?.id) {
          setPeerTyping(!!p.payload.typing);
          setTimeout(() => setPeerTyping(false), 3500);
        }
      })
      .subscribe();
    chRef.current = ch;
    return () => { if (chRef.current) supabase.removeChannel(chRef.current); };
  }, [conversationId, me?.id]);

  useEffect(() => {
    if (msgs.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }, [msgs.length]);

  const onType = (v: string) => {
    setText(v);
    chRef.current?.send({ type: "broadcast", event: "typing", payload: { typing: true, user: me?.id } });
  };

  const send = async () => {
    if (!conversationId || !text.trim() || !me) return;
    const body = text.trim();
    setText("");
    if (editing) {
      const { error } = await supabase.from("messages").update({ content: body, edited: true }).eq("id", editing);
      setEditing(null);
      if (error) return Alert.alert("⚠️", error.message);
      return load();
    }
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: me.id, content: body, kind: "text", reply_to: replyTo?.id ?? null,
    });
    setSending(false);
    setReplyTo(null);
    if (error) return Alert.alert("⚠️", error.message);
    load();
  };

  const sendMedia = async (kind: "image" | "video" | "file" | "voice", uri: string, name?: string) => {
    if (!conversationId || !me) return;
    setSending(true);
    const ext = uri.split(".").pop()?.split("?")[0] ?? "bin";
    const url = await uploadMedia("media", `chat/${me.id}/${Date.now()}.${ext}`, uri);
    setSending(false);
    if (!url) return Alert.alert("⚠️", "فشل رفع الملف");
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: me.id, kind, media_url: url, content: name ?? "", reply_to: replyTo?.id ?? null,
    });
    setReplyTo(null);
    load();
  };

  const pickImage = async (video: boolean) => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: video ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    sendMedia(video ? "video" : "image", r.assets[0].uri);
  };
  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    sendMedia("file", r.assets[0].uri, r.assets[0].name);
  };
  const pickVoice = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) {
      Alert.alert("رسالة صوتية", "سجّل مقطعاً صوتياً من تطبيق المسجل ثم أرفقه، أو اختر ملفاً صوتياً من الجهاز.");
      return;
    }
    sendMedia("voice", r.assets[0].uri, r.assets[0].name);
  };

  const sendGift = async (gift: Gift) => {
    const other = members.find((m) => m.id !== me?.id);
    if (!me || !other) return Alert.alert("", "لا يمكن إرسال هدية هنا");
    const { error } = await supabase.rpc("send_gift", {
      p_gift_id: gift.id, p_receiver: other.id, p_stream_id: null, p_qty: 1,
      p_idem: `chat-${conversationId}-${Date.now()}`,
    });
    if (error) return Alert.alert("⚠️", error.message === "insufficient coins" ? "رصيد العملات غير كافٍ" : error.message);
    await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: me.id, content: `أرسل ${gift.icon} ${gift.name}`, kind: "gift" });
    setGiftOpen(false);
    useAppStore.getState().refreshProfile();
    load();
  };

  const removeMsg = (m: Message) => Alert.alert("حذف الرسالة", "", [
    { text: "إلغاء", style: "cancel" },
    { text: "حذف", style: "destructive", onPress: async () => { await supabase.from("messages").update({ deleted: true, content: "" }).eq("id", m.id); load(); } },
  ]);

  const bubble = (m: Message) => {
    const mine = m.sender_id === me?.id;
    const sender = m.profiles as Profile | undefined;
    return (
      <Pressable
        onLongPress={() => mine ? Alert.alert("الرسالة", "", [
          { text: "إلغاء", style: "cancel" },
          { text: "تعديل", onPress: () => { setEditing(m.id); setText(m.content); } },
          { text: "حذف", style: "destructive", onPress: () => removeMsg(m) },
        ]) : setReplyTo(m)}
        onPress={() => setReplyTo(m)}
        style={{ alignSelf: mine ? "flex-start" : "flex-end", maxWidth: "82%", marginVertical: 3 }}
      >
        {!mine && !!members.find((x) => x.id === m.sender_id) && members.length > 2 && (
          <Text style={{ color: colors.muted, fontSize: 10, marginBottom: 2 }}>@{sender?.username}</Text>
        )}
        <View style={{
          backgroundColor: mine ? colors.primary : colors.surface2,
          borderRadius: 16, borderTopLeftRadius: mine ? 16 : 4, borderTopRightRadius: mine ? 4 : 16,
          paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: mine ? "transparent" : colors.border,
        }}>
          {!!m.reply_to && <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 10, marginBottom: 3 }}>↩︎ رد على رسالة</Text>}
          {m.deleted ? <Text style={{ color: "rgba(255,255,255,0.6)", fontStyle: "italic", fontSize: 12 }}>حُذفت الرسالة</Text> : (
            <>
              {m.kind === "image" && <Image source={{ uri: m.media_url ?? "" }} style={{ width: 210, height: 210, borderRadius: 12 }} resizeMode="cover" />}
              {m.kind === "video" && (
                <Pressable onPress={() => navigation.navigate("Reels")} style={{ width: 210, height: 140, borderRadius: 12, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 30 }}>▶️</Text>
                </Pressable>
              )}
              {m.kind === "file" && <Text style={{ color: "#fff" }}>📎 {m.content || "ملف"} — اضغط للتنزيل</Text>}
              {m.kind === "voice" && <Text style={{ color: "#fff" }}>🎤 رسالة صوتية</Text>}
              {m.kind === "gift" && <Text style={{ color: "#fff", fontSize: 16 }}>{m.content}</Text>}
              {!!m.content && m.kind === "text" && <Text style={{ color: "#fff", fontSize: 15, lineHeight: 21 }}>{m.content}</Text>}
              <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 3 }}>
                {m.edited && <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 9 }}>مُعدَّلة</Text>}
                <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 9 }}>{new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</Text>
                {mine && <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 9 }}>{(m as any).read_at ? "✓✓" : "✓"}</Text>}
              </View>
            </>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[s.screen, { paddingTop: 46 }]}>
      {/* الهيدر */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(139,92,246,0.18)" }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}><Text style={{ color: "#fff", fontSize: 24 }}>‹</Text></Pressable>
        <Avatar size={40} uri={members.find((m) => m.id !== me?.id)?.avatar_url} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: "900" }} numberOfLines={1}>{title}</Text>
          <Text style={{ color: peerTyping ? colors.accent : colors.muted, fontSize: 11 }}>
            {peerTyping ? "يكتب الآن…" : members.length > 2 ? `${members.length} عضو` : "متصل"}
          </Text>
        </View>
        <Pressable onPress={() => setGiftOpen(true)} hitSlop={8}><Text style={{ fontSize: 20 }}>🎁</Text></Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 12 }}
          renderItem={({ item }) => bubble(item)}
          ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>ابدأ المحادثة…</Text>}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        {!!replyTo && (
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 6, backgroundColor: colors.surface2 }}>
            <Text style={{ color: colors.muted, fontSize: 11, flex: 1 }} numberOfLines={1}>↩︎ {replyTo.content || "مرفق"}</Text>
            <Pressable onPress={() => setReplyTo(null)}><Text style={{ color: colors.danger }}>✕</Text></Pressable>
          </View>
        )}
        {!!editing && (
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "rgba(91,103,241,0.18)" }}>
            <Text style={{ color: "#fff", fontSize: 11, flex: 1 }}>✏️ تعديل رسالة…</Text>
            <Pressable onPress={() => { setEditing(null); setText(""); }}><Text style={{ color: colors.danger }}>✕</Text></Pressable>
          </View>
        )}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 10, paddingBottom: 20, borderTopWidth: 1, borderTopColor: "rgba(139,92,246,0.18)" }}>
          <Pressable onPress={() => pickImage(false)} hitSlop={6}><Text style={{ fontSize: 19 }}>🖼</Text></Pressable>
          <Pressable onPress={() => pickImage(true)} hitSlop={6}><Text style={{ fontSize: 19 }}>🎥</Text></Pressable>
          <Pressable onPress={pickFile} hitSlop={6}><Text style={{ fontSize: 19 }}>📎</Text></Pressable>
          <Pressable onPress={pickVoice} hitSlop={6}><Text style={{ fontSize: 19 }}>🎤</Text></Pressable>
          <TextInput
            value={text} onChangeText={onType} placeholder="اكتب رسالة…" placeholderTextColor={colors.muted} multiline
            style={{ flex: 1, color: "#fff", backgroundColor: colors.surface2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, maxHeight: 110, borderWidth: 1, borderColor: colors.border }}
          />
          <Pressable onPress={send} disabled={sending} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontSize: 17 }}>➤</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={giftOpen} transparent animationType="slide" onRequestClose={() => setGiftOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16, marginBottom: 4 }}>🎁 إرسال هدية</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 12 }}>رصيدك: {me?.coins ?? 0} عملة</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {gifts.map((g) => (
                <Pressable key={g.id} onPress={() => sendGift(g)} style={{ width: "30%", backgroundColor: colors.surface2, borderRadius: 14, padding: 10, alignItems: "center", gap: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 26 }}>{g.icon}</Text>
                  <Text style={{ color: "#fff", fontSize: 11 }}>{g.name}</Text>
                  <Text style={{ color: colors.gold, fontSize: 11, fontWeight: "800" }}>{g.price} 🪙</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setGiftOpen(false)} style={{ marginTop: 14, alignItems: "center", padding: 12, borderRadius: 12, backgroundColor: colors.surface2 }}>
              <Text style={{ color: "#fff" }}>إغلاق</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
