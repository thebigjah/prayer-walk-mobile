import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";

type Coord = { latitude: number; longitude: number };
type Walk = {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  distanceMeters: number;
  points: Coord[];
  note: string;
  title?: string;
};

const SCRIPTURE_ROTATION = [
  { text: "Pray without ceasing.", ref: "1 Thessalonians 5:17" },
  { text: "Seek the welfare of the city where I have sent you... pray to the LORD on its behalf.", ref: "Jeremiah 29:7" },
  { text: "If my people, who are called by my name, will humble themselves and pray... I will hear from heaven and heal their land.", ref: "2 Chronicles 7:14" },
  { text: "The earnest prayer of a righteous person has great power and produces wonderful results.", ref: "James 5:16" },
  { text: "And when ye stand praying, forgive.", ref: "Mark 11:25" },
  { text: "Watch ye and pray.", ref: "Mark 14:38" },
  { text: "I have set the LORD always before me.", ref: "Psalm 16:8" },
];

const STORAGE_KEY = "prayer_walk.walks.v1";

const colors = {
  bg: "#0a0604",
  bg2: "#16110b",
  card: "#1b1510",
  border: "#2e2820",
  borderLight: "#3a342a",
  text: "#f5f0e0",
  textMuted: "#b6a98e",
  textLight: "#847b69",
  accent: "#c2a173",
  accentBright: "#e8b968",
  red: "#e54a28",
};

