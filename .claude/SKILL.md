# SKILL.md - 개발 스킬 가이드라인

> CLAUDE.md의 Skills 항목에 대한 상세 가이드

---

## 1. 배열 접근 시 길이 체크

배열 요소에 직접 접근하기 전에 반드시 길이를 확인한다.

```tsx
// BAD
const first = items[0];

// GOOD
const first = items.length > 0 ? items[0] : null;

// GOOD - optional chaining 활용
const name = items[0]?.name ?? '기본값';

// GOOD - 렌더링 시
{items.length > 0 && <Text>{items[0]}</Text>}
```

**적용 범위**: `.map()`, `.filter()`, `.find()` 결과도 동일하게 체크한다.

---

## 2. async/await에 try-catch 필수

모든 비동기 호출은 try-catch로 감싸고, 에러 발생 시 사용자에게 피드백을 제공한다.

```tsx
// BAD
const loadData = async () => {
  const data = await service.getData();
  setData(data);
};

// GOOD
const loadData = async () => {
  try {
    setLoading(true);
    const data = await service.getData();
    setData(data);
  } catch (error: any) {
    console.warn('데이터 조회 실패:', error);
    showToast(error.message || '데이터를 불러오는데 실패했습니다', 'error');
  } finally {
    setLoading(false);
  }
};
```

**규칙**:
- `try` 시작 시 로딩 ON, `finally`에서 로딩 OFF
- `catch`에서 `console.warn`으로 로그 + 사용자 Toast 표시
- 에러 메시지는 한국어로 사용자 친화적으로 작성

---

## 3. 로딩 상태 표시

비동기 작업 중에는 반드시 로딩 상태를 표시한다.

```tsx
// 전체 화면 로딩
if (loading) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#6366F1" />
      <Text>로딩 중...</Text>
    </View>
  );
}

// 부분 로딩 (Skeleton)
{loadingWords ? (
  <WordCardSkeleton />
) : (
  <WordList words={words} />
)}

// 버튼 로딩
<TouchableOpacity disabled={loading}>
  {loading ? <ActivityIndicator color="#fff" /> : <Text>저장</Text>}
</TouchableOpacity>
```

**규칙**:
- 초기 데이터 로딩: Skeleton 또는 전체 로딩 화면
- 사용자 액션(저장, 삭제): 버튼 내 ActivityIndicator + disabled 처리
- pull-to-refresh: RefreshControl 사용

---

## 4. 빈 상태(Empty State) 처리

데이터가 없을 때 사용자에게 안내 화면을 제공한다.

```tsx
// GOOD
if (words.length === 0) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📝</Text>
      <Text style={styles.emptyTitle}>등록된 단어가 없습니다</Text>
      <Text style={styles.emptySubtitle}>단어를 추가해보세요</Text>
    </View>
  );
}
```

**규칙**:
- 아이콘 + 제목 + 부제(안내 메시지) 패턴
- 가능하면 액션 버튼(예: "단어 추가") 제공
- 검색 결과 없음도 별도 Empty State 처리

---

## 5. 하드코딩 금지

반복되는 문자열, 숫자, 색상 등은 상수로 분리한다.

```tsx
// BAD
if (accuracy < 50) { ... }
<View style={{ backgroundColor: '#6366F1' }}>

// GOOD
const WEAK_WORD_THRESHOLD = 50;
const COLORS = { primary: '#6366F1', background: '#F8F9FA' };

if (accuracy < WEAK_WORD_THRESHOLD) { ... }
<View style={{ backgroundColor: COLORS.primary }}>
```

**적용 대상**:
- AsyncStorage 키 값
- 임계값 (정답률 기준 등)
- 반복되는 에러 메시지
- API 엔드포인트 (향후 서버 연동 시)

---

## 6. 컴포넌트당 하나의 책임

하나의 컴포넌트는 하나의 역할만 수행한다.

```
# 프로젝트 구조 예시
src/
  screens/          # 화면 단위 (데이터 로딩 + 레이아웃)
  components/       # 재사용 UI 컴포넌트 (순수 표시)
  services/         # 비즈니스 로직 (데이터 가공)
  utils/            # 유틸리티 (저장소, 헬퍼)
  hooks/            # 커스텀 훅 (상태 로직 재사용)
  types/            # 타입 정의
```

