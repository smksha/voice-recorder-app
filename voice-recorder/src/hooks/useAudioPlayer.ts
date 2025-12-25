import { useState, useCallback, useEffect, useRef } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  currentlyPlayingId: string | null;
  playbackPosition: number;
  playbackDuration: number;
  playRecording: (id: string, uri: string, segments?: string[]) => Promise<void>;
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
  
  // Multi-segment playback state
  const segmentsRef = useRef<string[]>([]);
  const currentSegmentIndex = useRef<number>(0);
  const segmentDurations = useRef<number[]>([]);
  const positionOffset = useRef<number>(0);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const playNextSegment = useCallback(async () => {
    const nextIndex = currentSegmentIndex.current + 1;
    
    if (nextIndex >= segmentsRef.current.length) {
      // All segments played
      setIsPlaying(false);
      setCurrentlyPlayingId(null);
      setPlaybackPosition(0);
      positionOffset.current = 0;
      return;
    }
    
    // Update offset with previous segment's duration
    positionOffset.current += segmentDurations.current[currentSegmentIndex.current] || 0;
    currentSegmentIndex.current = nextIndex;
    
    const nextUri = segmentsRef.current[nextIndex];
    
    try {
      if (sound) {
        await sound.unloadAsync();
      }
      
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: nextUri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      
      setSound(newSound);
    } catch (error) {
      console.error('Error playing next segment:', error);
      setIsPlaying(false);
      setCurrentlyPlayingId(null);
    }
  }, [sound]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      // Store current segment duration
      if (status.durationMillis) {
        segmentDurations.current[currentSegmentIndex.current] = status.durationMillis;
      }
      
      // Calculate total position (offset + current position)
      const totalPosition = positionOffset.current + status.positionMillis;
      setPlaybackPosition(totalPosition);
      setIsPlaying(status.isPlaying);

      if (status.didJustFinish) {
        // Check if there are more segments
        if (currentSegmentIndex.current < segmentsRef.current.length - 1) {
          playNextSegment();
        } else {
          // All done
          setIsPlaying(false);
          setCurrentlyPlayingId(null);
          setPlaybackPosition(0);
          positionOffset.current = 0;
        }
      }
    }
  }, [playNextSegment]);

  const playRecording = useCallback(
    async (id: string, uri: string, segments?: string[]) => {
      try {
        // Determine which URIs to play
        const urisToPlay = segments && segments.length > 0 ? segments : [uri];
        
        // Verify first file exists
        const fileInfo = await FileSystem.getInfoAsync(urisToPlay[0]);
        if (!fileInfo.exists) {
          console.error('Recording file not found:', urisToPlay[0]);
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

        // Reset segment tracking
        segmentsRef.current = urisToPlay;
        currentSegmentIndex.current = 0;
        segmentDurations.current = [];
        positionOffset.current = 0;

        // Set audio mode for playback
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });

        // Load and play the first segment
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: urisToPlay[0] },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );

        setSound(newSound);
        setCurrentlyPlayingId(id);
        setIsPlaying(true);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error playing recording:', error);
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
      positionOffset.current = 0;
      currentSegmentIndex.current = 0;
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
