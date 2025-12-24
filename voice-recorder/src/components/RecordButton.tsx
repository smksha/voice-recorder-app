import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { formatDuration } from '../utils/formatters';
import { Waveform } from './Waveform';
import { styles } from './RecordButton.styles';

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
            toValue: 1.1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
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
      {/* Waveform visualization */}
      {isRecording && (
        <View style={styles.waveformContainer}>
          <Waveform isRecording={isRecording} isPaused={isPaused} />
        </View>
      )}

      {/* Duration display */}
      {isRecording && (
        <View style={styles.durationContainer}>
          <View style={[styles.recordingIndicator, isPaused && styles.pausedIndicator]} />
          <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
          {isPaused && <Text style={styles.pausedText}>PAUSED</Text>}
        </View>
      )}

      {/* Buttons */}
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

        {isRecording && <View style={styles.placeholderButton} />}
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
