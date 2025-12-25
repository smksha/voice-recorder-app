import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Recording } from '../types/Recording';

const RECORDINGS_KEY = 'voice_recordings';
const TEMP_RECORDING_KEY = 'temp_recording_metadata';

export const getRecordingsDirectory = (): string => {
  return `${FileSystem.documentDirectory}recordings/`;
};

export const getTempRecordingsDirectory = (): string => {
  return `${FileSystem.documentDirectory}temp_recordings/`;
};

// Temp recording metadata for recovery after app kill
export interface TempRecordingMetadata {
  uri: string;
  filename: string;
  createdAt: string;
  durationAtPause: number;
}

export const saveTempRecordingMetadata = async (
  metadata: TempRecordingMetadata
): Promise<void> => {
  try {
    await AsyncStorage.setItem(TEMP_RECORDING_KEY, JSON.stringify(metadata));
    console.log('Temp recording metadata saved');
  } catch (error) {
    console.error('Error saving temp recording metadata:', error);
  }
};

export const loadTempRecordingMetadata = async (): Promise<TempRecordingMetadata | null> => {
  try {
    const data = await AsyncStorage.getItem(TEMP_RECORDING_KEY);
    if (data) {
      return JSON.parse(data) as TempRecordingMetadata;
    }
    return null;
  } catch (error) {
    console.error('Error loading temp recording metadata:', error);
    return null;
  }
};

export const clearTempRecordingMetadata = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(TEMP_RECORDING_KEY);
    console.log('Temp recording metadata cleared');
  } catch (error) {
    console.error('Error clearing temp recording metadata:', error);
  }
};

export const ensureTempRecordingsDirectory = async (): Promise<void> => {
  const dirInfo = await FileSystem.getInfoAsync(getTempRecordingsDirectory());
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(getTempRecordingsDirectory(), {
      intermediates: true,
    });
  }
};

export const deleteTempRecordingFile = async (uri: string): Promise<void> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(uri);
      console.log('Temp recording file deleted:', uri);
    }
  } catch (error) {
    console.error('Error deleting temp recording file:', error);
  }
};

export const ensureRecordingsDirectory = async (): Promise<void> => {
  const dirInfo = await FileSystem.getInfoAsync(getRecordingsDirectory());
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(getRecordingsDirectory(), {
      intermediates: true,
    });
  }
};

export const saveRecordingMetadata = async (
  recordings: Recording[]
): Promise<void> => {
  try {
    await AsyncStorage.setItem(RECORDINGS_KEY, JSON.stringify(recordings));
  } catch (error) {
    console.error('Error saving recordings metadata:', error);
    throw error;
  }
};

export const loadRecordingsMetadata = async (): Promise<Recording[]> => {
  try {
    const data = await AsyncStorage.getItem(RECORDINGS_KEY);
    if (data) {
      return JSON.parse(data) as Recording[];
    }
    return [];
  } catch (error) {
    console.error('Error loading recordings metadata:', error);
    return [];
  }
};

export const deleteRecordingFile = async (uri: string): Promise<void> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(uri);
    }
  } catch (error) {
    console.error('Error deleting recording file:', error);
    throw error;
  }
};

// Clean up recordings whose files no longer exist (e.g., after app reinstall)
export const cleanupStaleRecordings = async (): Promise<Recording[]> => {
  try {
    const recordings = await loadRecordingsMetadata();
    const validRecordings: Recording[] = [];
    
    for (const recording of recordings) {
      const fileInfo = await FileSystem.getInfoAsync(recording.uri);
      if (fileInfo.exists) {
        validRecordings.push(recording);
      } else {
        console.log('Removing stale recording (file not found):', recording.filename);
      }
    }
    
    // Save cleaned up list if any were removed
    if (validRecordings.length !== recordings.length) {
      await saveRecordingMetadata(validRecordings);
      console.log(`Cleaned up ${recordings.length - validRecordings.length} stale recordings`);
    }
    
    return validRecordings;
  } catch (error) {
    console.error('Error cleaning up stale recordings:', error);
    return [];
  }
};
