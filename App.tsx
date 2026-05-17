import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
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
};

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
    };
    setRecording(false);
    setSaveModal({ walk, note: "" });
  };

  const persistAndClose = async () => {
    if (!saveModal) return;
    const walk = { ...saveModal.walk, note: saveModal.note.trim() };
    const next = [walk, ...walks];
    setWalks(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaveModal(null);
    setPath([]);
    setStartedAt(null);
    setTick(0);
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

  const elapsed = startedAt ? Date.now() - startedAt : 0;
  const dist = pathDistance(path);
  void tick;

  // Heat-style polylines for all walks on map
  const now = Date.now();
  function recencyOpacity(endedAt: number): number {
    const days = (now - endedAt) / 86400000;
    if (days < 7) return 0.95;
    if (days < 30) return 0.65;
    if (days < 90) return 0.4;
    return 0.25;
  }

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
          {/* Past walks (heatmap-style by recency) */}
          {walks
            .filter((w) => w.points.length > 1)
            .map((w) => (
              <Polyline
                key={w.id}
                coordinates={w.points}
                strokeColor={colors.accent}
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
                tappable={false}
                {...({ strokeOpacity: recencyOpacity(w.endedAt) } as object)}
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
      </View>

      {/* CONTROL PANEL */}
      <View style={styles.panel}>
        {!recording ? (
          <>
            <Text style={styles.panelTitle}>Ready when you are.</Text>
            <Text style={styles.panelSub}>
              Tap Start before you begin walking. Prayer Walk only records when you tell it to.
            </Text>
            <Pressable
              onPress={startWalk}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: colors.accent, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <Text style={[styles.btnText, { color: colors.bg }]}>
                {pos ? "Start walking" : "Waiting for GPS…"}
              </Text>
            </Pressable>

            <Pressable onPress={() => setHistoryOpen(true)} style={styles.linkBtn}>
              <Text style={styles.linkText}>
                {walks.length} {walks.length === 1 ? "walk" : "walks"} saved →
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={stopWalk}
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
            <Text style={styles.modalLabel}>WALK SAVED</Text>
            <Text style={styles.modalTitle}>
              {saveModal ? `${formatMeters(saveModal.walk.distanceMeters)} · ${formatDuration(saveModal.walk.durationMs)}` : ""}
            </Text>

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
              <Pressable onPress={persistAndClose} style={({ pressed }) => [styles.btn, { flex: 1, backgroundColor: colors.accent, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
                <Text style={[styles.btnText, { color: colors.bg }]}>Save walk</Text>
              </Pressable>
            </View>
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
                      <Text style={styles.walkPrimary}>
                        {formatMeters(item.distanceMeters)} · {formatDuration(item.durationMs)}
                      </Text>
                      <Text style={styles.walkSecondary}>{formatWhen(item.endedAt)}</Text>
                      {item.note ? (
                        <Text style={styles.walkNote}>&ldquo;{item.note}&rdquo;</Text>
                      ) : null}
                    </View>
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
  delBtn: { borderColor: colors.borderLight, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
});
