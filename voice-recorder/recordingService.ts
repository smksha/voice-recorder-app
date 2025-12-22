import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Recording, RecordingMetadata } from './types';

const RECORDINGS_KEY = '@voice_recorder_recordings';

export class RecordingService {
  private recording: Audio.Recording | null = null;
  private recordingStartTime: number = 0;

  /**
   * Request audio recording permissions
   */
  static async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Start a new recording
   */
  async startRecording(): Promise<void> {
    try {
      // Set audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      this.recording = recording;
      this.recordingStartTime = Date.now();
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  /**
   * Stop the current recording and save it
   */
  async stopRecording(): Promise<Recording | null> {
    try {
      if (!this.recording) {
        return null;
      }

      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      
      if (!uri) {
        return null;
      }

      const duration = Date.now() - this.recordingStartTime;
      const id = Date.now().toString();
      const date = new Date();

      // Create permanent file location
      const fileExtension = uri.split('.').pop();
      const permanentUri = `${FileSystem.documentDirectory}recording_${id}.${fileExtension}`;

      // Move the recording to permanent storage
      await FileSystem.moveAsync({
        from: uri,
        to: permanentUri,
      });

      const newRecording: Recording = {
        id,
        uri: permanentUri,
        date,
        duration,
      };

      // Save to storage
      await this.saveRecording(newRecording);

      this.recording = null;
      return newRecording;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      this.recording = null;
      throw error;
    }
  }

  /**
   * Save recording metadata to AsyncStorage
   */
  private async saveRecording(recording: Recording): Promise<void> {
    try {
      const recordings = await this.getAllRecordings();
      const metadata: RecordingMetadata = {
        id: recording.id,
        uri: recording.uri,
        date: recording.date.toISOString(),
        duration: recording.duration,
      };
      
      recordings.push(metadata);
      await AsyncStorage.setItem(RECORDINGS_KEY, JSON.stringify(recordings));
    } catch (error) {
      console.error('Failed to save recording:', error);
      throw error;
    }
  }

  /**
   * Get all recordings from storage
   */
  async getAllRecordings(): Promise<RecordingMetadata[]> {
    try {
      const data = await AsyncStorage.getItem(RECORDINGS_KEY);
      if (!data) {
        return [];
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to get recordings:', error);
      return [];
    }
  }

  /**
   * Delete a recording
   */
  async deleteRecording(id: string): Promise<void> {
    try {
      const recordings = await this.getAllRecordings();
      const recording = recordings.find((r) => r.id === id);
      
      if (recording) {
        // Delete the file
        await FileSystem.deleteAsync(recording.uri, { idempotent: true });
        
        // Remove from storage
        const updatedRecordings = recordings.filter((r) => r.id !== id);
        await AsyncStorage.setItem(RECORDINGS_KEY, JSON.stringify(updatedRecordings));
      }
    } catch (error) {
      console.error('Failed to delete recording:', error);
      throw error;
    }
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recording !== null;
  }
}

export class PlaybackService {
  private sound: Audio.Sound | null = null;

  /**
   * Play a recording
   */
  async playRecording(uri: string): Promise<void> {
    try {
      // Unload previous sound if exists
      if (this.sound) {
        await this.sound.unloadAsync();
      }

      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );

      this.sound = sound;

      // Automatically unload when playback finishes
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          this.unload();
        }
      });
    } catch (error) {
      console.error('Failed to play recording:', error);
      throw error;
    }
  }

  /**
   * Stop playback
   */
  async stopPlayback(): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.stopAsync();
      }
    } catch (error) {
      console.error('Failed to stop playback:', error);
      throw error;
    }
  }

  /**
   * Unload the sound
   */
  async unload(): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.unloadAsync();
        this.sound = null;
      }
    } catch (error) {
      console.error('Failed to unload sound:', error);
    }
  }

  /**
   * Check if currently playing
   */
  async isPlaying(): Promise<boolean> {
    try {
      if (!this.sound) {
        return false;
      }
      const status = await this.sound.getStatusAsync();
      return status.isLoaded && status.isPlaying;
    } catch (error) {
      return false;
    }
  }
}
