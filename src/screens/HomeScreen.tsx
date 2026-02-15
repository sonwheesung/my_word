import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

interface HomeScreenProps {
  onNavigateToManageWords: () => void;
  onAddWord: () => void;
  onStartQuiz: () => void;
  onViewStatistics: () => void;
  onMyPage: () => void;
}

export default function HomeScreen({ onNavigateToManageWords, onAddWord, onStartQuiz, onViewStatistics, onMyPage }: HomeScreenProps) {
  return (
    <ScrollView style={styles.container}>
      <StatusBar style="dark" />

      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>반갑습니다!</Text>
          <Text style={styles.username}>My Word 📖</Text>
        </View>
      </View>

      {/* 기능 버튼들 */}
      <View style={styles.features}>
        <TouchableOpacity style={styles.featureButton} onPress={onAddWord}>
          <Text style={styles.featureIcon}>➕</Text>
          <Text style={styles.featureTitle}>단어 추가</Text>
          <Text style={styles.featureSubtitle}>새로운 단어 등록</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureButton} onPress={onNavigateToManageWords}>
          <Text style={styles.featureIcon}>📚</Text>
          <Text style={styles.featureTitle}>단어장</Text>
          <Text style={styles.featureSubtitle}>단어 관리 및 검색</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureButton} onPress={onStartQuiz}>
          <Text style={styles.featureIcon}>✏️</Text>
          <Text style={styles.featureTitle}>학습하기</Text>
          <Text style={styles.featureSubtitle}>퀴즈 및 복습</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureButton} onPress={onViewStatistics}>
          <Text style={styles.featureIcon}>📊</Text>
          <Text style={styles.featureTitle}>통계</Text>
          <Text style={styles.featureSubtitle}>학습 기록 확인</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureButton} onPress={onMyPage}>
          <Text style={styles.featureIcon}>👤</Text>
          <Text style={styles.featureTitle}>마이페이지</Text>
          <Text style={styles.featureSubtitle}>출석 현황 및 프로필</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    paddingTop: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  greeting: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 4,
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  features: {
    padding: 24,
  },
  featureButton: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)' }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }),
  },
  featureIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  featureSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
});
