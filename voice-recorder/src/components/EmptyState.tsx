import React from 'react';
import { View, Text } from 'react-native';
import { styles } from './EmptyState.styles';

interface EmptyStateProps {
  icon?: string;
  title?: string;
  subtitle?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '🎙️',
  title = 'No Recordings Yet',
  subtitle = 'Tap the record button below to create your first voice recording',
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
};
