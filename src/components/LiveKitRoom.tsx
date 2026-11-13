
import React, { useMemo, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "../theme";

/**
 * جسر WebRTC حقيقي: يحمّل SDK الرسمي livekit-client داخل WebView
 * ويتصل بغرفة LiveKit باستخدام توكن صادر من Edge Function (livekit-token).
 * publish=true للمضيف (كاميرا+ميكروفون)، false للمشاهد.
 */
export function LiveKitRoom({ url, token, publish }: { url: string; token: string; publish: boolean }) {
  const [state, setState] = useState<"loading" | "live" | "error">("loading");
  const [err, setErr] = useState<string>("");

  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#0D0E15;overflow:hidden}
#v{width:100%;height:100%;object-fit:cover;background:#000}
#hint{position:fixed;bottom:8px;left:0;right:0;text-align:center;color:#8A90A6;font:12px -apple-system,sans-serif}</style>
<script src="https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js"></script>
</head><body>
<video id="v" autoplay playsinline ${publish ? "muted" : ""}></video>
<div id="hint">جارٍ الاتصال…</div>
<script>
 (function(){
  var LK = window.LivekitClient || window.livekitClient;
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  if(!LK){ post({t:'error',m:'sdk_load_failed'}); return; }
  var room = new LK.Room({ adaptiveStream:true, dynacast:true });
  var video = document.getElementById('v');
  room.on(LK.RoomEvent.TrackSubscribed, function(track){
    if(track.kind === 'video'){ track.attach(video); document.getElementById('hint').textContent=''; post({t:'live'}); }
    if(track.kind === 'audio'){ var a=document.createElement('audio'); a.autoplay=true; document.body.appendChild(a); track.attach(a); }
  });
  room.on(LK.RoomEvent.Disconnected, function(){ post({t:'error',m:'disconnected'}); });
  room.connect(${JSON.stringify(url)}, ${JSON.stringify(token)}, { autoSubscribe: !${publish} })
    .then(function(){
      post({t:'connected'});
      if(${publish}){
        return room.localParticipant.setCameraEnabled(true)
          .then(function(){ return room.localParticipant.setMicrophoneEnabled(true); })
          .then(function(){
            var pub = room.localParticipant.getTrackPublication(LK.Track.Source.Camera);
            if(pub && pub.track) pub.track.attach(video);
            document.getElementById('hint').textContent='أنت تبث الآن';
            post({t:'live'});
          });
      }
      post({t:'live'});
    })
    .catch(function(e){ post({t:'error', m: String(e && e.message || e)}); });
 })();
</script></body></html>`, [url, token, publish]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <WebView
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://socialplus.app" }}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        onPermissionRequest={(e: any) => e?.grant?.(e.resources)}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m.t === "live") setState("live");
            if (m.t === "error") { setState("error"); setErr(m.m); }
          } catch {}
        }}
        style={{ flex: 1, backgroundColor: "#000" }}
      />
      {state === "loading" && (
        <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={{ color: colors.muted, fontSize: 12 }}>جارٍ الاتصال بالبث…</Text>
        </View>
      )}
      {state === "error" && (
        <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", padding: 24, gap: 8, backgroundColor: "rgba(13,14,21,0.92)" }}>
          <Text style={{ color: colors.danger, fontWeight: "800" }}>تعذر تشغيل الفيديو المباشر</Text>
          <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>{err || "تحقق من إعداد LIVEKIT_URL / API KEY / SECRET في Supabase Secrets"}</Text>
          <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center" }}>الدردشة والهدايا وعدّاد المشاهدين تعمل بصورة طبيعية.</Text>
        </View>
      )}
    </View>
  );
}
