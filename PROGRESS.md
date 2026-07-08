# OmniBridge AI — 작업 진행 기록 (PROGRESS)

> 한성대학교 '멀티모달 AI 콘텐츠 기획 제작 실습[A]' 졸업 과제
> 태블릿 손필기 ↔ 노트북 타이핑을 0.1초로 잇는 멀티모달 학습 동기화 앱

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 결과물 | 멀티모달 이기종 실시간 동기화 필기 앱 |
| 스택 | React 19 · Vite · Tailwind v4 · Firebase(인증/Drive) · **Supabase Realtime · Yjs(CRDT)** |
| 뼈대 출처 | Google AI Studio 생성 → 디테일 리팩토링 |
| 코드 위치 | `D:\claude code\omnibridge-ai` |

## 2. 타겟 페르소나 (양극단 MECE)

- **김지원** (24, CPA 수험생, ISTJ): 데이터 유실 신경증 → 필기 유실 제로 + 동기화 증거(초록불) 요구
- **박철수** (22, 가성비 대학생, ESTJ): SaaS 구독 거부 → $0 BYOS(Google Drive) + 1-Tap 로그인 요구

## 3. 하이브리드 동기화 아키텍처

```
필기/타이핑 → 1단계 실시간 릴레이(CRDT 델타 → Supabase Realtime broadcast, 0.1초)
            → 로컬 캐시 → Debounce 5초/강의 종료 → 2단계 영속 저장(.ob → Google Drive)
            → 오프라인 시 로컬 큐 격리 → 복귀 시 Yjs CRDT 머지
```

## 4. UT 결함 수정 (닐슨 휴리스틱)

| 휴리스틱 | 결함 | 상태 |
|---|---|---|
| #4 일관성 | 옴니-라이브 바 통일 + 태블릿/노트북 툴바·폰트 토큰 통일 | ✅ |
| 보안 | 썸네일 PII 마스킹 | ✅ 기존 구현 확인 |
| #3 통제권 | 알림 영구 차단 토글 | ✅ 신규 구현 |
| #10 온보딩 | 권한 사전 안내 화면 | ✅ 신규 구현 |

---

## 5. 작업 현황 — 간극 5개 중 4개 완료

| # | 간극 | 상태 | 핵심 작업 |
|---|---|---|---|
| #1 | 로그인·온보딩 부재 | ✅ | 1-Tap 로그인 + 권한 사전 안내 |
| #3 | 알림 영구 차단 불가 | ✅ | 토글 + localStorage 영속 |
| #5 | 빈 설정 패널 3개 | ✅ | 필기&녹음/스마트/성능 패널 |
| #4 | 동기화가 타이머 모킹 | ✅ **실연동·검증완료** | 실제 Supabase Realtime + Yjs (2-클라이언트 크로스 동기화 확인) |
| #2 | 태블릿↔노트북 뷰 분기 | ✅ | 기기 모드 토글 + 노트북 타이핑/복습 레이아웃 + CRDT 리플레이(유실 0) |

## 6. 파일 변경 내역

**신규**
- `src/components/onboarding/LoginView.tsx` — 1-Tap 로그인 + 페르소나 신뢰 신호
- `src/components/onboarding/OnboardingPermissions.tsx` — 권한 사전 안내
- `src/lib/preferences.ts` — 알림 토글 영속 스토어
- `src/lib/supabase.ts` — Realtime 클라이언트 (env 폴백)
- `src/lib/deviceMode.ts` — 태블릿/노트북 기기 모드 스토어
- `src/vite-env.d.ts` — env 타입 선언

**수정**
- `src/App.tsx` — login → onboarding → app 플로우 게이트
- `src/lib/syncEngine.ts` — 실제 CRDT + 웹소켓 (시뮬 폴백) + 전체 획 리플레이(getAllStrokes)
- `src/components/LiveNoteView.tsx` — 세그먼트 드로잉 + 원격 렌더 + 알림 끄기 + 태블릿/노트북 레이아웃 분기
- `src/components/SettingsView.tsx` — 설정 패널 3개 + 알림 토글
- `src/components/TopBar.tsx` — presence 'N대 연결' 뱃지 + 기기 모드 토글
- `.env.example` — Supabase 키 항목 추가

## 7. 실행 방법

```bash
cd "D:\claude code\omnibridge-ai"
npm install
npm run dev          # http://localhost:3000
```

