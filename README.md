# My Word Frontend

React Native + Expo를 사용한 단어 학습 플랫폼 모바일 앱

## 기술 스택

- **React Native** 0.76.5
- **Expo** SDK 52
- **TypeScript** 5.6.2
- **React** 18.3.1

## 주요 기능

- 단어 저장 및 관리
- 단어 학습 및 복습
- 사용자 맞춤 학습 플랫폼

## 시작하기

### 사전 요구사항

- Node.js >= 18.0.0
- npm 또는 yarn
- Expo Go 앱 (모바일 테스트용)

### 설치

```bash
# 의존성 설치
npm install
# 또는
yarn install
```

### 실행

#### 개발 서버 시작
```bash
npm start
# 또는
yarn start
```

#### 플랫폼별 실행

```bash
# Android
npm run android

# iOS
npm run ios

# Web
npm run web
```

### Expo Go로 실행하기

1. 모바일 기기에 Expo Go 앱 설치
   - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)
   - [Android Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. 개발 서버 시작 후 QR 코드 스캔
   ```bash
   npm start
   ```

3. Expo Go에서 QR 코드 스캔하여 앱 실행

## 프로젝트 구조

```
my_word_front/
├── App.tsx                 # 메인 앱 컴포넌트
├── app.json               # Expo 설정
├── package.json           # 프로젝트 의존성
├── babel.config.js        # Babel 설정
├── tsconfig.json          # TypeScript 설정
├── assets/                # 이미지, 폰트 등 에셋
├── src/                   # 소스 코드
│   ├── components/        # 재사용 가능한 컴포넌트
│   ├── screens/           # 화면 컴포넌트
│   ├── navigation/        # 네비게이션 설정
│   ├── services/          # API 서비스
│   ├── hooks/             # 커스텀 훅
│   ├── utils/             # 유틸리티 함수
│   └── types/             # TypeScript 타입 정의
└── __tests__/            # 테스트 파일
```

## 백엔드 연동

백엔드 API URL은 `app.json`의 `extra.apiUrl`에서 설정할 수 있습니다.

```json
{
  "expo": {
    "extra": {
      "apiUrl": "http://localhost:8080/api"
    }
  }
}
```

운영 환경에서는 환경 변수를 사용하여 설정할 수 있습니다.

## 빌드

### 개발 빌드

```bash
# Android
npx expo run:android

# iOS
npx expo run:ios
```

### 프로덕션 빌드 (EAS Build 사용)

```bash
# EAS CLI 설치
npm install -g eas-cli

# EAS 로그인
eas login

# 빌드 설정
eas build:configure

# Android 빌드
eas build --platform android

# iOS 빌드
eas build --platform ios
```

## 테스트

```bash
npm test
# 또는
yarn test
```

## 린트

```bash
npm run lint
# 또는
yarn lint
```

## 관련 프로젝트

- 백엔드: `../my_word_back` (Spring Boot + MyBatis + MySQL)

## Expo로 마이그레이션

이 프로젝트는 React Native CLI에서 Expo로 마이그레이션되었습니다.

### 의존성 설치 필요

마이그레이션 후 다음 명령어를 실행하여 의존성을 설치하세요:

```bash
# 기존 node_modules 삭제
rm -rf node_modules

# 의존성 재설치
npm install
```

## 참고 자료

- [Expo 공식 문서](https://docs.expo.dev/)
- [React Native 공식 문서](https://reactnative.dev/)
- [TypeScript 공식 문서](https://www.typescriptlang.org/)

## 라이선스

Private
