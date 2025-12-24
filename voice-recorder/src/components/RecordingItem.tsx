import React from 'react';
import { View, Text } from 'react-native';
import { Recording } from '../types/Recording';
import { formatDuration, formatDateTime } from '../utils/formatters';
import { IconButton } from './common';
import { styles } from './RecordingItem.styles';

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
            <IconButton
              icon={isPlaying ? '⏸' : '▶️'}
              onPress={isPlaying ? onPause : onPlay}
              variant="primary"
              size="medium"
            />
            <IconButton
              icon="⏹"
              onPress={onStop}
              variant="secondary"
              size="medium"
            />
          </>
        ) : (
          <IconButton
            icon="▶️"
            onPress={onPlay}
            variant="primary"
            size="medium"
          />
        )}
        <IconButton
          icon="🗑️"
          onPress={onDelete}
          variant="danger"
          size="medium"
        />
      </View>
    </View>
  );
};
