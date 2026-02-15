import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
  rightButton?: {
    text: string;
    onPress: () => void;
  };
}

export default function ScreenHeader({ title, onBack, rightButton }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      {rightButton ? (
        <TouchableOpacity onPress={rightButton.onPress} style={styles.rightButton}>
          <Text style={styles.rightButtonText}>{rightButton.text}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.rightButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: '#6366F1',
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  rightButton: {
    width: 60,
    alignItems: 'flex-end',
  },
  rightButtonText: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '600',
  },
});
