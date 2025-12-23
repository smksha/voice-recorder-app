import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { formatDuration } from '../utils/formatters';

interface RecordButtonProps {
  isRecording: boolean;
  recordingDuration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export const RecordButton: React.FC<RecordButtonProps> = ({
  isRecording,
  recordingDuration,
  onStartRecording,
  onStopRecording,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
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
  }, [isRecording, pulseAnim]);

  return (
    <View style={styles.container}>
      {isRecording && (
        <View style={styles.durationContainer}>
          <View style={styles.recordingIndicator} />
          <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.buttonWrapper}
        onPress={isRecording ? onStopRecording : onStartRecording}
        activeOpacity={0.8}
      >
        <Animated.View
          style={[
            styles.button,
            isRecording && styles.buttonRecording,
            { transform: [{ scale: pulseAnim }] },
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

      <Text style={styles.hint}>
        {isRecording ? 'Tap to stop' : 'Tap to record'}
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
  durationText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    fontVariant: ['tabular-nums'],
  },
  buttonWrapper: {
    marginBottom: 12,
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
  hint: {
    fontSize: 14,
    color: '#888',
  },
});
