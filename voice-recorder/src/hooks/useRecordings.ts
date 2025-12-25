import { useState, useEffect, useCallback, useRef } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { AppState, AppStateStatus } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Recording } from '../types/Recording';
import {
  loadRecordingsMetadata,
  saveRecordingMetadata,
  deleteRecordingFile,
  ensureRecordingsDirectory,
  getRecordingsDirectory,
  cleanupStaleRecordings,
} from '../utils/storage';

interface UseRecordingsReturn {
  recordings: Recording[];
  isRecording: boolean;
  isPaused: boolean;
  recordingDuration: number;
  isLoading: boolean;
  isSaving: boolean;
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
  const [isSaving, setIsSaving] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
  const [pausedDuration, setPausedDuration] = useState<number>(0);
  const pauseStartTime = useRef<number>(0);
  const wasInterruptedByPhoneCall = useRef<boolean>(false);
  const createdAtRef = useRef<string>('');
  const backgroundSaveTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Delay before auto-saving in background (native task gives ~25s, we use 20s)
  const BACKGROUND_SAVE_DELAY = 20000;

  const refreshRecordings = useCallback(async (cleanup: boolean = false) => {
    setIsLoading(true);
    try {
      // If cleanup is true, remove recordings whose files no longer exist
      const loadedRecordings = cleanup 
        ? await cleanupStaleRecordings()
        : await loadRecordingsMetadata();
      
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
      
      // Cleanup stale recordings and load list
      await refreshRecordings(true);
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

  // Save recording helper (used by timer and stop button)
  const saveRecordingInBackground = useCallback(async () => {
    const currentRecording = recordingRef.current;
    if (!currentRecording || !isRecordingRef.current) {
      console.log('No active recording to save');
      return;
    }

    console.log('Saving recording...');
    setIsSaving(true);
    
    try {
      const duration = Date.now() - recordingStartTimeRef.current - pausedDurationRef.current;
      
      await currentRecording.stopAndUnloadAsync();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = currentRecording.getURI();
      if (uri) {
        const id = Date.now().toString();
        const filename = `recording_${id}.m4a`;
        const newUri = `${getRecordingsDirectory()}${filename}`;

        await FileSystem.moveAsync({ from: uri, to: newUri });

        const newRec: Recording = {
          id,
          uri: newUri,
          filename,
          createdAt: createdAtRef.current || new Date().toISOString(),
          duration: Math.max(duration, 0),
        };

        const updated = [newRec, ...recordingsRef.current];
        await saveRecordingMetadata(updated);
        setRecordings(updated);
        console.log('Recording saved');
      }

      try { deactivateKeepAwake('recording'); } catch {}

      setRecording(null);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingDuration(0);
      setRecordingStartTime(0);
      setPausedDuration(0);
      createdAtRef.current = '';
      
    } catch (error) {
      console.error('Error saving recording:', error);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Handle app state changes
  // Background: PAUSE recording, set safety timer to save after 20s
  // Return: RESUME recording (cancel timer)
  // Phone call: same pause/resume behavior
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('App active');

        // Cancel background save timer - user returned
        if (backgroundSaveTimer.current) {
          console.log('User returned - canceling save timer');
          clearTimeout(backgroundSaveTimer.current);
          backgroundSaveTimer.current = null;
        }

        // Resume recording if it was paused (either by background or phone call)
        if (recordingRef.current && isPausedRef.current && isRecordingRef.current) {
          console.log('Resuming recording...');
          try {
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
            
            if (pauseStartTime.current > 0) {
              setPausedDuration(prev => prev + (Date.now() - pauseStartTime.current));
              pauseStartTime.current = 0;
            }
            
            setIsPaused(false);
            wasInterruptedByPhoneCall.current = false;
            console.log('Recording resumed');
          } catch (error) {
            console.error('Error resuming:', error);
          }
        }
        
        // Refresh list when coming to foreground
        refreshRecordings();
        
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App going to background - PAUSE recording
        if (isRecordingRef.current && recordingRef.current && !isPausedRef.current) {
          console.log('Background - pausing recording...');
          try {
            await recordingRef.current.pauseAsync();
            setIsPaused(true);
            pauseStartTime.current = Date.now();
            
            // Set safety timer: if user doesn't return within 20s, save recording
            // This protects against app kill (paused files are not finalized)
            // Native beginBackgroundTask gives ~25s, we use 20s for safety
            console.log('Setting 20s save timer (safety net for app kill)');
            backgroundSaveTimer.current = setTimeout(() => {
              console.log('Save timer fired - saving recording');
              backgroundSaveTimer.current = null;
              saveRecordingInBackground();
            }, BACKGROUND_SAVE_DELAY);
            
          } catch (error) {
            console.error('Error pausing:', error);
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      if (backgroundSaveTimer.current) {
        clearTimeout(backgroundSaveTimer.current);
      }
    };
  }, [refreshRecordings, saveRecordingInBackground]);

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
        }
      });
      
      // Prepare the recording
      await newRecording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      // Start recording
      await newRecording.startAsync();

      // Keep screen awake during recording
      try {
        await activateKeepAwakeAsync('recording');
        console.log('Screen keep-awake activated');
      } catch (e) {
        console.log('Could not activate keep-awake:', e);
      }

      setRecording(newRecording);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingStartTime(Date.now());
      setRecordingDuration(0);
      setPausedDuration(0);
      wasInterruptedByPhoneCall.current = false;
      createdAtRef.current = new Date().toISOString();
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
      wasInterruptedByPhoneCall.current = false;
      console.log('Recording resumed');
    } catch (error) {
      console.error('Error resuming recording:', error);
    }
  }, [recording, isRecording, isPaused]);

  const stopRecording = useCallback(async () => {
    if (!recording) return;

    setIsSaving(true);
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
          createdAt: createdAtRef.current || new Date().toISOString(),
          duration: Math.max(finalDuration, 0),
        };

        const updatedRecordings = [newRecording, ...recordings];
        await saveRecordingMetadata(updatedRecordings);
        setRecordings(updatedRecordings);
      }

      // Deactivate keep-awake
      try {
        deactivateKeepAwake('recording');
      } catch {}

      setRecording(null);
      setRecordingDuration(0);
      setRecordingStartTime(0);
      setPausedDuration(0);
      pauseStartTime.current = 0;
      wasInterruptedByPhoneCall.current = false;
      createdAtRef.current = '';
    } catch (error) {
      console.error('Error stopping recording:', error);
    } finally {
      setIsSaving(false);
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
    isSaving,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    deleteRecording,
    refreshRecordings,
  };
};