**규칙**:
- Screen: 데이터 fetching + 상태 관리 + 레이아웃 조합
- Component: props만 받아서 UI 렌더링 (비즈니스 로직 X)
- Service: 데이터 가공, 검증, 변환 로직
- 하나의 파일이 300줄을 넘으면 분리를 고려

---

## 7. 타입 any 사용 최소화

`any` 대신 구체적인 타입을 사용한다.

```tsx
// BAD
const handleData = (data: any) => { ... };

// GOOD
const handleData = (data: Word) => { ... };

// 허용되는 경우: catch 블록
catch (error: any) {
  showToast(error.message || '오류가 발생했습니다', 'error');
}
```

**규칙**:
- 인터페이스는 `src/types/`에 정의
- 외부 데이터는 타입 가드 또는 as 캐스팅 사용
- `unknown` > `any` (가능한 경우)

---

## 8. 저장 전 데이터 정합성 확인

데이터를 저장하기 전에 필수 필드, 형식, 중복 등을 검증한다.

```tsx
// GOOD
const handleSave = async () => {
  // 1. 필수 필드 체크
  if (!word.trim()) {
    showToast('단어를 입력해주세요', 'error');
    return;
  }

  // 2. 배열 최소 길이 체크
  const filteredMeanings = meanings.filter(m => m.trim());
  if (filteredMeanings.length === 0) {
    showToast('최소 하나의 뜻을 입력해주세요', 'error');
    return;
  }

  // 3. 중복 체크
  const duplicate = await wordService.checkDuplicate(word.trim(), categoryId);
  if (duplicate) { ... }

  // 4. 저장
  await wordService.createWord({ ... });
};
```

**검증 순서**: 필수값 -> 형식 -> 중복 -> 저장

---

## 9. ID 기반 조회 실패 시 에러 처리

존재하지 않는 데이터에 접근할 때 방어 로직을 작성한다.

```tsx
// BAD
const word = await wordStorage.getById(id);
setWord(word.word); // word가 undefined면 크래시

// GOOD
const word = await wordStorage.getById(id);
if (!word) {
  showToast('단어를 찾을 수 없습니다', 'error');
  return;
}
setWord(word.word);
```

**규칙**:
- `getById()` 결과는 항상 `undefined` 가능성 체크
- `.find()` 결과도 동일
- 삭제된 데이터 참조 시 graceful 처리 (크래시 방지)

---

## 10. 중복 요청 방지

버튼 클릭, Enter 키, 폼 제출 시 로딩 중 재요청을 차단한다.

```tsx
// BAD - 빠르게 연속 클릭하면 중복 저장됨
<TouchableOpacity onPress={handleSave}>
  <Text>저장</Text>
</TouchableOpacity>

// GOOD - loading 상태로 중복 요청 차단
<TouchableOpacity
  onPress={handleSave}
  disabled={loading}
  style={[styles.button, loading && styles.buttonDisabled]}
>
  {loading ? <ActivityIndicator color="#fff" /> : <Text>저장</Text>}
</TouchableOpacity>
```

```tsx
// GOOD - 함수 내부에서도 이중 방어
const handleSave = async () => {
  if (loading) return; // 이중 방어
  setLoading(true);
  try {
    await service.save(data);
  } finally {
    setLoading(false);
  }
};
```

**규칙**:
- 모든 비동기 버튼에 `disabled={loading}` 필수
- 함수 시작부에 `if (loading) return` 이중 방어 권장
- Enter 키 제출도 동일하게 loading 체크

---

## 11. 검색 입력 Debounce

타이핑할 때마다 즉시 실행하지 않고, 입력이 멈춘 후 일정 시간 뒤에 실행한다.

```tsx
// BAD - 매 글자마다 검색 실행 (성능 저하)
<TextInput onChangeText={(text) => searchApi(text)} />

// GOOD - 로컬 필터링 (데이터가 이미 메모리에 있을 때)
const filteredWords = useMemo(() => {
  if (!searchQuery.trim()) return words;
  const query = searchQuery.toLowerCase();
  return words.filter(w => w.word.toLowerCase().includes(query));
}, [words, searchQuery]);

// GOOD - API 호출이 필요한 경우 debounce
const [debouncedQuery, setDebouncedQuery] = useState('');

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedQuery(searchQuery);
  }, 300);
  return () => clearTimeout(timer); // cleanup 필수
}, [searchQuery]);

useEffect(() => {
  if (debouncedQuery) {
    searchApi(debouncedQuery);
  }
}, [debouncedQuery]);
```

