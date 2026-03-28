현재 코드를 빌드하고 배포 준비를 진행해줘.

## 절차

1. **코드 검증**
   - `npx tsc --noEmit`으로 타입 체크
   - 에러 발견 시 수정 후 재검증

2. **변경사항 확인**
   - `git status`로 미커밋 파일 확인
   - `git diff --stat`으로 변경 내용 요약

3. **커밋** (변경사항이 있을 경우)
   - 변경 내용을 분석하여 적절한 커밋 메시지 작성
   - `git add` → `git commit` → `git push origin main`

4. **EAS 빌드**
   - `npx eas-cli build --platform android --profile production --non-interactive` 실행
   - 빌드 완료 대기

5. **결과 보고**
   - AAB 다운로드 링크 제공
   - Google Play Console 업로드 안내
