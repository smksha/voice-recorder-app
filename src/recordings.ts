import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export type RecordingItem = {
  id: string;
  uri: string;
  createdAt: number; // epoch ms
  durationMs: number;
};

const RECORDINGS_KEY = 'recordings:v1';

export const RECORDINGS_DIR =
  FileSystem.documentDirectory != null
    ? `${FileSystem.documentDirectory}recordings/`
    : null;

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString();
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function ensureRecordingsDir(): Promise<void> {
  if (!RECORDINGS_DIR) return;
  const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
  }
}

export async function loadRecordings(): Promise<RecordingItem[]> {
  const raw = await AsyncStorage.getItem(RECORDINGS_KEY);
  const items = safeJsonParse<RecordingItem[]>(raw, []);
  return items
    .filter((r) => typeof r?.id === 'string' && typeof r?.uri === 'string')
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveRecordings(items: RecordingItem[]): Promise<void> {
  await AsyncStorage.setItem(RECORDINGS_KEY, JSON.stringify(items));
}

export async function pruneMissingFiles(
  items: RecordingItem[],
): Promise<RecordingItem[]> {
  const checks = await Promise.all(
    items.map(async (r) => {
      const info = await FileSystem.getInfoAsync(r.uri);
      return { r, exists: info.exists };
    }),
  );
  return checks.filter((c) => c.exists).map((c) => c.r);
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getExtensionFromUri(uri: string): string {
  const q = uri.split('?')[0] ?? uri;
  const last = q.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  if (dot === -1) return '';
  return last.slice(dot); // includes dot
}

export async function moveIntoRecordingsDir(
  tempUri: string,
): Promise<{ uri: string; filename: string }> {
  await ensureRecordingsDir();
  if (!RECORDINGS_DIR) {
    return { uri: tempUri, filename: tempUri.split('/').pop() ?? 'recording' };
  }

  const ext = getExtensionFromUri(tempUri) || '.m4a';
  const filename = `rec-${Date.now()}${ext}`;
  const destUri = `${RECORDINGS_DIR}${filename}`;
  await FileSystem.moveAsync({ from: tempUri, to: destUri });
  return { uri: destUri, filename };
}

export async function addRecordingToStore(
  draft: Omit<RecordingItem, 'id'>,
): Promise<RecordingItem[]> {
  const next: RecordingItem = { id: randomId(), ...draft };
  const current = await loadRecordings();
  const merged = [next, ...current];
  await saveRecordings(merged);
  return merged;
}

export async function deleteRecordingFromStore(
  id: string,
): Promise<RecordingItem[]> {
  const current = await loadRecordings();
  const target = current.find((r) => r.id === id);
  const next = current.filter((r) => r.id !== id);
  await saveRecordings(next);

  if (target?.uri) {
    try {
      const info = await FileSystem.getInfoAsync(target.uri);
      if (info.exists) {
        await FileSystem.deleteAsync(target.uri, { idempotent: true });
      }
    } catch {
      // ignore file delete failures (metadata already updated)
    }
  }

  return next;
}

