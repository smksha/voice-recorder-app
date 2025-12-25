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

// Checkpoint interval in milliseconds
const CHECKPOINT_INTERVAL = 3000; // 3 seconds

// Session storage keys
const SESSION_KEY = 'active_recording_session';

interface ActiveSession {
  sessionId: string;
  segments: string[];
  createdAt: string;
  totalDuration: number;
}

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

// Helper to get segments directory
const getSegmentsDirectory = (): string => {
  return `${FileSystem.documentDirectory}segments/`;
};

// Helper to ensure segments directory exists
const ensureSegmentsDirectory = async (): Promise<void> => {
  const dirInfo = await FileSystem.getInfoAsync(getSegmentsDirectory());
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(getSegmentsDirectory(), { intermediates: true });
  }
};

// Helper to save active session to AsyncStorage
const saveActiveSession = async (session: ActiveSession): Promise<void> => {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Error saving active session:', error);
  }
};

// Helper to load active session from AsyncStorage
const loadActiveSession = async (): Promise<ActiveSession | null> => {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const data = await AsyncStorage.getItem(SESSION_KEY);
    if (data) {
      return JSON.parse(data) as ActiveSession;
    }
    return null;
  } catch (error) {
    console.error('Error loading active session:', error);
    return null;
  }
};

// Helper to clear active session
const clearActiveSession = async (): Promise<void> => {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error('Error clearing active session:', error);
  }
};

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
  
<<<<<<< HEAD
  // Checkpoint-related refs
  const checkpointTimer = useRef<NodeJS.Timeout | null>(null);
  const sessionId = useRef<string>('');
  const segments = useRef<string[]>([]);
  const segmentStartTime = useRef<number>(0);
  const totalDurationBeforeSegment = useRef<number>(0);
  
  // Refs for callbacks
=======
  // Refs for callbacks (to access current state)
>>>>>>> b31455721954b813faf3c6628b595c52b58a9e44
  const recordingRef = useRef(recording);
  const isRecordingRef = useRef(isRecording);
  const isPausedRef = useRef(isPaused);
  const recordingsRef = useRef(recordings);
  const recordingStartTimeRef = useRef(recordingStartTime);
  const pausedDurationRef = useRef(pausedDuration);
  
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

  // Recover incomplete session on app launch (app was killed)
  useEffect(() => {
    const init = async () => {
      await ensureRecordingsDirectory();
      await ensureSegmentsDirectory();
      
      // Check for incomplete session from app kill
      const activeSession = await loadActiveSession();
      if (activeSession && activeSession.segments.length > 0) {
        console.log('Recovering session from app kill:', activeSession);
        
        // Verify segments exist
        const validSegments: string[] = [];
        for (const segmentUri of activeSession.segments) {
          const info = await FileSystem.getInfoAsync(segmentUri);
          if (info.exists) {
            validSegments.push(segmentUri);
          }
        }
        
        if (validSegments.length > 0) {
          // Create recording from recovered segments
          const id = Date.now().toString();
          const filename = `recording_${id}.m4a`;
          
          // If only one segment, move it to recordings folder
          // If multiple, keep as segments
          let uri: string;
          let recordingSegments: string[] | undefined;
          
          if (validSegments.length === 1) {
            uri = `${getRecordingsDirectory()}${filename}`;
            await FileSystem.moveAsync({ from: validSegments[0], to: uri });
          } else {
            // Move first segment as primary URI, keep others as segments
            uri = `${getRecordingsDirectory()}${filename}`;
            await FileSystem.moveAsync({ from: validSegments[0], to: uri });
            recordingSegments = [uri];
            
            // Move remaining segments to recordings folder
            for (let i = 1; i < validSegments.length; i++) {
              const segFilename = `recording_${id}_seg${i}.m4a`;
              const segUri = `${getRecordingsDirectory()}${segFilename}`;
              await FileSystem.moveAsync({ from: validSegments[i], to: segUri });
              recordingSegments.push(segUri);
            }
          }
          
          const recoveredRecording: Recording = {
            id,
            uri,
            filename,
            createdAt: activeSession.createdAt,
            duration: activeSession.totalDuration,
            segments: recordingSegments,
          };
          
          const currentRecordings = await loadRecordingsMetadata();
          const updatedRecordings = [recoveredRecording, ...currentRecordings];
          await saveRecordingMetadata(updatedRecordings);
          
          console.log('Recovered recording with', validSegments.length, 'segments');
        }
        
        await clearActiveSession();
      }
      
      await refreshRecordings(true);
    };
    init();
  }, [refreshRecordings]);

  // Update recording duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused && segmentStartTime.current) {
      interval = setInterval(() => {
        const currentSegmentDuration = Date.now() - segmentStartTime.current;
        setRecordingDuration(totalDurationBeforeSegment.current + currentSegmentDuration);
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, isPaused]);