**규칙**:
- 로컬 데이터 필터링: `useMemo`로 처리 (debounce 불필요)
- API 호출: 300~500ms debounce 적용
- debounce용 `setTimeout`은 반드시 cleanup으로 정리

---

## 12. 삭제 전 확인 다이얼로그

되돌릴 수 없는 작업은 반드시 사용자에게 확인을 받는다.

```tsx
// BAD - 바로 삭제
const handleDelete = async () => {
  await wordService.deleteWord(id);
};

// GOOD - 확인 후 삭제
const handleDelete = (id: number, name: string) => {
  Alert.alert(
    '삭제 확인',
    `"${name}"을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
    [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await wordService.deleteWord(id);
          showToast('삭제되었습니다', 'success');
        },
      },
    ],
  );
};
```

**적용 대상**:
- 데이터 삭제 (단어, 카테고리 등)
- 전체 초기화 / 리셋
- 수정 취소 (변경사항이 있을 때 뒤로가기)

---

## 13. 입력 글자수 제한

TextInput에 maxLength를 설정하여 과도한 입력을 방지한다.

```tsx
// BAD - 글자수 제한 없음
<TextInput value={word} onChangeText={setWord} />

// GOOD - maxLength 설정
<TextInput
  value={word}
  onChangeText={setWord}
  maxLength={100}
/>

// GOOD - 남은 글자수 표시 (메모 등 긴 입력 필드)
<View>
  <TextInput
    value={memo}
    onChangeText={setMemo}
    maxLength={500}
    multiline
  />
  <Text style={styles.charCount}>
    {memo.length}/500
  </Text>
</View>
```

**가이드라인**:
- 단어: 100자
- 뜻/의미: 200자
- 예문: 300자
- 메모: 500자
- 카테고리명: 50자

---

## 14. 연속 탭 방지

화면 전환, 네비게이션 등 주요 버튼에서 빠른 연속 탭을 방지한다.

```tsx
// BAD - 빠르게 두 번 탭하면 화면이 두 번 열림
<TouchableOpacity onPress={() => navigate('Detail')}>

// GOOD - useRef로 연속 탭 차단
const lastTapRef = useRef(0);

const handlePress = () => {
  const now = Date.now();
  if (now - lastTapRef.current < 500) return; // 500ms 이내 재탭 무시
  lastTapRef.current = now;
  navigate('Detail');
};

<TouchableOpacity onPress={handlePress}>
```

```tsx
// GOOD - 커스텀 훅으로 재사용
const useThrottledPress = (callback: () => void, delay = 500) => {
  const lastTapRef = useRef(0);
  return () => {
    const now = Date.now();
    if (now - lastTapRef.current < delay) return;
    lastTapRef.current = now;
    callback();
  };
};

// 사용
const handlePress = useThrottledPress(() => navigate('Detail'));
```

**적용 대상**:
- 화면 전환 버튼
- 모달 열기 버튼
- 외부 링크 열기

---

## 15. 환경변수 분리

API 키, 시크릿 등 민감정보는 코드에 직접 쓰지 않고 환경변수로 관리한다.

```tsx
// BAD - 코드에 하드코딩
const API_KEY = 'sk-1234567890abcdef';
const API_URL = 'https://api.example.com';

// GOOD - 환경변수 사용 (Expo)
// .env 파일
EXPO_PUBLIC_API_URL=https://api.example.com
EXPO_PUBLIC_API_KEY=sk-1234567890abcdef

// 코드에서 사용
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;
```

**규칙**:
- `.env` 파일은 `.gitignore`에 추가 (절대 커밋하지 않음)
- `.env.example` 파일로 필요한 변수 목록 공유
- Expo에서는 `EXPO_PUBLIC_` 접두사 사용
- 빌드 환경별 분리: `.env.development`, `.env.production`

---

## 16. XSS 방지

사용자 입력을 HTML로 직접 렌더링하지 않는다.

```tsx
// BAD - 사용자 입력을 HTML로 렌더링 (XSS 취약)
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// GOOD - React Native의 Text 컴포넌트는 기본적으로 안전
<Text>{userInput}</Text>

