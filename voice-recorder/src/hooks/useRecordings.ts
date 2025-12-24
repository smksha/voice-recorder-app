import { useState, useEffect, useCallback, useRef } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { AppState, AppStateStatus } from 'react-native';
import { Recording } from '../types/Recording';
import {
  loadRecordingsMetadata,
  saveRecordingMetadata,
  deleteRecordingFile,
  ensureRecordingsDirectory,
  getRecordingsDirectory,
} from '../utils/storage';

interface UseRecordingsReturn {
  recordings: Recording[];
  isRecording: boolean;
  isPaused: boolean;
  recordingDuration: number;
  isLoading: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  deleteRecording: (id: string) => Promise<void>;
  refreshRecordings: () => Promise<void>;
}

export const useRecordings = (): UseRecordingsReturn => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
  const [pausedDuration, setPausedDuration] = useState<number>(0);
  const pauseStartTime = useRef<number>(0);
  const wasRecordingBeforeBackground = useRef<boolean>(false);
  const wasInterruptedByPhoneCall = useRef<boolean>(false);

  const refreshRecordings = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedRecordings = await loadRecordingsMetadata();
      // Sort by date, newest first
      loadedRecordings.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRecordings(loadedRecordings);
    } catch (error) {
      console.error('Error refreshing recordings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize audio and load recordings on mount
  useEffect(() => {
    const init = async () => {
      // Initialize audio mode with interruption handling
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch (error) {
        console.error('Error setting initial audio mode:', error);
      }
      
      await ensureRecordingsDirectory();
      await refreshRecordings();
    };
    init();
  }, [refreshRecordings]);

  // Reference to track current recording state for background handler
  const isRecordingRef = useRef(isRecording);
  const isPausedRef = useRef(isPaused);
  const recordingRef = useRef(recording);
  const recordingStartTimeRef = useRef(recordingStartTime);
  const pausedDurationRef = useRef(pausedDuration);
  const recordingsRef = useRef(recordings);

  // Keep refs in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
    isPausedRef.current = isPaused;
    recordingRef.current = recording;
    recordingStartTimeRef.current = recordingStartTime;
    pausedDurationRef.current = pausedDuration;
    recordingsRef.current = recordings;
  }, [isRecording, isPaused, recording, recordingStartTime, pausedDuration, recordings]);

  // Function to save recording (used by background timer and stop button)
  const saveCurrentRecording = useCallback(async () => {
    const currentRecording = recordingRef.current;
    if (!currentRecording) return;

    try {
      // Calculate final duration
      let finalDuration = Date.now() - recordingStartTimeRef.current - pausedDurationRef.current;
      if (pauseStartTime.current > 0) {
        finalDuration -= (Date.now() - pauseStartTime.current);
      }

      // Stop and save the recording
      await currentRecording.stopAndUnloadAsync();

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });

      const uri = currentRecording.getURI();
      if (uri) {
        const id = Date.now().toString();
        const filename = `recording_${id}.m4a`;
        const newUri = `${getRecordingsDirectory()}${filename}`;

        // Move recording to our directory
        await FileSystem.moveAsync({
          from: uri,
          to: newUri,
        });

        const newRecording: Recording = {
          id,
          uri: newUri,
          filename,
          createdAt: new Date().toISOString(),
          duration: Math.max(finalDuration, 0),
        };

        const updatedRecordings = [newRecording, ...recordingsRef.current];
        await saveRecordingMetadata(updatedRecordings);
        setRecordings(updatedRecordings);
        
        console.log('Recording saved successfully');
      }

      // Reset state
      setRecording(null);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingDuration(0);
      setRecordingStartTime(0);
      setPausedDuration(0);
      pauseStartTime.current = 0;
      wasRecordingBeforeBackground.current = false;
      wasInterruptedByPhoneCall.current = false;
    } catch (error) {
      console.error('Error saving recording:', error);
    }
  }, []);

  // Handle app state changes (phone calls, app backgrounding)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground
        console.log('App active');

        // Auto-resume ONLY if it was a phone call interruption (recording is still paused, not saved)
        if (wasInterruptedByPhoneCall.current && wasRecordingBeforeBackground.current && recordingRef.current && isPausedRef.current) {
          console.log('Phone call ended - auto-resuming recording...');
          try {
            // Re-set audio mode before resuming
            await Audio.setAudioModeAsync({
              allowsRecordingIOS: true,
              playsInSilentModeIOS: true,
              staysActiveInBackground: true,
              interruptionModeIOS: InterruptionModeIOS.DoNotMix,
              interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
              shouldDuckAndroid: false,
              playThroughEarpieceAndroid: false,
            });

            await recordingRef.current.startAsync();
            
            // Track how long we were paused
            if (pauseStartTime.current > 0) {
              setPausedDuration(prev => prev + (Date.now() - pauseStartTime.current));
              pauseStartTime.current = 0;
            }
            
            setIsPaused(false);
            wasRecordingBeforeBackground.current = false;
            wasInterruptedByPhoneCall.current = false;
            console.log('Recording resumed automatically after phone call');
          } catch (error) {
            console.error('Error auto-resuming recording:', error);
            // If resume fails, refresh to show any saved recordings
            refreshRecordings();
          }
        } else {
          // For non-phone-call backgrounding, recording was already saved
          // Refresh recordings list to show the saved recording
          refreshRecordings();
        }
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App going to background
        if (isRecordingRef.current && recordingRef.current && !isPausedRef.current) {
          
          // Check if this is a phone call interruption
          if (wasInterruptedByPhoneCall.current) {
            // Phone call: just pause, will resume after call ends
            console.log('Phone call detected - pausing recording, will resume after call');
            try {
              await recordingRef.current.pauseAsync();
              setIsPaused(true);
              pauseStartTime.current = Date.now();
              wasRecordingBeforeBackground.current = true;
            } catch (error) {
              console.error('Error pausing recording:', error);
            }
          } else {
            // User backgrounding: SAVE IMMEDIATELY to prevent data loss on kill
            console.log('App backgrounding - saving recording immediately...');
            await saveCurrentRecording();
          }
          
        } else if (wasInterruptedByPhoneCall.current && isPausedRef.current) {
          // Already paused by phone call interruption
          console.log('Already paused by phone call, waiting for call to end...');
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [saveCurrentRecording, refreshRecordings]);

  // Update recording duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused && recordingStartTime) {
      interval = setInterval(() => {
        setRecordingDuration(Date.now() - recordingStartTime - pausedDuration);
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, isPaused, recordingStartTime, pausedDuration]);

  const startRecording = useCallback(async () => {
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.error('Permission to access microphone denied');
        return;
      }

      // Set audio mode for recording with interruption handling
      // staysActiveInBackground: true allows recording to continue briefly in background
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      // Create a new recording instance
      const newRecording = new Audio.Recording();
      
      // Set up status update callback to handle interruptions (e.g., phone calls)
      newRecording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording === false && isRecordingRef.current && !isPausedRef.current) {
          // Recording was interrupted externally (e.g., phone call)
          console.log('Recording interrupted by phone call or system');
          wasInterruptedByPhoneCall.current = true;
          setIsPaused(true);
          pauseStartTime.current = Date.now();
          wasRecordingBeforeBackground.current = true;
        }
      });
      
      // Prepare the recording
      await newRecording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      // Start recording
      await newRecording.startAsync();

      setRecording(newRecording);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingStartTime(Date.now());
      setRecordingDuration(0);
      setPausedDuration(0);
      wasRecordingBeforeBackground.current = false;
      wasInterruptedByPhoneCall.current = false;
    } catch (error) {
      console.error('Error starting recording:', error);
      // Reset audio mode on error
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    }
  }, [isRecording, isPaused]);

  const pauseRecording = useCallback(async () => {
    if (!recording || !isRecording || isPaused) return;

    try {
      await recording.pauseAsync();
      setIsPaused(true);
      pauseStartTime.current = Date.now();
      console.log('Recording paused');
    } catch (error) {
      console.error('Error pausing recording:', error);
    }
  }, [recording, isRecording, isPaused]);

  const resumeRecording = useCallback(async () => {
    if (!recording || !isRecording || !isPaused) return;

    try {
      // Re-set audio mode before resuming (important after phone call)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      await recording.startAsync();
      
      // Track how long we were paused
      if (pauseStartTime.current > 0) {
        setPausedDuration(prev => prev + (Date.now() - pauseStartTime.current));
        pauseStartTime.current = 0;
      }
      
      setIsPaused(false);
      wasRecordingBeforeBackground.current = false;
      wasInterruptedByPhoneCall.current = false;
      console.log('Recording resumed');
    } catch (error) {
      console.error('Error resuming recording:', error);
    }
  }, [recording, isRecording, isPaused]);

  const stopRecording = useCallback(async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      setIsPaused(false);
      
      // Calculate final duration accounting for paused time
      let finalDuration = Date.now() - recordingStartTime - pausedDuration;
      if (pauseStartTime.current > 0) {
        finalDuration -= (Date.now() - pauseStartTime.current);
      }

      await recording.stopAndUnloadAsync();

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });

      const uri = recording.getURI();
      if (uri) {
        const id = Date.now().toString();
        const filename = `recording_${id}.m4a`;
        const newUri = `${getRecordingsDirectory()}${filename}`;

        // Move recording to our directory
        await FileSystem.moveAsync({
          from: uri,
          to: newUri,
        });

        const newRecording: Recording = {
          id,
          uri: newUri,
          filename,
          createdAt: new Date().toISOString(),
          duration: Math.max(finalDuration, 0),
        };

        const updatedRecordings = [newRecording, ...recordings];
        await saveRecordingMetadata(updatedRecordings);
        setRecordings(updatedRecordings);
      }

      setRecording(null);
      setRecordingDuration(0);
      setRecordingStartTime(0);
      setPausedDuration(0);
      pauseStartTime.current = 0;
      wasRecordingBeforeBackground.current = false;
      wasInterruptedByPhoneCall.current = false;
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  }, [recording, recordingStartTime, pausedDuration, recordings]);

  const deleteRecording = useCallback(
    async (id: string) => {
      try {
        const recordingToDelete = recordings.find((r) => r.id === id);
        if (recordingToDelete) {
          await deleteRecordingFile(recordingToDelete.uri);
        }

        const updatedRecordings = recordings.filter((r) => r.id !== id);
        await saveRecordingMetadata(updatedRecordings);
        setRecordings(updatedRecordings);
      } catch (error) {
        console.error('Error deleting recording:', error);
      }
    },
    [recordings]
  );

  return {
    recordings,
    isRecording,
    isPaused,
    recordingDuration,
    isLoading,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    deleteRecording,
    refreshRecordings,
  };
};
