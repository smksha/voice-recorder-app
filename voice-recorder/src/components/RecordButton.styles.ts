import { StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, shadows, typography } from '../styles';

export const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingBottom: spacing.xxxl,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  waveformContainer: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  recordingIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.recording,
    marginRight: spacing.sm,
  },
  pausedIndicator: {
    backgroundColor: colors.paused,
  },
  durationText: {
    ...typography.duration,
  },
  pausedText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.paused,
    marginLeft: spacing.sm,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  buttonWrapper: {
    marginHorizontal: spacing.lg,
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
    borderWidth: 4,
    borderColor: colors.border,
  },
  buttonRecording: {
    borderColor: colors.recording,
  },
  buttonPaused: {
    borderColor: colors.paused,
  },
  innerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.recording,
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
    ...shadows.md,
  },
  pauseButton: {
    backgroundColor: colors.paused,
  },
  resumeButton: {
    backgroundColor: colors.success,
  },
  secondaryButtonText: {
    fontSize: 24,
  },
  placeholderButton: {
    width: 56,
    height: 56,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
