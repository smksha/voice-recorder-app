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
  saveTempRecordingMetadata,
  loadTempRecordingMetadata,
  clearTempRecordingMetadata,
  ensureTempRecordingsDirectory,
  getTempRecordingsDirectory,
  deleteTempRecordingFile,
  TempRecordingMetadata,
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
  const tempRecordingUri = useRef<string | null>(null);
  const createdAtRef = useRef<string>('');
  const backgroundBackupTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Time to wait before creating backup when in background (ms)
  // This gives user time to quickly return without losing recording continuity
  const BACKGROUND_BACKUP_DELAY = 5000; // 5 seconds

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
      await ensureTempRecordingsDirectory();
      
      // Check for pending temp recording from previous app kill
      const tempMetadata = await loadTempRecordingMetadata();
      if (tempMetadata) {
        console.log('Found pending temp recording from previous session:', tempMetadata);
        
        // Check if the temp file still exists
        const fileInfo = await FileSystem.getInfoAsync(tempMetadata.uri);
        if (fileInfo.exists) {
          // Move temp recording to permanent storage
          const id = Date.now().toString();
          const filename = `recording_${id}.m4a`;
          const newUri = `${getRecordingsDirectory()}${filename}`;
          
          try {
            await FileSystem.moveAsync({
              from: tempMetadata.uri,
              to: newUri,
            });
            
            const recoveredRecording: Recording = {
              id,
              uri: newUri,
              filename,
              createdAt: tempMetadata.createdAt,
              duration: tempMetadata.durationAtPause,
            };
            
            // Add to recordings list
            const currentRecordings = await loadRecordingsMetadata();
            const updatedRecordings = [recoveredRecording, ...currentRecordings];
            await saveRecordingMetadata(updatedRecordings);
            
            console.log('Recovered temp recording as permanent recording');
          } catch (error) {
            console.error('Error recovering temp recording:', error);
          }
        }
        
        // Clear temp metadata
        await clearTempRecordingMetadata();
      }
      
      // Cleanup stale recordings on app start (files that no longer exist)
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

  // Function to save recording (used by background handler and stop button)
  const saveCurrentRecording = useCallback(async () => {
    const currentRecording = recordingRef.current;
    console.log('saveCurrentRecording called, recording exists:', !!currentRecording);
    
    if (!currentRecording) {
      console.log('No recording to save, returning early');
      return;
    }

    try {
      console.log('Starting save process...');
      // Calculate final duration
      let finalDuration = Date.now() - recordingStartTimeRef.current - pausedDurationRef.current;
      if (pauseStartTime.current > 0) {
        finalDuration -= (Date.now() - pauseStartTime.current);
      }
      console.log('Duration calculated:', finalDuration);

      // Stop and save the recording
      console.log('Stopping recording...');
      await currentRecording.stopAndUnloadAsync();
      console.log('Recording stopped');

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });
      console.log('Audio mode reset');

      const uri = currentRecording.getURI();
      console.log('Recording URI:', uri);
      
      if (uri) {
        const id = Date.now().toString();
        const filename = `recording_${id}.m4a`;
        const newUri = `${getRecordingsDirectory()}${filename}`;
        console.log('Moving to:', newUri);

        // Move recording to our directory
        await FileSystem.moveAsync({
          from: uri,
          to: newUri,
        });
        console.log('File moved');

        const newRecording: Recording = {
          id,
          uri: newUri,
          filename,
          createdAt: new Date().toISOString(),
          duration: Math.max(finalDuration, 0),
        };

        const updatedRecordings = [newRecording, ...recordingsRef.current];
        await saveRecordingMetadata(updatedRecordings);
        console.log('Metadata saved');
        
        setRecordings(updatedRecordings);
        console.log('Recording saved successfully!');
      } else {
        console.log('No URI found for recording');
      }

      // Deactivate keep-awake
      try {
        deactivateKeepAwake('recording');
        console.log('Screen keep-awake deactivated');
      } catch (e) {
        console.log('Could not deactivate keep-awake:', e);
      }

      // Clean up any temp backup
      if (tempRecordingUri.current) {
        await deleteTempRecordingFile(tempRecordingUri.current);
        await clearTempRecordingMetadata();
        tempRecordingUri.current = null;
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
      createdAtRef.current = '';
    } catch (error) {
      console.error('Error saving recording:', error);
    }
  }, []);

  // Function to create hidden backup (used by timer and immediate backup)
  const createHiddenBackup = useCallback(async () => {
    const currentRecording = recordingRef.current;
    if (!currentRecording) {
      console.log('No recording to backup');
      return;
    }

    console.log('Creating hidden backup...');
    try {
      // Calculate duration
      const durationAtStop = Date.now() - recordingStartTimeRef.current - pausedDurationRef.current;
      const recordingCreatedAt = createdAtRef.current || new Date().toISOString();
      
      // Stop the recording to finalize the file (creates valid audio)
      await currentRecording.stopAndUnloadAsync();
      console.log('Recording stopped and finalized');

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });

      const currentUri = currentRecording.getURI();
      if (currentUri) {
        // Move to hidden/temp location
        const tempFilename = `hidden_backup_${Date.now()}.m4a`;
        const tempUri = `${getTempRecordingsDirectory()}${tempFilename}`;
        
        console.log('Moving finalized recording to hidden backup:', tempUri);
        await FileSystem.moveAsync({
          from: currentUri,
          to: tempUri,
        });
        
        // Save hidden recording metadata
        const tempMetadata: TempRecordingMetadata = {
          uri: tempUri,
          filename: tempFilename,
          createdAt: recordingCreatedAt,
          durationAtPause: Math.max(durationAtStop, 0),
        };
        await saveTempRecordingMetadata(tempMetadata);
        tempRecordingUri.current = tempUri;
        
        console.log('Hidden backup created (valid audio file)');
      }

      // Deactivate keep-awake
      try {
        deactivateKeepAwake('recording');
      } catch (e) {
        console.log('Could not deactivate keep-awake:', e);
      }

      // Clear the recording object but keep UI state showing "paused"
      setRecording(null);
      setIsPaused(true);
      
    } catch (error) {
      console.error('Error creating hidden backup:', error);
    }
  }, []);

  // Handle app state changes (phone calls, app backgrounding)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground
        console.log('App active');

        // Cancel any pending backup timer
        if (backgroundBackupTimer.current) {
          console.log('Canceling background backup timer - user returned quickly');
          clearTimeout(backgroundBackupTimer.current);
          backgroundBackupTimer.current = null;
        }

        // CASE 1: Phone call interruption - recording was paused, resume it
        if (wasInterruptedByPhoneCall.current && recordingRef.current && isPausedRef.current) {
          console.log('Resuming recording after phone call...');
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
            wasRecordingBeforeBackground.current = false;
            wasInterruptedByPhoneCall.current = false;
            
            console.log('Recording resumed automatically after phone call');
          } catch (error) {
            console.error('Error auto-resuming recording:', error);
            refreshRecordings();
          }
        }
        // CASE 2: Recording is still active (user returned within grace period)
        else if (wasRecordingBeforeBackground.current && recordingRef.current && isRecordingRef.current) {
          console.log('User returned quickly - recording still active, continuing...');
          wasRecordingBeforeBackground.current = false;
          // Recording continues without interruption
        }
        // CASE 3: Recording was stopped (backup was created) - start new recording
        else if (wasRecordingBeforeBackground.current && tempRecordingUri.current) {
          console.log('User returned from background - starting new recording to resume...');
          try {
            // Delete the hidden backup since we're resuming
            console.log('Deleting hidden temp backup:', tempRecordingUri.current);
            await deleteTempRecordingFile(tempRecordingUri.current);
            await clearTempRecordingMetadata();
            tempRecordingUri.current = null;
            
            // Reset flags
            wasRecordingBeforeBackground.current = false;
            
            // Request permissions
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
              console.error('Permission denied');
              setIsRecording(false);
              setIsPaused(false);
              refreshRecordings();
              return;
            }

            await Audio.setAudioModeAsync({
              allowsRecordingIOS: true,
              playsInSilentModeIOS: true,
              staysActiveInBackground: true,
              interruptionModeIOS: InterruptionModeIOS.DoNotMix,
              interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
              shouldDuckAndroid: false,
              playThroughEarpieceAndroid: false,
            });

            const newRecording = new Audio.Recording();
            
            newRecording.setOnRecordingStatusUpdate((recStatus) => {
              if (recStatus.isRecording === false && isRecordingRef.current && !isPausedRef.current) {
                console.log('Recording interrupted by phone call or system');
                wasInterruptedByPhoneCall.current = true;
                setIsPaused(true);
                pauseStartTime.current = Date.now();
                wasRecordingBeforeBackground.current = true;
              }
            });
            
            await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            await newRecording.startAsync();

            try {
              await activateKeepAwakeAsync('recording');
            } catch (e) {
              console.log('Could not activate keep-awake:', e);
            }

            setRecording(newRecording);
            setIsRecording(true);
            setIsPaused(false);
            setRecordingStartTime(Date.now());
            setRecordingDuration(0);
            setPausedDuration(0);
            pauseStartTime.current = 0;
            createdAtRef.current = new Date().toISOString();
            
            console.log('New recording started (resume from background)');
            
          } catch (error) {
            console.error('Error resuming recording:', error);
            setIsRecording(false);
            setIsPaused(false);
            refreshRecordings();
          }
        } else {
          // CASE 4: No active recording session - just refresh list
          // (App was killed case is handled in init useEffect)
          wasRecordingBeforeBackground.current = false;
          refreshRecordings();
        }
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App going to background
        if (isRecordingRef.current && recordingRef.current && !isPausedRef.current) {
          
          // Check if this is a phone call interruption
          if (wasInterruptedByPhoneCall.current) {
            // Phone call: just pause, will resume after call ends (no hidden backup needed)
            console.log('Phone call detected - pausing recording');
            try {
              await recordingRef.current.pauseAsync();
              setIsPaused(true);
              pauseStartTime.current = Date.now();
              wasRecordingBeforeBackground.current = true;
            } catch (error) {
              console.error('Error pausing recording:', error);
            }
          } else {
            // User backgrounding: Continue recording, set timer for backup
            console.log('App backgrounding - recording continues, setting backup timer...');
            wasRecordingBeforeBackground.current = true;
            
            // Set a timer to create backup if user stays in background
            // Recording continues during this grace period
            backgroundBackupTimer.current = setTimeout(async () => {
              console.log('Background timer fired - creating hidden backup');
              backgroundBackupTimer.current = null;
              await createHiddenBackup();
            }, BACKGROUND_BACKUP_DELAY);
          }
          
        } else if (wasInterruptedByPhoneCall.current && isPausedRef.current) {
          console.log('Already paused by phone call, waiting for call to end...');
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      // Clean up timer on unmount
      if (backgroundBackupTimer.current) {
        clearTimeout(backgroundBackupTimer.current);
      }
    };
  }, [refreshRecordings, createHiddenBackup]);

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
      wasRecordingBeforeBackground.current = false;
      wasInterruptedByPhoneCall.current = false;
      createdAtRef.current = new Date().toISOString();
      tempRecordingUri.current = null;
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

      // Deactivate keep-awake
      try {
        deactivateKeepAwake('recording');
        console.log('Screen keep-awake deactivated');
      } catch (e) {
        console.log('Could not deactivate keep-awake:', e);
      }

      // Clean up any temp backup
      if (tempRecordingUri.current) {
        await deleteTempRecordingFile(tempRecordingUri.current);
        await clearTempRecordingMetadata();
        tempRecordingUri.current = null;
      }

      setRecording(null);
      setRecordingDuration(0);
      setRecordingStartTime(0);
      setPausedDuration(0);
      pauseStartTime.current = 0;
      wasRecordingBeforeBackground.current = false;
      wasInterruptedByPhoneCall.current = false;
      createdAtRef.current = '';
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
