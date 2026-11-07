import React from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { supabase } from "../lib/supabase";
import { GradientButton, GlassCard, Row, s } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { colors } from "../theme";
import type { RootParams } from "../navigation/RootNavigator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export function WalletScreen({ navigation }: NativeStackScreenProps<RootParams, "Wallet">) {
  const { t } = useI18n();
  const profile = useAppStore((st) => st.profile);
  const refresh = useAppStore((st) => st.refreshProfile);

  const buy = async (amount: number) => {
    if (!profile) return Alert.alert("", "سجّل الدخول أولاً");
    const { data, error } = await supabase.rpc("buy_coins", { p_amount: amount });
    if (error) return Alert.alert("⚠️", error.message);
    await refresh();
    Alert.alert("✅", `تم شراء ${amount} ${t("coins")}`);
  };

  return (
    <LinearGradient colors={["#0D0E15", "#221a3f", "#0D0E15"]} style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 70, gap: 18 }}>
        <Text style={s.title}>{t("wallet")}</Text>
        <GlassCard style={{ padding: 24, alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 44 }}>🪙</Text>
          <Text style={{ color: "#fff", fontSize: 34, fontWeight: "900" }}>{profile?.coins ?? 0}</Text>
          <Text style={{ color: colors.muted }}>{t("coins")}</Text>
        </GlassCard>
        <GradientButton label={t("buyCoins")} onPress={() => buy(100)} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[50, 100, 500].map((n) => (
            <Pressable key={n} onPress={() => buy(n)} style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>+{n} 🪙</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[["🧾", t("transactions")], ["🔁", t("transfer")], ["🏧", t("withdraw")]].map(([g, l], i) => (
            <Pressable key={i} style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 20 }}>{g}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <GlassCard style={{ padding: 18, gap: 6 }}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>🎁 {t("sendGift")}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>ادعم صنّاع المحتوى — أرسل الهدايا وكن جزءاً من رحلتهم</Text>
        </GlassCard>
        <Pressable onPress={() => navigation.goBack()} style={{ alignItems: "center", padding: 10 }}>
          <Text style={{ color: colors.muted }}>‹ رجوع</Text>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}
