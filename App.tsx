import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  addRecordingToStore,
  deleteRecordingFromStore,
  formatDateTime,
  formatDuration,
  loadRecordings,
  moveIntoRecordingsDir,
  pruneMissingFiles,
  RecordingItem,
  saveRecordings,
} from './src/recordings';

async function setModeForRecording(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

async function setModeForPlayback(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);

  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const lastRecordingDurationMsRef = useRef(0);
  const [liveRecordingDurationMs, setLiveRecordingDurationMs] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await setModeForPlayback();
        const perm = await Audio.requestPermissionsAsync();
        if (!cancelled) setHasMicPermission(perm.status === 'granted');

        const loaded = await loadRecordings();
        const pruned = await pruneMissingFiles(loaded);
        if (pruned.length !== loaded.length) {
          await saveRecordings(pruned);
        }
        if (!cancelled) setRecordings(pruned);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to initialize audio');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void init();

    return () => {
      cancelled = true;
      void (async () => {
        try {
          const rec = recordingRef.current;
          if (rec) {
            try {
              await rec.stopAndUnloadAsync();
            } catch {
              // ignore
            }
          }
          await soundRef.current?.unloadAsync();
        } catch {
          // ignore
        } finally {
          recordingRef.current = null;
          soundRef.current = null;
        }
      })();
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    if (Platform.OS === 'web') {
      setError('Recording is not supported on web in this setup.');
      return;
    }

    try {
      if (hasMicPermission !== true) {
        const perm = await Audio.requestPermissionsAsync();
        const granted = perm.status === 'granted';
        setHasMicPermission(granted);
        if (!granted) {
          setError('Microphone permission is required to record.');
          return;
        }
      }

      // Stop any active playback before recording.
      await stopPlayback();
      await setModeForRecording();

      const rec = new Audio.Recording();
      lastRecordingDurationMsRef.current = 0;
      setLiveRecordingDurationMs(0);
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      rec.setProgressUpdateInterval(250);
      rec.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording) {
          const d = status.durationMillis ?? 0;
          lastRecordingDurationMsRef.current = d;
          setLiveRecordingDurationMs(d);
        }
      });

      await rec.startAsync();
      recordingRef.current = rec;
      setRecording(rec);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start recording');
      try {
        await setModeForPlayback();
      } catch {
        // ignore
      }
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setError(null);

    const rec = recording;
    setRecording(null);
    recordingRef.current = null;
    setLiveRecordingDurationMs(0);

    try {
      await rec.stopAndUnloadAsync();
      const tempUri = rec.getURI();
      const durationMs = lastRecordingDurationMsRef.current || 0;
      await setModeForPlayback();

      if (!tempUri) {
        setError('Recording URI was not available.');
        return;
      }

      const moved = await moveIntoRecordingsDir(tempUri);
      const next = await addRecordingToStore({
        uri: moved.uri,
        createdAt: Date.now(),
        durationMs,
      });
      setRecordings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop recording');
      try {
        await setModeForPlayback();
      } catch {
        // ignore
      }
    }
  };

  const stopPlayback = async () => {
    const snd = soundRef.current;
    soundRef.current = null;
    setPlayingId(null);
    if (!snd) return;
    try {
      // stopAsync can fail if already stopped/unloaded; best-effort.
      await snd.stopAsync();
    } catch {
      // ignore
    }
    try {
      await snd.unloadAsync();
    } catch {
      // ignore
    }
  };

  const togglePlay = async (item: RecordingItem) => {
    setError(null);
    if (recording) return;

    if (playingId === item.id) {
      await stopPlayback();
      return;
    }

    try {
      await stopPlayback();
      await setModeForPlayback();

      const { sound } = await Audio.Sound.createAsync(
        { uri: item.uri },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            void stopPlayback();
          }
        },
      );

      soundRef.current = sound;
      setPlayingId(item.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to play recording');
      await stopPlayback();
    }
  };

  const confirmDelete = (item: RecordingItem) => {
    Alert.alert('Delete recording?', 'This will remove the saved audio file.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (playingId === item.id) await stopPlayback();
            const next = await deleteRecordingFromStore(item.id);
            setRecordings(next);
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Recordings</Text>
          <Text style={styles.subtitle}>
            {recording
              ? `Recording… ${formatDuration(liveRecordingDurationMs)}`
              : `${recordings.length} saved`}
          </Text>
        </View>

        <Pressable
          onPress={recording ? stopRecording : startRecording}
          disabled={hasMicPermission === false || Platform.OS === 'web'}
          style={({ pressed }) => [
            styles.primaryButton,
            recording ? styles.stopButton : styles.recordButton,
            (hasMicPermission === false || Platform.OS === 'web') &&
              styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {recording ? 'Stop' : 'Record'}
          </Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.bannerError}>
          <Text style={styles.bannerErrorText}>{error}</Text>
        </View>
      ) : null}

      {hasMicPermission === false ? (
        <View style={styles.bannerWarn}>
          <Text style={styles.bannerWarnText}>
            Microphone permission is denied. Enable it to record.
          </Text>
        </View>
      ) : null}

      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          recordings.length === 0 && styles.listEmptyContent,
        ]}
        refreshing={isLoading}
        onRefresh={() => {
          void (async () => {
            setIsLoading(true);
            try {
              const loaded = await loadRecordings();
              const pruned = await pruneMissingFiles(loaded);
              if (pruned.length !== loaded.length) await saveRecordings(pruned);
              setRecordings(pruned);
            } finally {
              setIsLoading(false);
            }
          })();
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No recordings yet</Text>
            <Text style={styles.emptyBody}>
              Tap “Record” to create your first voice note.
            </Text>
            {Platform.OS === 'web' ? (
              <Text style={styles.emptyBody}>
                Recording/playback is intended for iOS/Android.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const isPlaying = playingId === item.id;
          return (
            <View style={styles.card}>
              <View style={styles.cardMeta}>
                <Text style={styles.cardTitle}>{formatDateTime(item.createdAt)}</Text>
                <Text style={styles.cardSubtitle}>
                  Duration: {formatDuration(item.durationMs)}
                </Text>
              </View>

              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => void togglePlay(item)}
                  disabled={recording != null}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    recording != null && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>
                    {isPlaying ? 'Stop' : 'Play'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => confirmDelete(item)}
                  disabled={recording != null}
                  style={({ pressed }) => [
                    styles.tertiaryButton,
                    recording != null && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.tertiaryButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0D12' },

  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B0D12',
  },
  headerText: { flex: 1, paddingRight: 12 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#AAB2C8', marginTop: 4, fontSize: 13 },

  listContent: { padding: 16, gap: 12 },
  listEmptyContent: { flexGrow: 1, justifyContent: 'center' },

  bannerError: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#2A0D13',
    borderWidth: 1,
    borderColor: '#74202B',
  },
  bannerErrorText: { color: '#FFB4BE', fontSize: 13 },

  bannerWarn: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#2A1D0B',
    borderWidth: 1,
    borderColor: '#7A4E12',
  },
  bannerWarnText: { color: '#FFD8A8', fontSize: 13 },

  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 94,
  },
  recordButton: { backgroundColor: '#2F6BFF' },
  stopButton: { backgroundColor: '#E23D57' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700' },

  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#151A25',
    borderWidth: 1,
    borderColor: '#26304A',
  },
  secondaryButtonText: { color: '#E8ECF7', fontWeight: '600' },

  tertiaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1A1114',
    borderWidth: 1,
    borderColor: '#3A1B22',
  },
  tertiaryButtonText: { color: '#FFB4BE', fontWeight: '600' },

  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },

  card: {
    backgroundColor: '#0F1320',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222B44',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardMeta: { flex: 1 },
  cardTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  cardSubtitle: { color: '#AAB2C8', marginTop: 4, fontSize: 12 },
  cardActions: { flexDirection: 'row', gap: 10 },

  empty: { paddingHorizontal: 24, gap: 8 },
  emptyTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  emptyBody: { color: '#AAB2C8', fontSize: 13, lineHeight: 18 },
});
