import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, Pressable } from "react-native";
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
      <Stack.Screen name="SettingsFromChats" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="SettingsFromProfile" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

function Icon({ glyph, active }: { glyph: string; active: boolean }) {
  return (
    <Text style={{ fontSize: 24, opacity: active ? 1 : 0.55, shadowColor: colors.accent, shadowOpacity: active ? 0.8 : 0 }}>
      {glyph}
    </Text>
  );
}

export function MainTabs() {
  const { t, isRTL } = useI18n();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "rgba(20,22,34,0.95)",
          borderTopColor: "rgba(139,92,246,0.2)",
          height: 62, paddingBottom: 8, paddingTop: 6,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: t("home"), tabBarIcon: ({ focused }) => <Icon glyph="🏠" active={focused} /> }} />
      <Tab.Screen name="Reels" component={ReelsScreen} options={{ title: t("reels"), tabBarIcon: ({ focused }) => <Icon glyph="🎬" active={focused} /> }} />
      <Tab.Screen
        name="Create"
        component={CreatePostScreen}
        options={{
          title: t("create"),
          tabBarIcon: () => (
            <Pressable>
              <Text style={{ fontSize: 26, width: 52, height: 34, textAlign: "center", textAlignVertical: "center", color: "#fff", backgroundColor: colors.primary, borderRadius: 12 }}>＋</Text>
            </Pressable>
          ),
        }}
      />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: t("search"), tabBarIcon: ({ focused }) => <Icon glyph="🔍" active={focused} /> }} />
      <Tab.Screen name="Chats" component={ChatsStack} options={{ title: t("chats"), tabBarIcon: ({ focused }) => <Icon glyph="💬" active={focused} /> }} />
      <Tab.Screen name="Profile" component={ProfileStack} options={{ title: t("profile"), tabBarIcon: ({ focused }) => <Icon glyph="👤" active={focused} /> }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Stories" component={StoriesScreen} options={{ tabBarButton: () => null }} />
    </Tab.Navigator>
  );
}