// BAD - WebView에 사용자 입력 직접 삽입
<WebView source={{ html: `<p>${userInput}</p>` }} />

// GOOD - 필요 시 이스케이프 처리
const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
```

**규칙**:
- React Native의 `<Text>`는 기본적으로 XSS 안전 (HTML 파싱 안 함)
- WebView 사용 시 사용자 입력 이스케이프 필수
- URL 파라미터에 사용자 입력 포함 시 `encodeURIComponent()` 사용

---

## 17. 민감정보 로깅 금지

비밀번호, 토큰, 개인정보를 로그에 출력하지 않는다.

```tsx
// BAD
console.log('로그인 요청:', { email, password });
console.log('토큰:', authToken);
console.log('사용자 정보:', { name, phone, address });

// GOOD
console.log('로그인 요청:', { email }); // 비밀번호 제외
console.log('토큰 존재 여부:', !!authToken); // 값 대신 존재 여부만
console.log('사용자 로그인 성공'); // 최소한의 정보만

// GOOD - 개발 환경에서만 로그 출력
if (__DEV__) {
  console.log('디버그 정보:', data);
}
```

**절대 로깅 금지 항목**:
- 비밀번호, PIN
- 인증 토큰 (JWT, API Key)
- 개인정보 (전화번호, 주소, 주민번호)
- 결제 정보 (카드번호)

---

## 18. 불필요한 리렌더링 방지

`useMemo`, `useCallback`, `React.memo`를 활용하여 성능을 최적화한다.

```tsx
// BAD - 매 렌더링마다 필터링 재실행
const filteredWords = words.filter(w => w.categoryId === selectedId);

// GOOD - 의존값이 변할 때만 재계산
const filteredWords = useMemo(
  () => words.filter(w => w.categoryId === selectedId),
  [words, selectedId]
);

// BAD - 매 렌더링마다 새 함수 생성 → 자식 리렌더링 유발
<ChildComponent onPress={() => handlePress(id)} />

// GOOD - 함수 참조 유지
const handlePressCallback = useCallback(
  () => handlePress(id),
  [id]
);
<ChildComponent onPress={handlePressCallback} />

// GOOD - 자식 컴포넌트 메모이제이션
const WordCard = React.memo(({ word, onPress }: WordCardProps) => {
  return (
    <TouchableOpacity onPress={onPress}>
      <Text>{word.word}</Text>
    </TouchableOpacity>
  );
});
```

**적용 기준**:
- 비용이 큰 계산 (필터링, 정렬, 집계): `useMemo`
- 자식에게 전달하는 콜백 함수: `useCallback`
- 자주 리렌더링되는 리스트 아이템: `React.memo`
- 단순 값 할당이나 JSX에는 과도하게 적용하지 않는다

---

## 19. useEffect cleanup

useEffect에서 타이머, 리스너, 구독 등을 사용하면 반드시 cleanup 함수로 정리한다.

```tsx
// BAD - 타이머 미정리 (메모리 누수)
useEffect(() => {
  const timer = setInterval(() => {
    fetchData();
  }, 5000);
}, []);

// GOOD - cleanup으로 정리
useEffect(() => {
  const timer = setInterval(() => {
    fetchData();
  }, 5000);
  return () => clearInterval(timer);
}, []);

// GOOD - 이벤트 리스너 정리
useEffect(() => {
  const subscription = Keyboard.addListener('keyboardDidShow', handleKeyboard);
  return () => subscription.remove();
}, []);

// GOOD - 비동기 작업 취소 (언마운트 후 setState 방지)
useEffect(() => {
  let isMounted = true;
  const loadData = async () => {
    const data = await service.getData();
    if (isMounted) {
      setData(data);
    }
  };
  loadData();
  return () => { isMounted = false; };
}, []);
```

**cleanup이 필요한 경우**:
- `setTimeout` / `setInterval` → `clearTimeout` / `clearInterval`
- `addEventListener` → `removeEventListener` / `.remove()`
- `subscribe` → `unsubscribe`
- 비동기 작업 → `isMounted` 플래그 또는 `AbortController`

---

## 20. 코드 변경 후 테스트 필수

코드를 등록, 수정, 삭제할 때 영향이 미치는 모든 범위에 대해 테스트를 진행한다.

### 테스트 범위

```
1. 단위 테스트 (Unit Test)
   - 변경된 함수/모듈이 단독으로 올바르게 동작하는지 확인
   - 입력값 경계, null/undefined, 빈 배열 등 엣지 케이스 포함

