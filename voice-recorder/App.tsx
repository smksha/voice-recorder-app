import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { RecordingService, PlaybackService } from './recordingService';
import { RecordingMetadata } from './types';

const recordingService = new RecordingService();
const playbackService = new PlaybackService();

export default function App() {
  const [recordings, setRecordings] = useState<RecordingMetadata[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Load recordings on mount
  useEffect(() => {
    loadRecordings();
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const granted = await RecordingService.requestPermissions();
    if (!granted) {
      Alert.alert(
        'Permission Required',
        'Please grant audio recording permissions to use this app.'
      );
    }
  };

  const loadRecordings = async () => {
    try {
      setIsLoading(true);
      const loadedRecordings = await recordingService.getAllRecordings();
      // Sort by date, newest first
      loadedRecordings.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setRecordings(loadedRecordings);
    } catch (error) {
      console.error('Error loading recordings:', error);
      Alert.alert('Error', 'Failed to load recordings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecordPress = async () => {
    try {
      if (isRecording) {
        // Stop recording
        const recording = await recordingService.stopRecording();
        setIsRecording(false);
        if (recording) {
          await loadRecordings();
        }
      } else {
        // Start recording
        await recordingService.startRecording();
        setIsRecording(true);
      }
    } catch (error) {
      console.error('Error handling record:', error);
      Alert.alert('Error', 'Failed to record audio');
      setIsRecording(false);
    }
  };

  const handlePlayPress = async (recording: RecordingMetadata) => {
    try {
      if (playingId === recording.id) {
        // Stop playback
        await playbackService.stopPlayback();
        await playbackService.unload();
        setPlayingId(null);
      } else {
        // Stop any current playback
        if (playingId) {
          await playbackService.stopPlayback();
          await playbackService.unload();
        }
        // Start new playback
        await playbackService.playRecording(recording.uri);
        setPlayingId(recording.id);
        
        // Auto-clear playing state after duration
        setTimeout(() => {
          setPlayingId(null);
        }, recording.duration);
      }
    } catch (error) {
      console.error('Error handling playback:', error);
      Alert.alert('Error', 'Failed to play recording');
      setPlayingId(null);
    }
  };

  const handleDeletePress = async (recording: RecordingMetadata) => {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete this recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (playingId === recording.id) {
                await playbackService.stopPlayback();
                await playbackService.unload();
                setPlayingId(null);
              }
              await recordingService.deleteRecording(recording.id);
              await loadRecordings();
            } catch (error) {
              console.error('Error deleting recording:', error);
              Alert.alert('Error', 'Failed to delete recording');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const renderRecordingItem = ({ item }: { item: RecordingMetadata }) => {
    const isPlaying = playingId === item.id;

    return (
      <View style={styles.recordingItem}>
        <View style={styles.recordingInfo}>
          <Text style={styles.recordingDate}>
            {formatDate(item.date)} • {formatTime(item.date)}
          </Text>
          <Text style={styles.recordingDuration}>
            Duration: {formatDuration(item.duration)}
          </Text>
        </View>
        <View style={styles.recordingActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.playButton]}
            onPress={() => handlePlayPress(item)}
          >
            <Text style={styles.actionButtonText}>
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeletePress(item)}
          >
            <Text style={styles.actionButtonText}>🗑 Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Voice Recorder</Text>
        <Text style={styles.headerSubtitle}>
          {recordings.length} recording{recordings.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : recordings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No recordings yet</Text>
          <Text style={styles.emptySubtext}>
            Tap the record button below to start
          </Text>
        </View>
      ) : (
        <FlatList
          data={recordings}
          renderItem={renderRecordingItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}

      <View style={styles.recordButtonContainer}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording && styles.recordButtonActive,
          ]}
          onPress={handleRecordPress}
        >
          <View
            style={[
              styles.recordButtonInner,
              isRecording && styles.recordButtonInnerActive,
            ]}
          />
        </TouchableOpacity>
        <Text style={styles.recordButtonText}>
          {isRecording ? 'Tap to Stop' : 'Tap to Record'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    paddingTop: 10,
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#636366',
  },
  listContent: {
    padding: 16,
  },
  recordingItem: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  recordingInfo: {
    marginBottom: 12,
  },
  recordingDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  recordingDuration: {
    fontSize: 14,
    color: '#8E8E93',
  },
  recordingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  playButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  recordButtonContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingBottom: 40,
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonActive: {
    backgroundColor: '#FF453A',
  },
  recordButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF',
  },
  recordButtonInnerActive: {
    borderRadius: 4,
  },
  recordButtonText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
});
