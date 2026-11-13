
import React, { useEffect, useState } from "react";
import { View, Text, Modal, FlatList, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import { Avatar } from "./ui";
import { colors } from "../theme";
import { useAppStore } from "../store/useAppStore";
import type { CommentRow } from "../lib/database.types";

export function CommentsSheet({ postId, visible, onClose, onCount }: { postId: string | null; visible: boolean; onClose: () => void; onCount?: (n: number) => void }) {
  const me = useAppStore((st: any) => st.profile);
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!postId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("comments")
      .select("*, profiles:profiles!comments_user_id_fkey(*)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (!error) { setRows((data as CommentRow[]) ?? []); onCount?.((data as any[])?.length ?? 0); }
    setLoading(false);
  };
  useEffect(() => { if (visible) load(); }, [postId, visible]);

  const send = async () => {
    if (!postId || !text.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("add_comment", { p_post: postId, p_content: text.trim() });
    setBusy(false);
    if (error) return Alert.alert("⚠️", error.message);
    setText("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.rpc("delete_comment", { p_id: id });
    if (error) return Alert.alert("⚠️", error.message);
    load();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, maxHeight: "80%" }}>
            <View style={{ alignItems: "center", marginBottom: 6 }}>
              <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            <Text style={{ color: "#fff", fontWeight: "900", textAlign: "center", marginBottom: 8 }}>التعليقات ({rows.length})</Text>
            {loading ? <ActivityIndicator color={colors.accent} style={{ margin: 20 }} /> : (
              <FlatList
                data={rows}
                keyExtractor={(x) => x.id}
                style={{ paddingHorizontal: 16, maxHeight: 360 }}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: "row", gap: 10, paddingVertical: 8 }}>
                    <Avatar uri={item.profiles?.avatar_url} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                        {item.profiles?.full_name ?? item.profiles?.username ?? "مستخدم"}
                        <Text style={{ color: colors.muted, fontWeight: "400", fontSize: 11 }}>  @{item.profiles?.username}</Text>
                      </Text>
                      <Text style={{ color: "#EAEAF2", fontSize: 14, marginTop: 2 }}>{item.content}</Text>
                    </View>
                    {item.user_id === me?.id && (
                      <Pressable onPress={() => remove(item.id)} hitSlop={8}><Text style={{ color: colors.muted }}>🗑</Text></Pressable>
                    )}
                  </View>
                )}
                ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", paddingVertical: 24 }}>لا تعليقات بعد — كن الأول</Text>}
              />
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, paddingBottom: 24 }}>
              <Avatar uri={me?.avatar_url} size={38} />
              <TextInput
                value={text} onChangeText={setText} placeholder="أضف تعليقاً…" placeholderTextColor={colors.muted}
                style={{ flex: 1, color: "#fff", backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 16, height: 44, borderWidth: 1, borderColor: colors.border }}
              />
              <Pressable onPress={send} disabled={busy} style={{ backgroundColor: colors.primary, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontSize: 18 }}>{busy ? "…" : "➤"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