2. 통합 테스트 (Integration Test)
   - 변경된 코드가 다른 모듈/화면과 연동될 때 문제 없는지 확인
   - 예: storage 수정 → service → screen 전체 흐름

3. 기능 테스트 (Functional Test)
   - 사용자 관점에서 기능이 의도대로 동작하는지 확인
   - CRUD 전체 흐름, 화면 이동, 데이터 표시 등
```

### 테스트 시나리오 체크리스트

```tsx
// 1. 정상 시나리오 (Happy Path)
// - 올바른 입력으로 생성/수정/삭제/조회가 정상 동작하는가
// - 화면 간 데이터 전달이 올바른가
// - 저장 후 목록에 즉시 반영되는가

// 2. 비정상 입력 (Edge Cases)
// - 빈 문자열, 공백만 입력
// - 특수문자 (!@#$%^&*), 이모지 (😀), HTML 태그 (<script>)
// - 매우 긴 문자열 (maxLength 초과 시도)
// - 숫자만, 한글만, 영어만 입력
// - 필수 필드 미입력 후 저장 시도

// 3. 중복 데이터
// - 같은 이름의 카테고리 생성 시도
// - 같은 단어를 같은 카테고리에 중복 등록 시도
// - 수정 시 다른 기존 데이터와 이름 충돌

// 4. 데이터 정합성
// - 카테고리 삭제 시 하위 단어도 삭제되는가
// - 단어 수정 후 퀴즈/통계에 반영되는가
// - 빈 카테고리에서 퀴즈 시작 시도

// 5. 경계값
// - 데이터가 0건일 때 (Empty State 표시)
// - 데이터가 1건일 때
// - 데이터가 매우 많을 때 (성능)
```

### 테스트 보고 형식

```
✅ [정상] 카테고리 생성 - 이름/설명 입력 후 저장 성공
✅ [정상] 단어 추가 - 필수 필드 입력 후 저장 성공
⚠️ [주의] 카테고리 이름 중복 시 별도 처리 없음 → 개선 필요
❌ [오류] 빈 카테고리에서 퀴즈 시작 시 크래시 → 수정 필요
```

**규칙**:
- 코드 변경 후 반드시 영향 범위를 파악하고 관련 테스트를 수행
- 정상 시나리오뿐 아니라 비정상/엣지 케이스를 반드시 포함
- 테스트 결과를 위 형식으로 보고하여 사용자가 한눈에 확인 가능하게 작성
- `npx tsc --noEmit` 타입 체크는 모든 변경 후 필수 수행

---

## 21. 키보드 타입 설정

TextInput의 용도에 맞는 키보드 속성을 설정한다.

```tsx
// BAD - 모든 입력에 기본 키보드만 사용
<TextInput placeholder="이메일" />
<TextInput placeholder="비밀번호" />
<TextInput placeholder="단어" />

// GOOD - 입력 목적에 맞는 키보드 설정
<TextInput
  placeholder="이메일"
  keyboardType="email-address"     // 이메일 키보드 (@, . 포함)
  autoCapitalize="none"            // 자동 대문자 비활성
  autoCorrect={false}              // 자동 교정 비활성
/>

<TextInput
  placeholder="비밀번호"
  secureTextEntry                   // 비밀번호 마스킹
  autoCapitalize="none"
  autoCorrect={false}
/>

<TextInput
  placeholder="영단어"
  autoCapitalize="none"            // 영어 단어는 소문자 시작
  autoCorrect={false}              // 영어 자동 교정 비활성 (학습 단어 변조 방지)
/>

<TextInput
  placeholder="예문"
  autoCapitalize="sentences"       // 문장은 첫 글자 대문자
/>

<TextInput
  placeholder="전화번호"
  keyboardType="phone-pad"        // 숫자 전화번호 키보드
