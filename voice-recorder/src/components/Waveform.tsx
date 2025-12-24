import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors } from '../styles';

interface WaveformProps {
  isRecording: boolean;
  isPaused: boolean;
  meterLevel?: number; // -160 to 0 dB, optional for simulated waveform
  barCount?: number;
  barWidth?: number;
  barSpacing?: number;
  minHeight?: number;
  maxHeight?: number;
  color?: string;
  pausedColor?: string;
}

export const Waveform: React.FC<WaveformProps> = ({
  isRecording,
  isPaused,
  meterLevel,
  barCount = 20,
  barWidth = 4,
  barSpacing = 3,
  minHeight = 8,
  maxHeight = 50,
  color = colors.recording,
  pausedColor = colors.paused,
}) => {
  // Create animated values for each bar
  const barAnimations = useRef<Animated.Value[]>(
    Array.from({ length: barCount }, () => new Animated.Value(minHeight))
  ).current;

  // Animation phases for each bar (for wave effect)
  const phases = useRef<number[]>(
    Array.from({ length: barCount }, (_, i) => (i / barCount) * Math.PI * 2)
  ).current;

  useEffect(() => {
    let animationFrame: number;
    let startTime = Date.now();

    const animate = () => {
      if (!isRecording || isPaused) {
        // Reset to minimum height when not recording or paused
        barAnimations.forEach((anim) => {
          Animated.timing(anim, {
            toValue: minHeight,
            duration: 300,
            useNativeDriver: false,
          }).start();
        });
        return;
      }

      const elapsed = (Date.now() - startTime) / 1000;

      barAnimations.forEach((anim, index) => {
        // Create a wave pattern with some randomness
        const wave = Math.sin(elapsed * 4 + phases[index]);
        const randomFactor = 0.3 + Math.random() * 0.7;
        
        // If we have meter level, use it to influence the amplitude
        let amplitude = 0.5;
        if (meterLevel !== undefined) {
          // Convert dB to linear scale (roughly)
          // meterLevel is typically -160 to 0
          amplitude = Math.max(0, (meterLevel + 160) / 160);
        }

        const targetHeight =
          minHeight +
          (maxHeight - minHeight) * ((wave + 1) / 2) * randomFactor * amplitude;

        Animated.timing(anim, {
          toValue: targetHeight,
          duration: 100,
          useNativeDriver: false,
        }).start();
      });

      animationFrame = requestAnimationFrame(animate);
    };

    if (isRecording && !isPaused) {
      animate();
    } else {
      // Reset bars when not recording
      barAnimations.forEach((anim) => {
        Animated.timing(anim, {
          toValue: minHeight,
          duration: 300,
          useNativeDriver: false,
        }).start();
      });
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isRecording, isPaused, meterLevel, barAnimations, minHeight, maxHeight, phases]);

  const activeColor = isPaused ? pausedColor : color;

  return (
    <View style={styles.container}>
      {barAnimations.map((anim, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              width: barWidth,
              height: anim,
              backgroundColor: activeColor,
              marginHorizontal: barSpacing / 2,
              opacity: isRecording ? 1 : 0.3,
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
  },
  bar: {
    borderRadius: 2,
  },
});