<<<<<<< HEAD
  // Create a checkpoint (save current segment, start new one)
  const createCheckpoint = useCallback(async () => {
    if (!recordingRef.current || !isRecordingRef.current || isPausedRef.current) {
      return;
    }
    
    console.log('Creating checkpoint...');
    
=======
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
>>>>>>> b31455721954b813faf3c6628b595c52b58a9e44
    try {
      const currentRecording = recordingRef.current;
      
      // Calculate duration of this segment
      const segmentDuration = Date.now() - segmentStartTime.current;
      totalDurationBeforeSegment.current += segmentDuration;
      
      // Stop current recording
      await currentRecording.stopAndUnloadAsync();
      
      const uri = currentRecording.getURI();
      if (uri) {
        // Save segment to segments folder
        const segmentFilename = `segment_${sessionId.current}_${segments.current.length}.m4a`;
        const segmentUri = `${getSegmentsDirectory()}${segmentFilename}`;
        
        await FileSystem.moveAsync({ from: uri, to: segmentUri });
        segments.current.push(segmentUri);
        
        // Update active session in storage (for recovery if killed)
        await saveActiveSession({
          sessionId: sessionId.current,
          segments: segments.current,
          createdAt: createdAtRef.current,
          totalDuration: totalDurationBeforeSegment.current,
        });
        
        console.log('Checkpoint saved:', segmentFilename);
      }
      
      // Start new recording immediately
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
      
      // Set up phone call detection for new recording
      newRecording.setOnRecordingStatusUpdate(async (status) => {
        if (!status.isRecording && isRecordingRef.current && !isPausedRef.current && !wasInterruptedByPhoneCall.current) {
          console.log('Recording interrupted (phone call started)');
          wasInterruptedByPhoneCall.current = true;
          setIsPaused(true);
          pauseStartTime.current = Date.now();
        }
        
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
            segmentStartTime.current = Date.now();
            
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
      
      segmentStartTime.current = Date.now();
      setRecording(newRecording);
      
      console.log('New segment started');
    } catch (error) {
      console.error('Error creating checkpoint:', error);
    }
  }, []);

  // Handle app going to background - create immediate checkpoint
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (isRecordingRef.current && recordingRef.current && !isPausedRef.current) {
          console.log('App going to background - creating checkpoint...');
          await createCheckpoint();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [createCheckpoint]);

  const startRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.error('Permission denied');
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
      
      // Detect phone call interruptions
      newRecording.setOnRecordingStatusUpdate(async (status) => {
        if (!status.isRecording && isRecordingRef.current && !isPausedRef.current && !wasInterruptedByPhoneCall.current) {
          console.log('Recording interrupted (phone call started)');
          wasInterruptedByPhoneCall.current = true;
          setIsPaused(true);
          pauseStartTime.current = Date.now();
        }
        
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
            segmentStartTime.current = Date.now();
            
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

      try {
        await activateKeepAwakeAsync('recording');
      } catch (e) {
        console.log('Could not activate keep-awake:', e);
      }

      // Initialize session
      sessionId.current = Date.now().toString();
      segments.current = [];
      segmentStartTime.current = Date.now();
      totalDurationBeforeSegment.current = 0;
      createdAtRef.current = new Date().toISOString();
      
      // Save initial session state
      await saveActiveSession({
        sessionId: sessionId.current,
        segments: [],
        createdAt: createdAtRef.current,
        totalDuration: 0,
      });

      setRecording(newRecording);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingStartTime(Date.now());
      setRecordingDuration(0);
      setPausedDuration(0);
      wasInterruptedByPhoneCall.current = false;
      
      // Start checkpoint timer
      checkpointTimer.current = setInterval(() => {
        // Skip if paused or interrupted
        if (!isPausedRef.current && !wasInterruptedByPhoneCall.current) {
          createCheckpoint();
        }
      }, CHECKPOINT_INTERVAL);
      
      console.log('Recording started with checkpoints every', CHECKPOINT_INTERVAL / 1000, 'seconds');
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, [createCheckpoint]);

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
      segmentStartTime.current = Date.now();
      
      setIsPaused(false);
      wasInterruptedByPhoneCall.current = false;
      console.log('Recording resumed');
    } catch (error) {
      console.error('Error resuming:', error);
    }
  }, [recording, isRecording, isPaused]);

  const stopRecording = useCallback(async () => {
    if (!recording) return;

    // Stop checkpoint timer
    if (checkpointTimer.current) {
      clearInterval(checkpointTimer.current);
      checkpointTimer.current = null;
    }

    setIsSaving(true);
    try {
      setIsRecording(false);
      setIsPaused(false);
      
      // Calculate final segment duration
      const finalSegmentDuration = Date.now() - segmentStartTime.current;
      const totalDuration = totalDurationBeforeSegment.current + finalSegmentDuration;

      await recording.stopAndUnloadAsync();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recording.getURI();
      if (uri) {
        const id = Date.now().toString();
        const filename = `recording_${id}.m4a`;
        const newUri = `${getRecordingsDirectory()}${filename}`;

        // If we have previous segments, handle multi-segment recording
        if (segments.current.length > 0) {
          // Move final segment to recordings folder
          await FileSystem.moveAsync({ from: uri, to: newUri });
          
          // Move all previous segments to recordings folder and build segments array
          const allSegments: string[] = [];
          for (let i = 0; i < segments.current.length; i++) {
            const segFilename = `recording_${id}_seg${i}.m4a`;
            const segUri = `${getRecordingsDirectory()}${segFilename}`;
            await FileSystem.moveAsync({ from: segments.current[i], to: segUri });
            allSegments.push(segUri);
          }
          allSegments.push(newUri); // Add final segment
          
          const newRecording: Recording = {
            id,
            uri: allSegments[0], // Primary URI is first segment
            filename,
            createdAt: createdAtRef.current || new Date().toISOString(),
            duration: Math.max(totalDuration, 0),
            segments: allSegments,
          };

          const updatedRecordings = [newRecording, ...recordings];
          await saveRecordingMetadata(updatedRecordings);
          setRecordings(updatedRecordings);
          
          console.log('Recording saved with', allSegments.length, 'segments');
        } else {
          // Single segment (recording < 3 seconds)
          await FileSystem.moveAsync({ from: uri, to: newUri });

          const newRecording: Recording = {
            id,
            uri: newUri,
            filename,
            createdAt: createdAtRef.current || new Date().toISOString(),
            duration: Math.max(totalDuration, 0),
          };

          const updatedRecordings = [newRecording, ...recordings];
          await saveRecordingMetadata(updatedRecordings);
          setRecordings(updatedRecordings);
          
          console.log('Recording saved (single segment)');
        }
      }

      try {
        deactivateKeepAwake('recording');
      } catch (e) {
        console.log('Could not deactivate keep-awake:', e);
      }

      // Clear session
      await clearActiveSession();
      
      // Reset state
      setRecording(null);
      setRecordingDuration(0);
      setRecordingStartTime(0);
      setPausedDuration(0);
      pauseStartTime.current = 0;
      sessionId.current = '';
      segments.current = [];
      segmentStartTime.current = 0;
      totalDurationBeforeSegment.current = 0;
      createdAtRef.current = '';
    } catch (error) {
      console.error('Error stopping:', error);
    } finally {
      setIsSaving(false);
    }
  }, [recording, recordings]);

  const deleteRecording = useCallback(
    async (id: string) => {
      try {
        const recordingToDelete = recordings.find((r) => r.id === id);
        if (recordingToDelete) {
          // Delete primary file
          await deleteRecordingFile(recordingToDelete.uri);
          
          // Delete segments if any
          if (recordingToDelete.segments) {
            for (const segmentUri of recordingToDelete.segments) {
              try {
                await deleteRecordingFile(segmentUri);
              } catch (e) {
                console.log('Could not delete segment:', segmentUri);
              }
            }
          }
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
