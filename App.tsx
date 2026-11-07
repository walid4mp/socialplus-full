import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "./global.css";
import { I18nProvider } from "./src/i18n";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { useAppStore } from "./src/store/useAppStore";
import { supabase } from "./src/lib/supabase";

function AuthBridge() {
  const setSession = useAppStore((s) => s.setSession);
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const hydrated = useAppStore((s) => s.hydrated);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) refreshProfile();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) refreshProfile();
    });
    return sub.subscription.unsubscribe;
  }, [setSession, refreshProfile]);

  if (!hydrated) return null;
  return <RootNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0D0E15" }}>
      <SafeAreaProvider>
        <I18nProvider>
          <StatusBar style="light" />
          <AuthBridge />
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