const EARTH_R = 6371000;
function haversine(a: Coord, b: Coord) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}
function pathDistance(pts: Coord[]) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1], pts[i]);
  return total;
}
function formatMeters(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1609.34).toFixed(2)} mi`;
}
function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const r = s % 60;
  if (min < 60) return `${min}m ${r}s`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}
function formatWhen(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function App() {
  const [pos, setPos] = useState<Coord | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [permError, setPermError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [path, setPath] = useState<Coord[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [walks, setWalks] = useState<Walk[]>([]);
  const [saveModal, setSaveModal] = useState<{ walk: Walk; note: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [title, setTitle] = useState("");
  const verse = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return SCRIPTURE_ROTATION[dayOfYear % SCRIPTURE_ROTATION.length];
  }, []);

  const watchSub = useRef<Location.LocationSubscription | null>(null);
  const mapRef = useRef<MapView | null>(null);

  // Load saved walks on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setWalks(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  // Acquire permission + start watching location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setPermError(
            "Location permission denied. Enable it in Settings to use Prayer Walk.",
          );
          return;
        }
        watchSub.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1500,
            distanceInterval: 2,
          },
          (loc) => {
            const c: Coord = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
            setPos(c);
            setAccuracy(loc.coords.accuracy ?? null);
          },
        );
      } catch (e) {
        setPermError(String(e));
      }
    })();
    return () => {
      watchSub.current?.remove();
    };
  }, []);

  // Append to path when recording
  useEffect(() => {
    if (!pos || !recording) return;
    setPath((prev) => {
      if (prev.length === 0) return [pos];
      const last = prev[prev.length - 1];
      const d = haversine(last, pos);
      return d > 3 ? [...prev, pos] : prev;
    });
  }, [pos, recording]);

  // Timer tick when recording
  useEffect(() => {
    if (!recording) return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [recording]);

  const startWalk = () => {
    if (!pos) {
      Alert.alert("Waiting for GPS", "Hold on a moment for a GPS fix, then try again.");
      return;
    }
    setPath([pos]);
    setStartedAt(Date.now());
    setRecording(true);
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        { latitude: pos.latitude, longitude: pos.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 },
        500,
      );
    }
  };

  const runDemoWalk = async () => {
    // Simulated 30s walk along nearby coordinates so the app can be tested
    // from the couch without actually walking outdoors.
    const base = pos ?? { latitude: 33.8362, longitude: -84.677 };
    const demoPoints: Coord[] = Array.from({ length: 60 }, (_, i) => ({
      latitude: base.latitude + Math.sin(i / 7) * 0.0008 + i * 0.00004,
      longitude: base.longitude + Math.cos(i / 7) * 0.0008 + i * 0.00006,
    }));
    setRecording(true);
    setPath([demoPoints[0]]);
    setStartedAt(Date.now());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Auto-zoom map to fit the demo path
    if (mapRef.current) {
      mapRef.current.fitToCoordinates(demoPoints, {
        edgePadding: { top: 80, right: 60, bottom: 280, left: 60 },
        animated: true,
      });
    }
    let i = 1;
    const interval = setInterval(() => {
      if (i >= demoPoints.length) {
        clearInterval(interval);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // Finalize as a real saved walk
        const ended = Date.now();
        const walk: Walk = {
          id: `demo_${ended.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          startedAt: ended - 30000,
          endedAt: ended,
          durationMs: 30000,
          distanceMeters: pathDistance(demoPoints),
          points: demoPoints,
          note: "Demo walk",
        };
        setRecording(false);
        setSaveModal({ walk, note: "Demo walk" });
        return;
      }
      setPath((prev) => [...prev, demoPoints[i]]);
      i++;
    }, 500);
  };

  const stopWalk = () => {
    if (!startedAt) return;
    const ended = Date.now();
    const walk: Walk = {
      id: `w_${ended.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt,
      endedAt: ended,
      durationMs: ended - startedAt,
      distanceMeters: pathDistance(path),
      points: path,
      note: "",
      title: "",
    };
    setRecording(false);
    setTitle("");
    setSaveModal({ walk, note: "" });
  };

  const persistAndClose = async () => {
    if (!saveModal) return;
    const walk = { ...saveModal.walk, note: saveModal.note.trim(), title: title.trim() };
    const next = [walk, ...walks];
    setWalks(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaveModal(null);
    setPath([]);
    setStartedAt(null);
    setTick(0);
    setTitle("");
  };

  const cancelSave = () => {
    setSaveModal(null);
    setPath([]);
    setStartedAt(null);
    setTick(0);
  };

  const deleteWalk = async (id: string) => {
    const next = walks.filter((w) => w.id !== id);
    setWalks(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const shareWalk = async (walk: Walk) => {
    const noteLine = walk.note ? `\n\n"${walk.note}"` : "";
    const message = `I prayer-walked ${formatMeters(walk.distanceMeters)} through my neighborhood today.${noteLine}\n\nA city should know it's being prayed for, and the people praying should know they're not doing it alone.\n\nVia Prayer Walk — https://coverage-bice.vercel.app/`;
    try {
      await Share.share({ message });
    } catch (e) {
      Alert.alert("Couldn't share", String(e));
    }
  };

  const exportWalkAsGpx = async (walk: Walk) => {
    const startIso = new Date(walk.startedAt).toISOString();
    const name = walk.title || `Prayer walk ${new Date(walk.startedAt).toLocaleDateString()}`;
    const desc = (walk.note || "Prayer walk").replace(/[<&>]/g, "");
    const trkpts = walk.points
      .map((p, i) => {
        const t = new Date(walk.startedAt + (i / Math.max(walk.points.length - 1, 1)) * walk.durationMs).toISOString();
        return `        <trkpt lat="${p.latitude.toFixed(7)}" lon="${p.longitude.toFixed(7)}"><time>${t}</time></trkpt>`;
      })
      .join("\n");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Prayer Walk" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <desc>${desc}</desc>
    <time>${startIso}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
    try {
      const filename = `prayer-walk-${walk.id}.gpx`;
      const documentDir = (FileSystem as unknown as { documentDirectory: string }).documentDirectory;
      const fileUri = `${documentDir}${filename}`;
      const writeAsString = (FileSystem as unknown as { writeAsStringAsync: (uri: string, contents: string) => Promise<void> }).writeAsStringAsync;
      await writeAsString(fileUri, gpx);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: "application/gpx+xml", dialogTitle: "Share GPX (open in Strava, Garmin, etc.)" });
      } else {
        Alert.alert("Saved", `GPX file saved to: ${fileUri}`);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert("Export failed", String(e));
    }
  };

  const importFromJson = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const readAsString = (FileSystem as unknown as { readAsStringAsync: (uri: string) => Promise<string> }).readAsStringAsync;
      const raw = await readAsString(asset.uri);
      const parsed = JSON.parse(raw);
      const incoming: Walk[] = Array.isArray(parsed) ? parsed : parsed.walks;
      if (!Array.isArray(incoming)) throw new Error("File doesn't contain a walks array");
      const existing = new Set(walks.map((w) => w.id));
      const merged = [...walks, ...incoming.filter((w) => !existing.has(w.id))];
      merged.sort((a, b) => b.endedAt - a.endedAt);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      setWalks(merged);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Imported",
        `Added ${merged.length - walks.length} new walk${merged.length - walks.length === 1 ? "" : "s"} from ${incoming.length} in the file.`,
      );
    } catch (e) {
      Alert.alert("Import failed", String(e));
    }
  };

  const exportAllAsJson = async () => {
    if (walks.length === 0) {
      Alert.alert("Nothing to export", "Record a walk first.");
      return;
    }
    try {
      const json = JSON.stringify({ exportedAt: Date.now(), walks }, null, 2);
      const documentDir = (FileSystem as unknown as { documentDirectory: string }).documentDirectory;
      const fileUri = `${documentDir}prayer-walks-backup-${Date.now()}.json`;
      const writeAsString = (FileSystem as unknown as { writeAsStringAsync: (uri: string, contents: string) => Promise<void> }).writeAsStringAsync;
      await writeAsString(fileUri, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: "application/json", dialogTitle: "Backup all walks (JSON)" });
      } else {
        Alert.alert("Saved", `Backup saved to: ${fileUri}`);
      }
    } catch (e) {
      Alert.alert("Export failed", String(e));
    }
  };

  const shareTotals = async () => {
    if (walks.length === 0) {
      Alert.alert("No walks yet", "Record a walk first, then share.");
      return;
    }
    const totalDist = walks.reduce((s, w) => s + w.distanceMeters, 0);
    const totalDur = walks.reduce((s, w) => s + w.durationMs, 0);
    const message = `${walks.length} prayer walk${walks.length === 1 ? "" : "s"} so far. ${formatMeters(totalDist)} of streets carried in prayer. ${formatDuration(totalDur)} of intercession.\n\nVia Prayer Walk — https://coverage-bice.vercel.app/`;
    try {
      await Share.share({ message });
    } catch (e) {
      Alert.alert("Couldn't share", String(e));
    }
  };

  const elapsed = startedAt ? Date.now() - startedAt : 0;
  const dist = pathDistance(path);
  void tick;

  // Heat-style polylines: vary the stroke COLOR by recency so the effect actually shows
  // (react-native-maps Polyline doesn't accept strokeOpacity — was a bug in v0.1)
  const now = Date.now();
  function recencyColor(endedAt: number): string {
    const days = (now - endedAt) / 86400000;
    if (days < 7) return "#e8b968";   // bright accent
    if (days < 30) return "#c2a173";  // muted accent
    if (days < 90) return "#8a704c";  // faded
    return "#5b4a35";                  // very faded
  }

  // Lifetime stats + streak
  const lifetime = useMemo(() => {
    if (walks.length === 0) return null;
    const totalDist = walks.reduce((s, w) => s + w.distanceMeters, 0);
    const totalDur = walks.reduce((s, w) => s + w.durationMs, 0);
    const longest = walks.reduce((a, b) => (b.distanceMeters > a.distanceMeters ? b : a));
    // Streak: consecutive days (counting back from today) that contain >=1 walk
    const dayKeys = new Set(walks.map((w) => new Date(w.endedAt).toDateString()));
    let streak = 0;
    const d = new Date();
    while (dayKeys.has(d.toDateString())) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    // Also count distinct days walked overall
    const distinctDays = dayKeys.size;
    return { totalDist, totalDur, longest, streak, distinctDays };
  }, [walks]);

  // Tap-to-view a past walk on the map
  const focusWalkOnMap = (walk: Walk) => {
    setHistoryOpen(false);
    if (!walk.points.length) return;
    const lats = walk.points.map((p) => p.latitude);
    const lngs = walk.points.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latPad = Math.max((maxLat - minLat) * 0.4, 0.001);
    const lngPad = Math.max((maxLng - minLng) * 0.4, 0.001);
    mapRef.current?.animateToRegion(
      {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: (maxLat - minLat) + 2 * latPad,
        longitudeDelta: (maxLng - minLng) + 2 * lngPad,
      },
      650,
    );
    Haptics.selectionAsync().catch(() => {});
  };

  // Wrap key actions with haptics
  const startWalkHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    startWalk();
  };
  const stopWalkHaptic = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    stopWalk();
  };
  const persistAndCloseHaptic = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await persistAndClose();
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* MAP */}
      <View style={styles.mapWrap}>
        <MapView
          ref={(r) => { mapRef.current = r; }}
          provider={PROVIDER_DEFAULT}
          style={styles.map}
          showsUserLocation
          followsUserLocation={recording}
          showsMyLocationButton={false}
          initialRegion={{
            latitude: pos?.latitude ?? 33.8362,
            longitude: pos?.longitude ?? -84.677,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}
        >
          {/* Past walks: recency-tinted (older = darker, newer = brighter) */}
          {walks
            .filter((w) => w.points.length > 1)
            .map((w) => (
              <Polyline
                key={w.id}
                coordinates={w.points}
                strokeColor={recencyColor(w.endedAt)}
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
                tappable={false}
              />
            ))}
          {/* Current recording path */}
          {recording && path.length > 1 && (
            <Polyline
              coordinates={path}
              strokeColor={colors.accentBright}
              strokeWidth={7}
              lineCap="round"
              lineJoin="round"
            />
          )}
          {recording && pos && <Marker coordinate={pos} pinColor={colors.accentBright} />}
        </MapView>

        {/* Live stats overlay */}
        {recording && (
          <View style={styles.statsOverlay}>
            <View style={[styles.pulseDot, { backgroundColor: colors.red }]} />
            <View>
              <Text style={styles.statLabel}>TIME</Text>
              <Text style={styles.statValue}>{formatDuration(elapsed)}</Text>
            </View>
            <View style={styles.divider} />
            <View>
              <Text style={styles.statLabel}>DISTANCE</Text>
              <Text style={styles.statValue}>{formatMeters(dist)}</Text>
            </View>
            {accuracy !== null && (
              <>
                <View style={styles.divider} />
                <View>
                  <Text style={styles.statLabel}>GPS</Text>
                  <Text style={[styles.statValue, { color: accuracy < 20 ? "#9bd187" : colors.accentBright, fontSize: 14 }]}>
                    ±{Math.round(accuracy)}m
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {permError && (
          <View style={styles.errBanner}>
            <Text style={{ color: "#ffb8a4", fontSize: 13 }}>{permError}</Text>
          </View>
        )}

        {/* Recenter map to current position */}
        {pos && !recording && (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              mapRef.current?.animateToRegion(
                { latitude: pos.latitude, longitude: pos.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 },
                500,
              );
            }}
            style={({ pressed }) => [styles.recenterBtn, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
            accessibilityLabel="Recenter map on current location"
          >
            <Text style={styles.recenterIcon}>◎</Text>
          </Pressable>
        )}
      </View>

      {/* CONTROL PANEL */}
      <View style={styles.panel}>
        {!recording ? (
          <>
            <Text style={styles.panelTitle}>Ready when you are.</Text>
            <Text style={styles.panelSub}>
              Tap Start before you begin walking. Prayer Walk only records when you tell it to.
            </Text>
            {walks.length === 0 && (
              <View style={styles.verseBox}>
                <Text style={styles.verseText}>&ldquo;{verse.text}&rdquo;</Text>
                <Text style={styles.verseRef}>— {verse.ref}</Text>
              </View>
            )}
            <Pressable
              onPress={startWalkHaptic}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: colors.accent, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <Text style={[styles.btnText, { color: colors.bg }]}>
                {pos ? "Start walking" : "Waiting for GPS…"}
              </Text>
            </Pressable>

            {lifetime && (
              <View style={styles.lifetime}>
                <Text style={styles.lifetimeLabel}>LIFETIME</Text>
                <View style={styles.lifetimeRow}>
                  <View style={styles.lifetimeStat}>
                    <Text style={styles.lifetimeVal}>{formatMeters(lifetime.totalDist)}</Text>
                    <Text style={styles.lifetimeSub}>covered</Text>
                  </View>
                  <View style={styles.lifetimeStat}>
                    <Text style={styles.lifetimeVal}>{walks.length}</Text>
                    <Text style={styles.lifetimeSub}>{walks.length === 1 ? "walk" : "walks"}</Text>
                  </View>
                  <View style={styles.lifetimeStat}>
                    <Text style={[styles.lifetimeVal, lifetime.streak > 0 && { color: colors.accentBright }]}>
                      {lifetime.streak}
                    </Text>
                    <Text style={styles.lifetimeSub}>{lifetime.streak === 1 ? "day" : "days"} now</Text>
                  </View>
                </View>
                {lifetime.longest && (
                  <Text style={styles.lifetimePr}>
                    PR: {formatMeters(lifetime.longest.distanceMeters)}
                    {lifetime.longest.title ? ` — ${lifetime.longest.title}` : ""}
                  </Text>
                )}
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 14, marginTop: 14, justifyContent: "space-between" }}>
              <Pressable onPress={() => setHistoryOpen(true)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                <Text style={styles.linkText}>
                  {walks.length} {walks.length === 1 ? "walk" : "walks"} saved →
                </Text>
              </Pressable>
              <Pressable onPress={runDemoWalk} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                <Text style={[styles.linkText, { color: colors.accent }]}>Try a demo walk →</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable
            onPress={stopWalkHaptic}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: colors.red, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            <Text style={[styles.btnText, { color: "#fff" }]}>Stop &amp; save walk</Text>
          </Pressable>
        )}
      </View>

      {/* SAVE MODAL */}
      <Modal visible={!!saveModal} animationType="slide" transparent>
        <View style={styles.modalRoot}>
          <View style={styles.modalCard}>
            <Text style={styles.modalLabel}>WALK SAVED{saveModal && lifetime && saveModal.walk.distanceMeters >= lifetime.longest.distanceMeters ? " · NEW PR" : ""}</Text>
            <Text style={styles.modalTitle}>
              {saveModal ? `${formatMeters(saveModal.walk.distanceMeters)} · ${formatDuration(saveModal.walk.durationMs)}` : ""}
            </Text>

            <Text style={styles.inputLabel}>Title (optional)</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder='e.g. "Sunday morning loop"'
              placeholderTextColor={colors.textLight}
              style={styles.input}
            />

            <Text style={styles.inputLabel}>One-line prayer note (optional)</Text>
            <TextInput
              value={saveModal?.note ?? ""}
              onChangeText={(t) => setSaveModal((s) => (s ? { ...s, note: t } : s))}
              placeholder='e.g. "Prayed for families on Oakland Dr."'
              placeholderTextColor={colors.textLight}
              style={styles.input}
              multiline
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={cancelSave} style={({ pressed }) => [styles.btnGhost, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
                <Text style={styles.btnGhostText}>Discard</Text>
              </Pressable>
              <Pressable onPress={persistAndCloseHaptic} style={({ pressed }) => [styles.btn, { flex: 1, backgroundColor: colors.accent, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
                <Text style={[styles.btnText, { color: colors.bg }]}>Save walk</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => saveModal && shareWalk(saveModal.walk)}
              style={({ pressed }) => [styles.linkBtn, { marginTop: 14, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={styles.linkText}>Share this walk →</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* HISTORY MODAL */}
      <Modal visible={historyOpen} animationType="slide" transparent>
        <View style={styles.modalRoot}>
          <View style={[styles.modalCard, { maxHeight: "80%" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <Text style={styles.modalTitle}>Your walks</Text>
              <Pressable onPress={() => setHistoryOpen(false)}>
                <Text style={{ color: colors.textMuted, fontSize: 16 }}>Close</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {walks.length > 0 && (
                <Pressable
                  onPress={shareTotals}
                  style={({ pressed }) => [
                    styles.btnGhost,
                    { flex: 1, minWidth: 100, alignItems: "center", opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={styles.btnGhostText}>Share totals</Text>
                </Pressable>
              )}
              {walks.length > 0 && (
                <Pressable
                  onPress={exportAllAsJson}
                  style={({ pressed }) => [
                    styles.btnGhost,
                    { flex: 1, minWidth: 100, alignItems: "center", opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={styles.btnGhostText}>Backup</Text>
                </Pressable>
              )}
              <Pressable
                onPress={importFromJson}
                style={({ pressed }) => [
                  styles.btnGhost,
                  { flex: 1, minWidth: 100, alignItems: "center", opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={styles.btnGhostText}>Restore</Text>
              </Pressable>
            </View>
            {walks.length === 0 ? (
              <Text style={{ color: colors.textLight, fontSize: 14, lineHeight: 22 }}>
                No walks yet. Tap Start on the main screen to record your first.
              </Text>
            ) : (
              <FlatList
                data={walks}
                keyExtractor={(w) => w.id}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                renderItem={({ item }) => (
                  <View style={styles.walkRow}>
                    <View style={{ flex: 1 }}>
                      {item.title ? (
                        <Text style={[styles.walkPrimary, { fontFamily: undefined }]}>{item.title}</Text>
                      ) : null}
                      <Text style={styles.walkPrimary}>
                        {formatMeters(item.distanceMeters)} · {formatDuration(item.durationMs)}
                        {lifetime && item.id === lifetime.longest.id ? "  · PR" : ""}
                      </Text>
                      <Text style={styles.walkSecondary}>{formatWhen(item.endedAt)}</Text>
                      {item.note ? (
                        <Text style={styles.walkNote}>&ldquo;{item.note}&rdquo;</Text>
                      ) : null}
                    </View>
                    <View style={{ gap: 6 }}>
                      <Pressable
                        onPress={() => focusWalkOnMap(item)}
                        style={styles.delBtn}
                      >
                        <Text style={{ color: colors.accentBright, fontSize: 12 }}>View</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => shareWalk(item)}
                        style={styles.delBtn}
                      >
                        <Text style={{ color: colors.accent, fontSize: 12 }}>Share</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => exportWalkAsGpx(item)}
                        style={styles.delBtn}
                      >
                        <Text style={{ color: colors.accent, fontSize: 12 }}>GPX</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          Alert.alert("Delete walk?", "This cannot be undone.", [
                            { text: "Cancel" },
                            { text: "Delete", style: "destructive", onPress: () => deleteWalk(item.id) },
                          ])
                        }
                        style={styles.delBtn}
                      >
                        <Text style={{ color: colors.textLight, fontSize: 12 }}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  mapWrap: { flex: 1, position: "relative" },
  map: { flex: 1 },
  statsOverlay: {
    position: "absolute", top: 50, left: 16,
    backgroundColor: "rgba(10,6,4,0.92)",
    borderColor: colors.borderLight, borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: "row", alignItems: "center", gap: 14,
  },
  pulseDot: { width: 10, height: 10, borderRadius: 5 },
  statLabel: { fontSize: 10, color: colors.textLight, letterSpacing: 1.2 },
  statValue: { fontSize: 17, color: colors.text, fontWeight: "700" },
  divider: { height: 28, width: 1, backgroundColor: colors.borderLight },
  errBanner: {
    position: "absolute", top: 50, right: 16, left: 16,
    backgroundColor: "rgba(229,74,40,0.18)",
    borderColor: colors.red, borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  panel: {
    backgroundColor: colors.bg2,
    borderTopColor: colors.border, borderTopWidth: 1,
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 36,
  },
  panelTitle: { fontSize: 20, color: colors.text, fontWeight: "700", marginBottom: 6 },
  panelSub: { fontSize: 13, color: colors.textMuted, marginBottom: 18, lineHeight: 19 },
  btn: {
    paddingVertical: 18, paddingHorizontal: 24,
    borderRadius: 10, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnText: { fontSize: 16, fontWeight: "700", letterSpacing: 0.4 },
  btnGhost: {
    paddingVertical: 18, paddingHorizontal: 18,
    borderRadius: 10, borderColor: colors.borderLight, borderWidth: 1,
  },
  btnGhostText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  linkBtn: { marginTop: 16, alignItems: "center" },
  linkText: { color: colors.textMuted, fontSize: 14 },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalCard: {
    backgroundColor: colors.bg2,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 24, paddingBottom: 40,
    borderTopColor: colors.borderLight, borderTopWidth: 1,
  },
  modalLabel: { fontSize: 11, color: colors.accent, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 },
  modalTitle: { fontSize: 24, color: colors.text, fontWeight: "700", marginBottom: 18 },
  inputLabel: { fontSize: 11, color: colors.textLight, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.borderLight, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 15, minHeight: 60,
  },
  walkRow: {
    backgroundColor: colors.card,
    borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: 14,
    flexDirection: "row", gap: 10, alignItems: "flex-start",
  },
  walkPrimary: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: 4 },
  walkSecondary: { color: colors.textMuted, fontSize: 13 },
  walkNote: { color: colors.text, fontSize: 13, fontStyle: "italic", marginTop: 6 },
  delBtn: { borderColor: colors.borderLight, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", minWidth: 50 },
  lifetime: {
    marginTop: 14,
    paddingTop: 14,
    borderTopColor: colors.border, borderTopWidth: 1,
  },
  lifetimeLabel: { fontSize: 10, color: colors.textLight, letterSpacing: 1.4, fontWeight: "700", marginBottom: 8 },
  lifetimeRow: { flexDirection: "row", gap: 14 },
  lifetimeStat: { flex: 1 },
  lifetimeVal: { fontSize: 18, fontWeight: "700", color: colors.text },
  lifetimeSub: { fontSize: 11, color: colors.textLight, letterSpacing: 0.4 },
  lifetimePr: { fontSize: 12, color: colors.accent, marginTop: 8, fontWeight: "600" },
  verseBox: {
    marginTop: 16,
    padding: 14,
    borderLeftWidth: 3, borderLeftColor: colors.accent,
    backgroundColor: "rgba(194,161,115,0.06)",
    borderRadius: 6,
  },
  verseText: { fontSize: 14, color: colors.text, fontStyle: "italic", lineHeight: 20 },
  verseRef: { fontSize: 12, color: colors.textLight, marginTop: 6 },
  recenterBtn: {
    position: "absolute", bottom: 16, right: 16,
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.bg2,
    borderColor: colors.borderLight, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recenterIcon: { color: colors.accent, fontSize: 22, fontWeight: "700" },
});
