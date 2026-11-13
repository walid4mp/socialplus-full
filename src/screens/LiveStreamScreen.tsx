
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, FlatList, Alert, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { supabase, SUPABASE_URL } from "../lib/supabase";
import { Avatar } from "../components/ui";
import { LiveKitRoom } from "../components/LiveKitRoom";
import { useAppStore } from "../store/useAppStore";
import { colors } from "../theme";
import type { Gift, LiveMessage, LiveRow, Stream } from "../lib/database.types";

export function LiveStreamScreen({ navigation, route }: any) {
  const streamId: string | undefined = route?.params?.streamId;
  const me = useAppStore((st: any) => st.profile);
  const [stream, setStream] = useState<Stream | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [chat, setChat] = useState<LiveMessage[]>([]);
  const [msg, setMsg] = useState("");
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftOpen, setGiftOpen] = useState(false);
  const [token, setToken] = useState<{ token: string; url: string } | null>(null);
  const [rtcState, setRtcState] = useState<"init" | "ready" | "needs_key" | "error">("init");
  const listRef = useRef<FlatList>(null);

  const loadStream = async () => {
    if (!streamId) return;
    const { data } = await supabase.from("streams").select("*").eq("id", streamId).maybeSingle();
    const st = data as Stream | undefined;
    setStream(st ?? null);
    const host = !!st && st.host_id === me?.id;
    setIsHost(host);
    if (st?.status === "ended" && !host) {
      Alert.alert("انتهى البث", "أوقف المضيف هذا البث.", [{ text: "حسناً", onPress: () => navigation.goBack() }]);
    }
    /* توكن LiveKit من Edge Function */
    try {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/livekit-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt ?? ""}` },
        body: JSON.stringify({ room: `stream-${streamId}`, identity: `${me?.id ?? "guest"}-${Math.random().toString(36).slice(2, 7)}`, isHost: host }),
      });
      const js: any = await res.json().catch(() => ({}));
      if (js?.token && js?.url) { setToken({ token: js.token, url: js.url }); setRtcState("ready"); }
      else setRtcState("needs_key");
    } catch { setRtcState("error"); }
  };

  useEffect(() => {
    loadStream();
    if (!streamId) return;
    supabase.rpc("stream_join", { p_stream: streamId }).then(() => {});
    supabase.from("live_messages").select("*, profiles:profiles!live_messages_user_id_fkey(*)")
      .eq("stream_id", streamId).order("created_at", { ascending: true }).limit(100)
      .then(({ data }) => setChat((data as LiveMessage[]) ?? []));
    supabase.from("gifts").select("*").order("price").then(({ data }) => setGifts((data as Gift[]) ?? []));

    const ch: any = (supabase.channel(`live-${streamId}`) as any)
      .on("postgres_changes", { event: "insert", schema: "public", table: "live_messages", filter: `stream_id=eq.${streamId}` },
        (p: any) => setChat((c) => [...c, p.new as LiveMessage]))
      .on("postgres_changes", { event: "update", schema: "public", table: "streams", filter: `id=eq.${streamId}` },
        (p: any) => setStream(p.new as Stream))
      .subscribe();

    const poll = setInterval(async () => {
      const { data } = await supabase.from("streams").select("*").eq("id", streamId).maybeSingle();
      if (data) setStream(data as Stream);
    }, 8000);

    return () => { clearInterval(poll); supabase.removeChannel(ch); supabase.rpc("stream_leave", { p_stream: streamId }).then(() => {}); };
  }, [streamId, me?.id]);

  const sendMsg = async () => {
    if (!msg.trim() || !streamId) return;
    const body = msg.trim();
    setMsg("");
    const { error } = await supabase.rpc("stream_comment", { p_stream: streamId, p_content: body });
    if (error) Alert.alert("⚠️", error.message);
  };

  const sendGift = async (g: Gift) => {
    if (!streamId || !stream?.host_id) return;
    const { error } = await supabase.rpc("send_gift", {
      p_gift_id: g.id, p_receiver: stream.host_id, p_stream_id: streamId, p_qty: 1,
      p_idem: `live-${streamId}-${Date.now()}`,
    });
    if (error) return Alert.alert("⚠️", error.message === "insufficient coins" ? "رصيد غير كافٍ" : error.message);
    await supabase.rpc("stream_comment", { p_stream: streamId, p_content: `🎁 أرسل ${g.icon} ${g.name}` });
    setGiftOpen(false);
    useAppStore.getState().refreshProfile();
    setStream((s) => s ? { ...s, coin_count: (s.coin_count ?? 0) + g.price } : s);
  };

  const endStream = async () => {
    if (!streamId) return;
    Alert.alert("إنهاء البث", "هل تريد إنهاء البث الآن؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "إنهاء", style: "destructive", onPress: async () => {
        const { error } = await supabase.rpc("stream_end", { p_stream: streamId });
        if (error) return Alert.alert("⚠️", error.message);
        navigation.goBack();
      } },
    ]);
  };

  if (!streamId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 17 }}>ابدأ بثاً مباشراً</Text>
        <Pressable onPress={async () => {
          const { data, error } = await supabase.rpc("start_stream", { p_title: `${me?.username ?? "أنا"} مباشر` });
          if (error) return Alert.alert("⚠️", error.message);
          navigation.setParams?.({ streamId: data });
          navigation.replace?.("LiveStream", { streamId: data });
        }} style={{ backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13 }}>
          <Text style={{ color: "#fff", fontWeight: "900" }}>🔴 بدء البث</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* الفيديو الحقيقي عبر LiveKit */}
      {token && rtcState === "ready"
        ? <LiveKitRoom url={token.url} token={token.token} publish={isHost} />
        : (
          <LinearGradient colors={["#241033", "#0D0E15"]} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
            {rtcState === "init" ? <ActivityIndicator color={colors.accent} size="large" /> : (
              <>
                <Text style={{ fontSize: 40 }}>📡</Text>
                <Text style={{ color: "#fff", fontWeight: "800" }}>الفيديو الحي يحتاج مفاتيح LiveKit</Text>
                <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", paddingHorizontal: 30 }}>
                  أضِف LIVEKIT_URL وLIVEKIT_API_KEY وLIVEKIT_API_SECRET في Supabase → Edge Functions → Secrets، ثم انشر دالة livekit-token.
                  الدردشة والهدايا وعدّاد المشاهدين تعمل الآن.
                </Text>
              </>
            )}
          </LinearGradient>
        )}

      {/* شريط علوي */}
      <View style={{ position: "absolute", top: 46, left: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(13,14,21,0.72)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Avatar uri={stream?.profiles?.avatar_url} size={26} />
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>@{stream?.profiles?.username ?? "host"}</Text>
        </View>
        <View style={{ backgroundColor: "rgba(244,63,94,0.9)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>● LIVE</Text>
        </View>
        <View style={{ backgroundColor: "rgba(13,14,21,0.72)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>👁 {stream?.viewer_count ?? 0}</Text>
        </View>
        <View style={{ backgroundColor: "rgba(245,158,11,0.9)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>🪙 {stream?.coin_count ?? 0}</Text>
        </View>
        <View style={{ flex: 1 }} />
        {isHost ? (
          <Pressable onPress={endStream} style={{ backgroundColor: "rgba(244,63,94,0.92)", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>إنهاء</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => navigation.goBack()} style={{ backgroundColor: "rgba(13,14,21,0.72)", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>خروج</Text>
          </Pressable>
        )}
      </View>

      {/* دردشة مباشرة + إدخال */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: 16 }}>
        <FlatList
          ref={listRef}
          data={chat.slice(-40)}
          keyExtractor={(x, i) => x.id ?? String(i)}
          style={{ maxHeight: 190, paddingHorizontal: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={{ flexDirection: "row", gap: 6, backgroundColor: "rgba(13,14,21,0.55)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 4, alignSelf: "flex-start", maxWidth: "88%" }}>
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "800" }}>@{item.profiles?.username ?? "user"}</Text>
              <Text style={{ color: "#fff", fontSize: 11, flexShrink: 1 }}>{item.content}</Text>
            </View>
          )}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 8 }}>
          <TextInput
            value={msg} onChangeText={setMsg} placeholder="علّق على البث…" placeholderTextColor={colors.muted}
            onSubmitEditing={sendMsg}
            style={{ flex: 1, color: "#fff", backgroundColor: "rgba(28,30,46,0.9)", borderRadius: 999, paddingHorizontal: 15, height: 42, borderWidth: 1, borderColor: "rgba(139,92,246,0.35)" }}
          />
          <Pressable onPress={sendMsg} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff" }}>➤</Text>
          </Pressable>
          <Pressable onPress={() => setGiftOpen(true)} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(245,158,11,0.9)", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 19 }}>🎁</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={giftOpen} transparent animationType="slide" onRequestClose={() => setGiftOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>🎁 هدايا البث</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginVertical: 8 }}>رصيدك: {me?.coins ?? 0} عملة</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {gifts.map((g) => (
                <Pressable key={g.id} onPress={() => sendGift(g)} style={{ width: "30%", backgroundColor: colors.surface2, borderRadius: 14, padding: 10, alignItems: "center", gap: 2, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 25 }}>{g.icon}</Text>
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
