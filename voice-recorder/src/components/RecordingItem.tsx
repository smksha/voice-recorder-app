import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Recording } from '../types/Recording';
import { formatDuration, formatDateTime } from '../utils/formatters';

interface RecordingItemProps {
  recording: Recording;
  isPlaying: boolean;
  isCurrentlyPlaying: boolean;
  playbackPosition: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onDelete: () => void;
}

export const RecordingItem: React.FC<RecordingItemProps> = ({
  recording,
  isPlaying,
  isCurrentlyPlaying,
  playbackPosition,
  onPlay,
  onPause,
  onStop,
  onDelete,
}) => {
  const progress = isCurrentlyPlaying
    ? Math.min(playbackPosition / recording.duration, 1)
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.infoContainer}>
        <Text style={styles.dateTime}>{formatDateTime(recording.createdAt)}</Text>
        <View style={styles.durationContainer}>
          <Text style={styles.duration}>
            {isCurrentlyPlaying
              ? `${formatDuration(playbackPosition)} / ${formatDuration(recording.duration)}`
              : formatDuration(recording.duration)}
          </Text>
        </View>
      </View>

      {isCurrentlyPlaying && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
        </View>
      )}

      <View style={styles.buttonContainer}>
        {isCurrentlyPlaying ? (
          <>
            <TouchableOpacity
              style={[styles.button, styles.playPauseButton]}
              onPress={isPlaying ? onPause : onPlay}
            >
              <Text style={styles.buttonText}>{isPlaying ? '⏸' : '▶️'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.stopButton]}
              onPress={onStop}
            >
              <Text style={styles.buttonText}>⏹</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.playPauseButton]}
            onPress={onPlay}
          >
            <Text style={styles.buttonText}>▶️</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.button, styles.deleteButton]}
          onPress={onDelete}
        >
          <Text style={styles.buttonText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateTime: {
    fontSize: 14,
    color: '#666666',
    flex: 1,
  },
  durationContainer: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  duration: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    fontVariant: ['tabular-nums'],
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseButton: {
    backgroundColor: '#007AFF',
  },
  stopButton: {
    backgroundColor: '#666666',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    fontSize: 18,
  },
});
