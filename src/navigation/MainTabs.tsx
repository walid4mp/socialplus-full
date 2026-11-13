
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, Pressable, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";
import { useI18n } from "../i18n";
import {
  HomeScreen, ReelsScreen, CreatePostScreen, SearchScreen, ChatsScreen,
  ProfileScreen, SettingsScreen, NotificationsScreen, StoriesScreen,
} from "../screens";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<any>();

function ChatsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatsList" component={ChatsScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

const VISIBLE = ["Home", "Reels", "Create", "Chats", "Profile"] as const;
const GLYPH: Record<string, string> = { Home: "🏠", Reels: "🎬", Chats: "💬", Profile: "👤" };

/* شريط تنقل مخصّص: أعمدة متساوية العرض، تسميات لا تُقتطع، زر ＋ مركزي */
function AppTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { lang } = useI18n();
  const routes = state.routes.filter((r: any) => (VISIBLE as readonly string[]).includes(r.name));
  const labels: Record<string, string> = {
    Home: lang === "ar" ? "الرئيسية" : "Home",
    Reels: lang === "ar" ? "ريلز" : "Reels",
    Create: "",
    Chats: lang === "ar" ? "دردشة" : "Chat",
    Profile: lang === "ar" ? "حسابي" : "Me",
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {routes.map((route: any) => {
        const idx = state.routes.findIndex((r: any) => r.key === route.key);
        const focused = state.index === idx;
        const onPress = () => {
          const ev = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !ev.defaultPrevented) navigation.navigate(route.name);
        };
        if (route.name === "Create") {
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.col} accessibilityRole="button">
              <View style={styles.createBtn}>
                <Text style={styles.plus}>＋</Text>
              </View>
            </Pressable>
          );
        }
        return (
          <Pressable key={route.key} onPress={onPress} style={styles.col} accessibilityRole="button">
            <View style={[styles.pill, focused && styles.pillActive]}>
              <Text style={[styles.glyph, { opacity: focused ? 1 : 0.55 }]}>{GLYPH[route.name]}</Text>
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
              style={[styles.label, { color: focused ? colors.accent : colors.muted }]}>
              {labels[route.name] ?? route.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Reels" component={ReelsScreen} />
      <Tab.Screen name="Create" component={CreatePostScreen} />
      <Tab.Screen name="Chats" component={ChatsStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Stories" component={StoriesScreen} options={{ tabBarButton: () => null }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#0D0E15",
    borderTopWidth: 1,
    borderTopColor: "rgba(139,92,246,0.22)",
    paddingTop: 7,
    paddingHorizontal: 4,
    elevation: 22,
  },
  col: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 3, minWidth: 0, paddingVertical: 2 },
  pill: { width: 46, height: 30, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pillActive: { backgroundColor: "rgba(91,103,241,0.20)" },
  glyph: { fontSize: 20 },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  createBtn: {
    width: 52, height: 34, borderRadius: 12, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
    shadowColor: colors.primary, shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 5 },
  },
  plus: { color: "#fff", fontSize: 24, fontWeight: "300", marginTop: -2 },
});
