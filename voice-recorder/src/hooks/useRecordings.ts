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
  const createdAtRef = useRef<string>('');
  const wasInterruptedByPhoneCall = useRef<boolean>(false);
  
  // Refs for AppState handler (to access current state)
  const recordingRef = useRef(recording);
  const isRecordingRef = useRef(isRecording);
  const isPausedRef = useRef(isPaused);
  
  // Keep refs in sync
  useEffect(() => {
    recordingRef.current = recording;
    isRecordingRef.current = isRecording;
    isPausedRef.current = isPaused;
  }, [recording, isRecording, isPaused]);

  const refreshRecordings = useCallback(async (cleanup: boolean = false) => {
    setIsLoading(true);
    try {
      const loadedRecordings = cleanup 
        ? await cleanupStaleRecordings()
        : await loadRecordingsMetadata();
      
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

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      await ensureRecordingsDirectory();
      await refreshRecordings(true);
    };
    init();
  }, [refreshRecordings]);

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

  // Handle phone call interruption: auto-resume when call ends
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      // When app becomes active after phone call, resume recording
      if (nextAppState === 'active') {
        if (wasInterruptedByPhoneCall.current && recordingRef.current && isPausedRef.current) {
          console.log('Phone call ended - resuming recording...');
          try {
            // Re-configure audio mode
            await Audio.setAudioModeAsync({
              allowsRecordingIOS: true,
              playsInSilentModeIOS: true,
              staysActiveInBackground: true,
              interruptionModeIOS: InterruptionModeIOS.DoNotMix,
              interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
              shouldDuckAndroid: false,
              playThroughEarpieceAndroid: false,
            });

            // Resume the recording
            await recordingRef.current.startAsync();
            
            // Account for paused time
            if (pauseStartTime.current > 0) {
              setPausedDuration(prev => prev + (Date.now() - pauseStartTime.current));
              pauseStartTime.current = 0;
            }
            
            setIsPaused(false);
            wasInterruptedByPhoneCall.current = false;
            console.log('Recording resumed after phone call');
          } catch (error) {
            console.error('Error resuming after phone call:', error);
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.error('Permission denied');
        return;
      }

      // Set audio mode - staysActiveInBackground allows recording when screen sleeps
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      // Create and start recording
      const newRecording = new Audio.Recording();
      
      // Detect phone call interruptions via status updates
      newRecording.setOnRecordingStatusUpdate((status) => {
        // If recording stops unexpectedly while we think we're recording = phone call
        if (!status.isRecording && isRecordingRef.current && !isPausedRef.current) {
          console.log('Recording interrupted (phone call detected)');
          wasInterruptedByPhoneCall.current = true;
          setIsPaused(true);
          pauseStartTime.current = Date.now();
        }
      });
      
      await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRecording.startAsync();

      // Keep screen awake during recording
      try {
        await activateKeepAwakeAsync('recording');
        console.log('Keep-awake activated');
      } catch (e) {
        console.log('Could not activate keep-awake:', e);
      }

      setRecording(newRecording);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingStartTime(Date.now());
      setRecordingDuration(0);
      setPausedDuration(0);
      createdAtRef.current = new Date().toISOString();
      
      console.log('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, []);

  const pauseRecording = useCallback(async () => {
    if (!recording || !isRecording || isPaused) return;

    try {
      await recording.pauseAsync();
      setIsPaused(true);
      pauseStartTime.current = Date.now();
      console.log('Recording paused');
    } catch (error) {
      console.error('Error pausing:', error);
    }
  }, [recording, isRecording, isPaused]);

  const resumeRecording = useCallback(async () => {
    if (!recording || !isRecording || !isPaused) return;

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

      await recording.startAsync();
      
      if (pauseStartTime.current > 0) {
        setPausedDuration(prev => prev + (Date.now() - pauseStartTime.current));
        pauseStartTime.current = 0;
      }
      
      setIsPaused(false);
      console.log('Recording resumed');
    } catch (error) {
      console.error('Error resuming:', error);
    }
  }, [recording, isRecording, isPaused]);

  const stopRecording = useCallback(async () => {
    if (!recording) return;

    setIsSaving(true);
    try {
      setIsRecording(false);
      setIsPaused(false);
      
      // Calculate duration
      let finalDuration = Date.now() - recordingStartTime - pausedDuration;
      if (pauseStartTime.current > 0) {
        finalDuration -= (Date.now() - pauseStartTime.current);
      }

      await recording.stopAndUnloadAsync();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recording.getURI();
      if (uri) {
        const id = Date.now().toString();
        const filename = `recording_${id}.m4a`;
        const newUri = `${getRecordingsDirectory()}${filename}`;

        await FileSystem.moveAsync({ from: uri, to: newUri });

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
        console.log('Recording saved');
      }

      // Deactivate keep-awake
      try {
        deactivateKeepAwake('recording');
        console.log('Keep-awake deactivated');
      } catch (e) {
        console.log('Could not deactivate keep-awake:', e);
      }

      setRecording(null);
      setRecordingDuration(0);
      setRecordingStartTime(0);
      setPausedDuration(0);
      pauseStartTime.current = 0;
      createdAtRef.current = '';
    } catch (error) {
      console.error('Error stopping:', error);
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
        console.error('Error deleting:', error);
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