## 8. 실제 동기화 활성화 (선택)

`.env.local` 생성 후 Supabase 무료 프로젝트 키 입력:

```
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="<anon-public-key>"
```

> 키가 없으면 시뮬레이션 모드로 정상 작동 (발표·시연 가능).
> Realtime broadcast는 DB 스키마 설정 불필요.

## 9. 알려진 이슈

- (해소됨) `PdfAdvancedRenderer.tsx` 타입 에러 — 공용 InkCanvas 엔진 통합 과정에서 정리, `tsc --noEmit` 0에러.

---

## 9-1. TASKS.md 작업 (2차 리팩토링)

| 항목 | 상태 | 내용 |
|---|---|---|
| B-1 | ✅ | 녹음 저장 실패 시 alert 제거 → "로컬에 안전 보관" 안심 토스트, 토큰 있을 때만 Drive 업로드 |
| B-2 | ✅ | PDF 단어검색 크래시 수정(`window.pdfjsLib`→`pdfjsLib`) + tsc 에러 4건 전부 해소(0에러) |
| B-3 | ✅ | 기기 추가 모달 강매성→정보성 톤 완화 |
| 선행 리팩토링 | ✅ | `inkEngine`(펜 렌더/필압) + `InkCanvas`(pointer 드로잉) + `PenToolbar` 분리. 동기화 페이로드를 `InkSegment`(penType·width·opacity)로 확장 |
| A-1 | ✅ | 펜 5종(볼펜·연필·브러쉬·형광펜·지우개) 시각 구분 + pointer 이벤트 필압 + 팝오버(색상·굵기·필압 감도) |
| A-2 | ✅ | transformers.js Whisper(`Xenova/whisper-tiny`) 온디바이스 전사 + 하단 도킹 전사 패널(접기/펼치기 영속) |
| A-3 | ✅ | 캡쳐 썸네일 클릭 → 슬라이드 배경 + InkCanvas 오버레이 필기 → 배경+잉크 합성 저장 |

### 드로잉 엔진 재사용 현황 (선행 리팩토링 → ✅ 3곳 전부 통합 완료)
- **빈 노트(빈/유선/옥스포드)**: `InkCanvas` 사용 ✅
- **캡쳐 슬라이드(A-3)**: `InkCanvas` 사용 ✅ (`SlideAnnotator`)
- **PDF**: ✅ **공용 엔진으로 통합 완료** — `PdfAdvancedRenderer`가 더 이상 자체 `tool/color/lineWidth` 레거시 드로잉을 쓰지 않고, `inkEngine`의 `renderInkSegment`/`widthForPressure`를 재사용한다.
  - 입력을 mouse → **pointer 이벤트**로 교체(`e.pressure` 필압 수집, `setPointerCapture`). 마우스는 0.5 폴백.
  - 펜 5종(볼펜·연필·브러쉬·형광펜·지우개)·필압·합성(multiply/destination-out) 시각이 빈 노트·슬라이드와 **완전히 동일**.
  - **페이지별 비율좌표(0~1) 저장 구조 유지** — 세그먼트 단위(`PageStroke.segs[]`)로 보관, 렌더 시 `dimensions × devicePixelRatio`로 픽셀 환산. 스크롤/줌(scale)·재렌더 시 위치·굵기 보존.
  - LiveNoteView는 임시 `legacyTool` 매핑을 제거하고 `pen={activePen}` + 펜 상태 props를 직접 전달. PDF 화면에도 공용 `PenToolbar`(플로팅) 노출.
  - **검색 하이라이트 기능 무손상**(텍스트 매치/네비게이션 z-layer·로직 그대로).
  - **런타임 검증 중 발견·수정한 버그 2건**:
    1. `stopDraw`가 `setStrokes(prev => [...prev, currentStrokeRef.current])`로 ref를 업데이터 안에서 늦게 읽어, 직후 `currentStrokeRef.current = null` 대입 때문에 **null이 저장**되어 pointerup 후 획이 사라짐 → 스트로크를 지역변수로 먼저 캡처해 해결.
    2. 드로잉 진행 플래그를 state→ref(`isDrawingRef`)로 변경(연속 pointer 이벤트 안정화, InkCanvas와 동일 패턴).
  - 검증: `npx tsc --noEmit` **0에러**, `npm run build` **통과**. **실 PDF 주입 후 펜 드로잉이 pointerup 후에도 유지됨을 프리뷰에서 확인**(획 픽셀 0→1925).

