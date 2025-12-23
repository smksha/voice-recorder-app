import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRecordings } from './src/hooks/useRecordings';
import { useAudioPlayer } from './src/hooks/useAudioPlayer';
import { RecordingItem } from './src/components/RecordingItem';
import { RecordButton } from './src/components/RecordButton';
import { EmptyState } from './src/components/EmptyState';
import { Recording } from './src/types/Recording';

export default function App() {
  const {
    recordings,
    isRecording,
    recordingDuration,
    isLoading,
    startRecording,
    stopRecording,
    deleteRecording,
  } = useRecordings();

  const {
    isPlaying,
    currentlyPlayingId,
    playbackPosition,
    playRecording,
    stopPlayback,
    pausePlayback,
    resumePlayback,
  } = useAudioPlayer();

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        'Delete Recording',
        'Are you sure you want to delete this recording? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              // Stop playback if deleting the currently playing recording
              if (currentlyPlayingId === id) {
                stopPlayback();
              }
              deleteRecording(id);
            },
          },
        ]
      );
    },
    [currentlyPlayingId, stopPlayback, deleteRecording]
  );

  const renderItem = useCallback(
    ({ item }: { item: Recording }) => {
      const isCurrentlyPlaying = currentlyPlayingId === item.id;

      return (
        <RecordingItem
          recording={item}
          isPlaying={isPlaying && isCurrentlyPlaying}
          isCurrentlyPlaying={isCurrentlyPlaying}
          playbackPosition={playbackPosition}
          onPlay={() =>
            isCurrentlyPlaying ? resumePlayback() : playRecording(item.id, item.uri)
          }
          onPause={pausePlayback}
          onStop={stopPlayback}
          onDelete={() => handleDelete(item.id)}
        />
      );
    },
    [
      currentlyPlayingId,
      isPlaying,
      playbackPosition,
      playRecording,
      pausePlayback,
      resumePlayback,
      stopPlayback,
      handleDelete,
    ]
  );

  const keyExtractor = useCallback((item: Recording) => item.id, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <Text style={styles.title}>Voice Recorder</Text>
        <Text style={styles.subtitle}>
          {recordings.length} {recordings.length === 1 ? 'recording' : 'recordings'}
        </Text>
      </View>

      <View style={styles.listContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading recordings...</Text>
          </View>
        ) : recordings.length === 0 ? (
          <EmptyState />
        ) : (
          <FlatList
            data={recordings}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <RecordButton
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#888888',
  },
});
