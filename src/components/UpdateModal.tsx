import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { STORE_URL } from '../constants/appConfig';

interface UpdateModalProps {
  visible: boolean;
  currentVersion: string;
  latestVersion: string;
  onSkip: () => void;
  onClose: () => void;
}

export default function UpdateModal({
  visible,
  currentVersion,
  latestVersion,
  onSkip,
  onClose,
}: UpdateModalProps) {
  const handleUpdate = () => {
    if (STORE_URL) {
      Linking.openURL(STORE_URL).catch(() => {
        // 링크 열기 실패 시 무시
      });
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* 아이콘 */}
          <Text style={styles.icon}>🔄</Text>

          {/* 제목 */}
          <Text style={styles.title}>새 버전이 있습니다</Text>

          {/* 버전 정보 */}
          <View style={styles.versionInfo}>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>현재 버전</Text>
              <Text style={styles.versionValue}>{currentVersion}</Text>
            </View>
            <View style={styles.versionArrow}>
              <Text style={styles.versionArrowText}>→</Text>
            </View>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>최신 버전</Text>
              <Text style={[styles.versionValue, styles.versionNew]}>{latestVersion}</Text>
            </View>
          </View>

          {/* 안내 문구 */}
          <Text style={styles.description}>
            최신 버전으로 업데이트하면{'\n'}새로운 기능을 사용할 수 있습니다.
          </Text>

          {/* 버튼 */}
          <View style={styles.buttons}>
            {Platform.OS !== 'web' && STORE_URL ? (
              <TouchableOpacity style={styles.updateButton} onPress={handleUpdate}>
                <Text style={styles.updateButtonText}>업데이트</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
              <Text style={styles.skipButtonText}>이 버전 건너뛰기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>나중에</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  versionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  versionRow: {
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  versionValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  versionNew: {
    color: '#6366F1',
  },
  versionArrow: {
    paddingHorizontal: 4,
  },
  versionArrowText: {
    fontSize: 18,
    color: '#9CA3AF',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttons: {
    width: '100%',
    gap: 10,
  },
  updateButton: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  closeButton: {
    padding: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
});
