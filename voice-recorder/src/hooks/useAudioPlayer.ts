import { useState, useCallback, useEffect } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';

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
      } catch (error) {
        console.error('Error playing recording:', error);
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
