import { useState, useRef } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { saveRecording } from '../services/recordingService';
import { Recording } from '../types/recording';

export const useAudioRecorder = () => {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      // Request permissions
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create a new recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setDuration(0);

      // Start duration counter
      intervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async (): Promise<Recording | null> => {
    if (!recording) return null;

    try {
      setIsRecording(false);
      
      // Clear interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (!uri) {
        throw new Error('Recording URI is null');
      }

      // Generate a unique filename
      const timestamp = Date.now();
      const filename = `recording_${timestamp}.m4a`;
      const newUri = `${FileSystem.documentDirectory}recordings/${filename}`;

      // Move file to recordings directory
      await FileSystem.moveAsync({
        from: uri,
        to: newUri,
      });

      // Create recording object
      const recordingData: Recording = {
        id: timestamp.toString(),
        uri: newUri,
        dateTime: new Date().toISOString(),
        duration: duration,
      };

      // Save to storage
      await saveRecording(recordingData);

      setRecording(null);
      setDuration(0);

      return recordingData;
    } catch (err) {
      console.error('Failed to stop recording', err);
      return null;
    }
  };

  return {
    recording,
    isRecording,
    duration,
    startRecording,
    stopRecording,
  };
};
