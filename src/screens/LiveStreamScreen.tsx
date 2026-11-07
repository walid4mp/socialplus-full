import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { supabase } from "../lib/supabase";
import { Avatar, GradientButton, s } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { RootParams } from "../navigation/RootNavigator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

const chatSeed = [
  { u: "Linda", m: "مرحباً 💜" },
  { u: "Khaled", m: "الجودة ممتازة!" },
  { u: "Sara", m: "أرسل هدية 🎁" },
  { u: "Ali", m: "متابعة جديدة ✨" },
];

export function LiveStreamScreen({ navigation }: NativeStackScreenProps<RootParams, "LiveStream">) {
  const { t } = useI18n();
  const me = useAppStore((st) => st.profile);
  const [chat, setChat] = useState(chatSeed);
  const [msg, setMsg] = useState("");
  const [hearts, setHearts] = useState<number[]>([]);

  const send = () => {
    if (!msg.trim() || !me) return;
    setChat((c) => [...c, { u: me.username, m: msg }]);
    setMsg("");
  };
  const heart = () => setHearts((h) => [...h, Date.now()]);

  return (
    <LinearGradient colors={["#160b12", "#0d0e15"]} style={s.screen}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 76 }}>📡</Text>
        <Text style={{ color: colors.muted }}>بث الفيديو الحي يتطلب Agora/LiveKit (EAS build)</Text>
      </View>

      <View style={{ position: "absolute", top: 64, insetInlineStart: 16, flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>● {t("live")}</Text>
        </View>
        <View style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: "#fff", fontSize: 12 }}>👁 12.4K {t("viewers")}</Text>
        </View>
      </View>
      <Pressable onPress={() => navigation.goBack()} style={{ position: "absolute", top: 64, insetInlineEnd: 16 }}>
        <Text style={{ color: "#fff", fontSize: 22 }}>✕</Text>
      </Pressable>

      {hearts.map((h) => (
        <Animated.Text key={h} entering={FadeIn.duration(400)} exiting={FadeIn} style={{ position: "absolute", bottom: 220, insetInlineEnd: 30, fontSize: 30 }}>❤️</Animated.Text>
      ))}

      <Animated.View entering={FadeInDown.duration(500)} style={{ paddingHorizontal: 14, paddingBottom: 20, gap: 10 }}>
        <FlatList
          data={chat}
          keyExtractor={(_, i) => String(i)}
          style={{ maxHeight: 170 }}
          renderItem={({ item }) => (
            <Text style={{ color: "#fff", marginBottom: 6 }}>
              <Text style={{ color: colors.accent, fontWeight: "800" }}>{item.u}: </Text>
              {item.m}
            </Text>
          )}
        />
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            value={msg}
            onChangeText={setMsg}
            placeholder={t("addComment")}
            placeholderTextColor={colors.muted}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, paddingHorizontal: 16, height: 44, color: "#fff" }}
          />
          <Pressable onPress={heart} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" }}>
            <Text>❤️</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Wallet")} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" }}>
            <Text>🎁</Text>
          </Pressable>
          <Pressable onPress={send} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff" }}>➤</Text>
          </Pressable>
        </View>
      </Animated.View>
    </LinearGradient>
  );
}
