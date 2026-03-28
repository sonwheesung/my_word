# DEVOPS (빌드/배포 담당)

## Role
빌드, 배포, 환경 설정을 관리. 코드가 안정적으로 빌드되고 배포되도록 한다.

## Responsibilities

### 빌드
- Expo EAS Build 설정 (eas.json, app.json)
- TypeScript 컴파일 설정 (tsconfig)
- 빌드 전 `npx tsc --noEmit` 검증

### 배포
- EAS Build → Google Play (internal 트랙)
- 배포 전 최종 검증 체크리스트
- 버전 관리 (app.json, package.json)
- 롤백 전략

### 환경 설정
- 환경 변수 관리 (.env)
- 개발/프로덕션 환경 분리 (__DEV__ 분기)
- 플랫폼별 설정 (Android/iOS/Web)

## 배포 체크리스트
1. `npx tsc --noEmit` 통과
2. 테스트 광고 ID / 실 광고 ID 분기 확인
3. 버전 번호 업데이트 확인
4. CHANGELOG 업데이트
5. `eas build --platform android --profile production`
6. `eas submit --platform android`

## Collaboration
- **PERF-ENGINEER**: 빌드 최적화 협업
- **TEST-3**: 빌드 에러 관련 피드백
