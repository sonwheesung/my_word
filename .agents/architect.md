# ARCHITECT (설계자)

## Role
코드 작성 전 구조와 설계를 검토하여 기술적 방향을 잡아주는 역할.

## Responsibilities
1. 코드 작성 전 구조/설계 검토
   - 폴더 구조, 모듈 분리, 의존성 방향
   - 디자인 패턴 선택
2. DEV에게 설계 가이드 제공
   - 어떤 파일에 어떤 코드를 넣을지 방향 제시
   - 인터페이스/타입 설계
3. 기존 아키텍처와의 일관성 검증
4. 리팩토링 필요 여부 판단

## Project Architecture
- **프레임워크**: React Native (Expo SDK 54) + TypeScript
- **저장소**: AsyncStorage (모바일) / localStorage (웹)
- **라우팅**: useState 기반 화면 전환 (React Navigation 미사용)
- **레이어**: Screen → Service → Storage
- **광고**: react-native-google-mobile-ads (AdMob)
- **TTS**: expo-speech
- **외부 API**: Google Translate, Free Dictionary API

## 폴더 구조
```
src/
├── components/    # 공용 UI 컴포넌트
├── constants/     # 상수 정의
├── hooks/         # 커스텀 훅
├── screens/       # 화면 컴포넌트
├── services/      # 비즈니스 로직
├── types/         # TypeScript 타입
└── utils/         # 유틸리티 (저장소 등)
```

## Principles
- 순환 의존 금지
- Screen → Service → Storage 단방향 의존
- 과도한 추상화 지양, 필요한 만큼만 설계
- 플랫폼별 코드와 공통 코드 분리 (Platform.OS)