### 정확성 표기 (실연동 vs 온디바이스/시뮬)
- **기기 간 동기화**: ✅ **실연동** — Supabase Realtime + Yjs(CRDT). 2-클라이언트 크로스 동기화 검증됨.
- **음성 전사**: ✅ **온디바이스 실동작** — transformers.js Whisper(키 불필요, 브라우저 내 처리). 최초 녹음 시 모델 lazy-load. (헤드리스 자동검증 불가 — 실제 마이크 필요)
- **AI 요약 카드**: 🟡 데모용 더미(`data.ts`) — 실제 LLM 요약 아님.

> 검증: `npx tsc --noEmit` **0에러**, `npm run build` **통과**. B·A 화면 검증 완료(전사 실음성 제외).

## 9-2. 3차 개선 (사용자 피드백 7건)

| # | 항목 | 상태 | 내용 |
|---|---|---|---|
| 1 | 결제 티어 재구성 | ✅ | Free=거의 모든 기능 / Pro $9.99=전문가·팀 부가기능만 (기기 무제한, Cloud 부스트, 시맨틱 인덱싱) |
| 2 | PDF 리더 정상화 | ✅ | `width:100%`+`aspect-ratio`로 한 페이지가 화면에 꽉 차게, 세로 스크롤 + ◀▶ 페이지 버튼 |
| 3 | 저지연 미러링 | ✅ | 노트북 모드 메인 = 태블릿 필기 실시간 미러 영역, 세그먼트 단위 broadcast |
| 4 | 필기 메인 레이아웃 | ✅ | 필기 캔버스가 화면 전체, 하단 도킹 패널 [왼쪽 실시간 전사 \| 오른쪽 AI 요약] |
| 5 | **레이어 기능** | ✅ **검증완료** | 포토샵식 레이어 — 레이어별 오프스크린 캔버스 합성, 추가/삭제/표시토글/활성선택 (`LayerPanel`) |
| 6 | 색상 선택 확장 | ✅ | 기본 팔레트 + OS 색상 선택기 + 256색(16×16) 전문가 그리드 |
| 7 | **획/영역 지우개** | ✅ **검증완료** | 지우개 팝오버에 모드 토글 — 영역(destination-out, 활성 레이어만) / 획(히트테스트로 스트로크 통째 삭제) |

### #5/#7 핵심 리팩토링 — InkCanvas 스트로크 저장 모델
- 즉시 그리기 → **스트로크 객체 저장 모델**(`InkStroke` = 세그먼트 배열 + 레이어 소속) 전환.
- 레이어마다 오프스크린 캔버스를 두고 표시 캔버스에 순서대로 합성 (영역 지우개가 활성 레이어에만 적용되는 포토샵 시맨틱).
- **동기화 유지**: 세그먼트에 `strokeId`/`layerId` 포함, 획 삭제는 `erase_strokes` 연산으로 CRDT에 append-only로 쌓임 → 미러링·기기전환 리플레이가 삭제까지 포함해 동일 상태 재현 (유실 0 유지).
- 프리뷰 픽셀 단위 검증: 획 2개(5927px) → 획 지우개로 1개 삭제 → 정확히 나머지 획(2532px)만 잔존 / 레이어 2 숨김·표시 토글 시 4226↔2532px 무손실 왕복 / 영역 지우개 부분 삭제 정상.
- PDF 필기는 자체 페이지별 모델 유지 (레이어 미적용 — 후속 과제).

## 10. 남은 작업

> 지침서 핵심 간극 5개 **전부 완료**. 아래는 선택적 후속 작업.

1. ✅ (완료) PDF 드로잉을 공용 InkCanvas 엔진으로 통합 + 타입 에러 정리 (`PdfAdvancedRenderer.tsx`)
2. (선택) PDF 필기도 빈 노트처럼 `onSegment`→Supabase Realtime/CRDT로 기기 간 동기화 (현재 PDF 획은 페이지 로컬 상태)
3. (선택) 노트북 타이핑 노트도 CRDT로 동기화 (현재는 로컬 상태)
4. (선택) 빈 설정 패널 '계정/기기' 등 추가 디테일
