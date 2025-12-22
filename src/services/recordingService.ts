import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Recording } from '../types/recording';

const RECORDINGS_DIR = `${FileSystem.documentDirectory}recordings/`;
const RECORDINGS_KEY = '@recordings_list';

// Ensure recordings directory exists
const ensureRecordingsDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(RECORDINGS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
  }
};

// Get all recordings from storage
export const getRecordings = async (): Promise<Recording[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(RECORDINGS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error loading recordings:', e);
    return [];
  }
};

// Save recording metadata to storage
export const saveRecording = async (recording: Recording): Promise<void> => {
  try {
    await ensureRecordingsDir();
    const recordings = await getRecordings();
    recordings.push(recording);
    await AsyncStorage.setItem(RECORDINGS_KEY, JSON.stringify(recordings));
  } catch (e) {
    console.error('Error saving recording:', e);
    throw e;
  }
};

// Delete a recording
export const deleteRecording = async (id: string): Promise<void> => {
  try {
    const recordings = await getRecordings();
    const recording = recordings.find(r => r.id === id);
    
    if (recording) {
      // Delete the file
      const fileInfo = await FileSystem.getInfoAsync(recording.uri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(recording.uri, { idempotent: true });
      }
      
      // Remove from storage
      const updatedRecordings = recordings.filter(r => r.id !== id);
      await AsyncStorage.setItem(RECORDINGS_KEY, JSON.stringify(updatedRecordings));
    }
  } catch (e) {
    console.error('Error deleting recording:', e);
    throw e;
  }
};

// Format duration in seconds to MM:SS format
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Format date and time
export const formatDateTime = (dateTimeString: string): string => {
  const date = new Date(dateTimeString);
  return date.toLocaleString();
};