/>

<TextInput
  placeholder="나이"
  keyboardType="number-pad"       // 숫자 전용 키보드
/>
```

**주요 속성**:
- `keyboardType`: `default`, `email-address`, `number-pad`, `phone-pad`, `url`
- `autoCapitalize`: `none`(전부 소문자), `sentences`(문장 첫글자), `words`(단어 첫글자), `characters`(전부 대문자)
- `autoCorrect`: 자동 교정 (학습 앱에서는 `false` 권장 — 사용자 입력 변조 방지)
- `secureTextEntry`: 비밀번호 마스킹
- `returnKeyType`: `done`, `next`, `search`, `go` (키보드 엔터 키 라벨)

---

## 22. 키보드 닫기 처리

스크롤 영역을 터치하거나 배경을 터치할 때 키보드가 자동으로 닫히도록 처리한다.

```tsx
import { Keyboard } from 'react-native';

// BAD - 키보드가 입력 필드 외 영역 터치 시 닫히지 않음
<ScrollView>
  <TextInput />
  <View style={styles.content}>...</View>
</ScrollView>

// GOOD - ScrollView에서 키보드 닫기
<ScrollView
  keyboardShouldPersistTaps="handled"  // 버튼 터치는 동작 + 나머지 영역은 키보드 닫기
>
  <TextInput />
  <TouchableOpacity onPress={handleSave}>
    <Text>저장</Text>
  </TouchableOpacity>
</ScrollView>

// GOOD - 특정 시점에 프로그래밍으로 키보드 닫기
const handleSave = () => {
  Keyboard.dismiss();  // 저장 시 키보드 닫기
  performSave();
};

// GOOD - 모달 오버레이 터치 시 키보드 닫기
<TouchableOpacity
  style={styles.modalOverlay}
  onPress={() => {
    Keyboard.dismiss();
    closeModal();
  }}
>
```

**`keyboardShouldPersistTaps` 옵션**:
- `"handled"` (권장): 자식 요소의 onPress는 동작, 빈 영역 터치 시 키보드 닫기
- `"always"`: 키보드를 닫지 않음 (특수한 경우)
- `"never"` (기본값): 터치 시 항상 키보드만 닫고 버튼 터치 무시 — **사용하지 말 것**

**적용 대상**:
- 입력 폼이 있는 모든 ScrollView
- 모달 내 입력 폼
- 검색 바가 있는 화면

---

## 23. 다음 필드 포커스 이동

여러 입력 필드가 있는 폼에서 엔터(완료) 키를 누르면 다음 필드로 자동 포커스를 이동한다.

```tsx
import { useRef } from 'react';
import { TextInput } from 'react-native';

// BAD - 엔터를 누르면 키보드만 닫힘, 다음 필드로 이동 안 됨
<TextInput placeholder="단어" />
<TextInput placeholder="뜻" />

// GOOD - ref로 다음 필드 포커스 이동
const meaningRef = useRef<TextInput>(null);
const exampleRef = useRef<TextInput>(null);

<TextInput
  placeholder="단어"
  returnKeyType="next"                    // 키보드 엔터 키를 "다음"으로 표시
  onSubmitEditing={() => meaningRef.current?.focus()}  // 엔터 시 다음 필드로 이동
  blurOnSubmit={false}                    // 엔터 시 현재 필드 blur 방지
/>

<TextInput
  ref={meaningRef}
  placeholder="뜻"
  returnKeyType="next"
  onSubmitEditing={() => exampleRef.current?.focus()}
  blurOnSubmit={false}
/>

<TextInput
  ref={exampleRef}
  placeholder="예문"
  returnKeyType="done"                    // 마지막 필드는 "완료"
  onSubmitEditing={() => Keyboard.dismiss()}  // 마지막 필드에서 키보드 닫기
/>
```

**규칙**:
- 마지막 필드 전까지: `returnKeyType="next"` + `blurOnSubmit={false}`
- 마지막 필드: `returnKeyType="done"` (또는 `"go"`, `"search"`)
- `multiline` TextInput은 엔터가 줄바꿈이므로 포커스 이동 적용하지 않음
- 폼 필드가 3개 이상일 때 특히 유용 (UX 향상)
