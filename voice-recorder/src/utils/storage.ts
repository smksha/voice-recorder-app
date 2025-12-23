import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Recording } from '../types/Recording';

const RECORDINGS_KEY = 'voice_recordings';

export const getRecordingsDirectory = (): string => {
  return `${FileSystem.documentDirectory}recordings/`;
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
