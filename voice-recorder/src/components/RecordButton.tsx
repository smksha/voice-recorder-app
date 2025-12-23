import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { formatDuration } from '../utils/formatters';

interface RecordButtonProps {
  isRecording: boolean;
  isPaused: boolean;
  recordingDuration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
}

export const RecordButton: React.FC<RecordButtonProps> = ({
  isRecording,
  isPaused,
  recordingDuration,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording && !isPaused) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, isPaused, pulseAnim]);

  const handleMainButtonPress = () => {
    if (!isRecording) {
      onStartRecording();
    } else {
      onStopRecording();
    }
  };

  const handlePauseResumePress = () => {
    if (isPaused) {
      onResumeRecording();
    } else {
      onPauseRecording();
    }
  };

  return (
    <View style={styles.container}>
      {isRecording && (
        <View style={styles.durationContainer}>
          <View style={[styles.recordingIndicator, isPaused && styles.pausedIndicator]} />
          <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
          {isPaused && <Text style={styles.pausedText}>PAUSED</Text>}
        </View>
      )}

      <View style={styles.buttonsRow}>
        {isRecording && (
          <TouchableOpacity
            style={[styles.secondaryButton, isPaused ? styles.resumeButton : styles.pauseButton]}
            onPress={handlePauseResumePress}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>
              {isPaused ? '▶️' : '⏸️'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.buttonWrapper}
          onPress={handleMainButtonPress}
          activeOpacity={0.8}
        >
          <Animated.View
            style={[
              styles.button,
              isRecording && styles.buttonRecording,
              isPaused && styles.buttonPaused,
              { transform: [{ scale: isRecording && !isPaused ? pulseAnim : 1 }] },
            ]}
          >
            <View
              style={[
                styles.innerButton,
                isRecording && styles.innerButtonRecording,
              ]}
            />
          </Animated.View>
        </TouchableOpacity>

        {isRecording && (
          <View style={styles.placeholderButton} />
        )}
      </View>

      <Text style={styles.hint}>
        {!isRecording 
          ? 'Tap to record' 
          : isPaused 
            ? 'Tap ▶️ to resume or ⏹ to save'
            : 'Tap to stop'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingBottom: 40,
    backgroundColor: '#f8f8f8',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  recordingIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  pausedIndicator: {
    backgroundColor: '#FF9500',
  },
  durationText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    fontVariant: ['tabular-nums'],
  },
  pausedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9500',
    marginLeft: 8,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonWrapper: {
    marginHorizontal: 16,
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 4,
    borderColor: '#e0e0e0',
  },
  buttonRecording: {
    borderColor: '#FF3B30',
  },
  buttonPaused: {
    borderColor: '#FF9500',
  },
  innerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF3B30',
  },
  innerButtonRecording: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  secondaryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  pauseButton: {
    backgroundColor: '#FF9500',
  },
  resumeButton: {
    backgroundColor: '#34C759',
  },
  secondaryButtonText: {
    fontSize: 24,
  },
  placeholderButton: {
    width: 56,
    height: 56,
  },
  hint: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});
