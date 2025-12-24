import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, shadows, borderRadius } from '../../styles';

interface IconButtonProps {
  icon: string;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  disabled?: boolean;
  style?: ViewStyle;
}

const sizeConfig = {
  small: { button: 40, icon: 16 },
  medium: { button: 48, icon: 20 },
  large: { button: 56, icon: 24 },
};

const variantColors = {
  primary: colors.primary,
  secondary: colors.textSecondary,
  danger: colors.danger,
  success: colors.success,
  warning: colors.paused,
};

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onPress,
  size = 'medium',
  variant = 'primary',
  disabled = false,
  style,
}) => {
  const { button: buttonSize, icon: iconSize } = sizeConfig[size];
  const backgroundColor = variantColors[variant];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        shadows.md,
        {
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[styles.icon, { fontSize: iconSize }]}>{icon}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    textAlign: 'center',
  },
});
