import { useState, useEffect, useCallback, useRef } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { AppState, AppStateStatus } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

// Grace period before saving in background (native task gives ~25s, we use 20s)
const BACKGROUND_SAVE_DELAY = 20000;
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
  const backgroundSaveTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Refs for callbacks (to access current state)
  const recordingRef = useRef(recording);
  const isRecordingRef = useRef(isRecording);
  const isPausedRef = useRef(isPaused);
  const recordingsRef = useRef(recordings);
  const recordingStartTimeRef = useRef(recordingStartTime);
  const pausedDurationRef = useRef(pausedDuration);
  
  // Keep refs in sync
  useEffect(() => {
    recordingRef.current = recording;
    isRecordingRef.current = isRecording;
    isPausedRef.current = isPaused;
    recordingsRef.current = recordings;
    recordingStartTimeRef.current = recordingStartTime;
    pausedDurationRef.current = pausedDuration;
  }, [recording, isRecording, isPaused, recordings, recordingStartTime, pausedDuration]);

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

  // Save recording from background (called by timer)
  const saveRecordingFromBackground = useCallback(async () => {
    const currentRecording = recordingRef.current;
    if (!currentRecording || !isRecordingRef.current) {
      return;
    }

    console.log('Background timer fired - saving recording...');
    setIsSaving(true);

    try {
      // Calculate duration
      let finalDuration = Date.now() - recordingStartTimeRef.current - pausedDurationRef.current;
      if (pauseStartTime.current > 0) {
        finalDuration -= (Date.now() - pauseStartTime.current);
      }

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

        const newRecording: Recording = {
          id,
          uri: newUri,
          filename,
          createdAt: createdAtRef.current || new Date().toISOString(),
          duration: Math.max(finalDuration, 0),
        };

        const updatedRecordings = [newRecording, ...recordingsRef.current];
        await saveRecordingMetadata(updatedRecordings);
        setRecordings(updatedRecordings);
        console.log('Recording saved from background');
      }

      try {
        deactivateKeepAwake('recording');
      } catch {}

      setRecording(null);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingDuration(0);
      setRecordingStartTime(0);
      setPausedDuration(0);
      pauseStartTime.current = 0;
      createdAtRef.current = '';
    } catch (error) {
      console.error('Error saving from background:', error);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Handle app background: start timer, cancel on return
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // User returned - cancel timer if exists
        if (backgroundSaveTimer.current) {
          console.log('User returned - canceling background save timer');
          clearTimeout(backgroundSaveTimer.current);
          backgroundSaveTimer.current = null;
        }
        
        // Refresh recordings in case we saved
        refreshRecordings();
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App going to background
        if (isRecordingRef.current && recordingRef.current && !isPausedRef.current) {
          // Don't start timer if interrupted by phone call (handled separately)
          if (!wasInterruptedByPhoneCall.current) {
            console.log('App in background - starting', BACKGROUND_SAVE_DELAY / 1000, 's timer');
            
            // Recording CONTINUES - we just start a timer
            backgroundSaveTimer.current = setTimeout(() => {
              console.log('Background timer expired - saving recording');
              backgroundSaveTimer.current = null;
              saveRecordingFromBackground();
            }, BACKGROUND_SAVE_DELAY);
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
  }, [refreshRecordings, saveRecordingFromBackground]);

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
      newRecording.setOnRecordingStatusUpdate(async (status) => {
        // If recording stops unexpectedly while we think we're recording = phone call started
        if (!status.isRecording && isRecordingRef.current && !isPausedRef.current && !wasInterruptedByPhoneCall.current) {
          console.log('Recording interrupted (phone call started)');
          wasInterruptedByPhoneCall.current = true;
          setIsPaused(true);
          pauseStartTime.current = Date.now();
        }
        
        // If we were interrupted and can record again = phone call ended
        // status.canRecord indicates if audio session is available
        if (wasInterruptedByPhoneCall.current && status.canRecord && isPausedRef.current) {
          console.log('Phone call ended - auto resuming...');
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
            
            await newRecording.startAsync();
            
            if (pauseStartTime.current > 0) {
              setPausedDuration(prev => prev + (Date.now() - pauseStartTime.current));
              pauseStartTime.current = 0;
            }
            
            setIsPaused(false);
            wasInterruptedByPhoneCall.current = false;
            console.log('Recording resumed after phone call');
          } catch (error) {
            console.log('Could not resume yet:', error);
          }
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
