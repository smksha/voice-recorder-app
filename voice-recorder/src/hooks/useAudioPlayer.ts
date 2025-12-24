import { useState, useCallback, useEffect } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  currentlyPlayingId: string | null;
  playbackPosition: number;
  playbackDuration: number;
  playRecording: (id: string, uri: string) => Promise<void>;
  stopPlayback: () => Promise<void>;
  pausePlayback: () => Promise<void>;
  resumePlayback: () => Promise<void>;
}

export const useAudioPlayer = (): UseAudioPlayerReturn => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setPlaybackPosition(status.positionMillis);
      setPlaybackDuration(status.durationMillis || 0);
      setIsPlaying(status.isPlaying);

      if (status.didJustFinish) {
        setIsPlaying(false);
        setCurrentlyPlayingId(null);
        setPlaybackPosition(0);
      }
    }
  }, []);

  const playRecording = useCallback(
    async (id: string, uri: string) => {
      try {
        // Check if file exists first
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (!fileInfo.exists) {
          console.error('Recording file not found:', uri);
          Alert.alert(
            'File Not Found',
            'This recording file no longer exists. It may have been deleted when the app was reinstalled.',
            [{ text: 'OK' }]
          );
          setIsPlaying(false);
          setCurrentlyPlayingId(null);
          return;
        }

        // Stop any existing playback
        if (sound) {
          await sound.unloadAsync();
          setSound(null);
        }

        // Set audio mode for playback
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });

        // Load and play the recording
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );

        setSound(newSound);
        setCurrentlyPlayingId(id);
        setIsPlaying(true);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error playing recording:', error);
        console.error('Recording URI:', uri);
        Alert.alert(
          'Playback Error',
          `Unable to play this recording.\n\nDetails: ${errorMessage}`
        );
        setIsPlaying(false);
        setCurrentlyPlayingId(null);
      }
    },
    [sound, onPlaybackStatusUpdate]
  );

  const stopPlayback = useCallback(async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
      setIsPlaying(false);
      setCurrentlyPlayingId(null);
      setPlaybackPosition(0);
    }
  }, [sound]);

  const pausePlayback = useCallback(async () => {
    if (sound) {
      await sound.pauseAsync();
      setIsPlaying(false);
    }
  }, [sound]);

  const resumePlayback = useCallback(async () => {
    if (sound) {
      await sound.playAsync();
      setIsPlaying(true);
    }
  }, [sound]);

  return {
    isPlaying,
    currentlyPlayingId,
    playbackPosition,
    playbackDuration,
    playRecording,
    stopPlayback,
    pausePlayback,
    resumePlayback,
  };
};
