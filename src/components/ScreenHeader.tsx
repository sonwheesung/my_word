import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
  rightButton?: {
    text: string;
    onPress: () => void;
  };
}

export default function ScreenHeader({ title, onBack, rightButton }: ScreenHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <MaterialIcons name="arrow-back-ios-new" size={20} color={colors.primary} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {rightButton ? (
        <TouchableOpacity onPress={rightButton.onPress} style={styles.rightButton}>
          <Text style={[styles.rightButtonText, { color: colors.primary }]}>{rightButton.text}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.rightButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  rightButton: {
    width: 60,
    alignItems: 'flex-end',
  },
  rightButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
