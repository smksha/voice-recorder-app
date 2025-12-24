import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRecordings } from '../hooks/useRecordings';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { RecordingItem, RecordButton, EmptyState } from '../components';
import { Recording } from '../types/Recording';
import { colors } from '../styles';
import { styles } from './HomeScreen.styles';

export const HomeScreen: React.FC = () => {
  const {
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

  const recordingsCount = recordings.length;
  const recordingsLabel = recordingsCount === 1 ? 'recording' : 'recordings';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      <View style={styles.header}>
        <Text style={styles.title}>Voice Recorder</Text>
        <Text style={styles.subtitle}>
          {recordingsCount} {recordingsLabel}
        </Text>
      </View>

      <View style={styles.listContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
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
        isPaused={isPaused}
        recordingDuration={recordingDuration}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onPauseRecording={pauseRecording}
        onResumeRecording={resumeRecording}
      />
    </SafeAreaView>
  );
};
