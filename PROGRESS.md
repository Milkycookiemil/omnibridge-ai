# OmniBridge AI — 작업 진행 기록 (PROGRESS)

> 한성대학교 '멀티모달 AI 콘텐츠 기획 제작 실습[A]' 졸업 과제
> 태블릿 손필기 ↔ 노트북 타이핑을 0.1초로 잇는 멀티모달 학습 동기화 앱

---

## ⏩ 다음 세션 재개 지점 (2026-07-13 갱신)

**작업트리 clean · 로컬=원격(전부 push됨) · `tsc --noEmit` 0에러 · `npm run build` 통과.** HEAD=`37ca8ae`.

### 🔴 먼저 할 것 — 미실행 시 클라우드 노트 저장이 깨짐
Supabase SQL Editor에서 실행:
```sql
alter table public.notes add column if not exists transcript jsonb;
```
> `toRow`가 이제 항상 `transcript`를 upsert에 포함 → 컬럼 없으면 **모든 노트의 클라우드 저장 실패**(PostgREST unknown column). 로컬 IndexedDB는 무관. `supabase/schema.sql`에도 문서화됨.

### 이번 세션(2026-07-11~13) 완료·커밋 — 필기 기능 대확장
- **필기 P0 4개**: ①입력 스무딩(중점 이차베지어, 각짐 제거) ②올가미 선택(이동·크기·색변경·복제·삭제, 삭제+재추가 델타로 유실0 동기화) ③undo/redo(동작별 {removed,added} 기록) ④자(직선, 45° 스냅)·도형 자동보정(직선/원/사각형 인식, 삼각형·낙서 거부). + 고정 비율 페이지(리사이즈 찌그러짐 해결)·도구별 커서(원/납작사각형)·펜 팝오버 실시간 미리보기.
- **P0 다듬기 + PDF 적용**: 도형 인식 임계 튜닝(100회 검증). PDF(`PdfAdvancedRenderer`)에도 스무딩·자·도형·**올가미·undo/redo**(페이지별 스냅샷) 적용 + PDF 자체 도구 툴바(캔버스 툴바가 PDF엔 안 보임). PDF 올가미 크기조절은 후속.
- **P1 획↔전사 타임스탬프 싱크(양방향, 우리만의 차별점)**: 녹음 중 그린 획에 경과초(`InkStroke.t`/`PageStroke.t`) 기록 → ①전사 라인 클릭→그 시각 획 앰버 하이라이트(+PDF는 매칭 페이지로 스크롤) ②올가미 모드에서 획 탭→그릴 때의 전사 라인으로 점프. 빈노트+PDF 양쪽. **원격 t 전파**(`stroke_time` 델타 추가, syncEngine `isInkDelta` 통과). **전사 영속화**(`Note.transcript`+`notes.transcript jsonb`, `useTranscription.restore`) → 재방문·크로스디바이스에서도 동작.
- **버그 수정**: ①PDF 노트에 녹음 버튼이 아예 없어 녹음 불가였음 → PDF 헤더에 추가. ②녹음 종료 후 전사 상태가 '청취 중'에 멈추던 버그(`flushWindow` finally가 무조건 listening으로 덮어씀) → interval 살아있을 때만 listening, 아니면 idle.
- 앞서(문서/문구/배포): 랜딩 히어로 카피 제품화 방향 갱신, 앱 전반 옛 문구(NPU·BYOS·구독료$0) 통일, 설정 데모기능 '곧 제공' 표시, 개인정보 보안 팀 에이전트+회원가입 동의 강화(국외이전·동의분리·만14세), 필기앱 필기 전문가 에이전트, GitHub Pages 배포 트리거(`[main, master]`) 수정.

### ⚠️ 검증 한계(중요)
이 세션 프리뷰 팬이 **앱 에디터로 진입 불가**(뷰 전환이 합성 클릭에 미반응)+**마이크 없음** → 필기 인터랙션·녹음/전사의 **실제 화면은 미검증**. 대신 **순수 로직(도형인식·올가미 기하·undo/redo·시각매칭·각도스냅)을 node 합성 테스트로 검증** + tsc·build. **실브라우저 확인 필요 항목**: 필기 스무딩/올가미/자/도형 시각, 녹음→전사→라인클릭/획탭 싱크, PDF 녹음버튼, 고정페이지 레이아웃.

### 바로 이어서 할 후보
- **P1 나머지**: PDF 페이지 썸네일 네비·북마크 / 확대해서 쓰기(zoom-write)
- **필기 마저**: PDF 올가미 크기조절, 앱 내 남은 옛 문구 통일(SettingsView 데모기능 등)
- **개인정보 1~3순위 실측**(국외이전 고지·동의 분리·만14세는 코드 반영됨, 상용화 시 변호사 검토)
- **Stripe 결제**(3단계, 수익화)
- **커스텀 도메인 / Google Drive 활성화(Client ID)**

---

## 📜 이전 재개 지점 (2026-07-10)

**작업트리 clean · `tsc --noEmit` 0에러 · `npm run build` 통과.** (HEAD는 아래 커밋 목록 최신)

**2026-07-09 세션 완료·커밋 (제품화 로드맵):**
- `a21477b` **1b-4b** 노트 Supabase 클라우드 저장 + 계정별 격리(RLS) — 2계정 실측 검증
- `fbfffbd` **1c** 노트 내보내기/가져오기(.ob 로컬 ✅ + Google Drive 코드 완성·비활성)
- `aabf5fa` **AI 요약 실연동(BYOK)** — 더미 제거, 사용자 본인 Claude 키로 전사 요약
- `2e0d8f7` **2단계-법적 페이지** 이용약관·개인정보처리방침 + 로그인/설정 링크

**동기화 완성도 마무리 (2026-07-10 세션) — 완료·검증:**
- `d07e5e7` **게스트→로그인 노트 이관** — 로그인 시 게스트(user_id null) 노트를 현재 계정으로 귀속+업로드. 2계정 실측.
- `1996ea7` **삭제 tombstone(소프트 삭제)** — `deleteNote`가 행을 지우지 않고 `deleted=true`로 표시 → 삭제가 일반 LWW 갱신이 되어 기기 간 전파. `notes`에 `deleted`/`deleted_at` 컬럼 추가. 2계정 실측.

**PDF 노트 영속화 (2026-07-10 세션) — 완료·검증:**
- 결정: 필기앱 10종 조사 결과 전부 "PDF를 노트와 함께 저장(다시 고르기 없음)". 삼성/GoodNotes 방식 채택 → **PDF 원본을 Supabase Storage에 저장 + 무료 용량 한도**(비용은 티어로 통제).
- `84c1775` **Phase 1**: `pdfStore.ts` — Storage(note-files 버킷) 업로드/다운로드/삭제 + 무료 한도(파일당 10MB/계정당 50MB, QuotaError). 경로 `<uid>/<noteId>.pdf`, 정책으로 계정 격리.
- **Phase 2**(이 커밋): PDF 페이지별 필기를 노트에 영속화.
  - `pdfInk.ts` 공용 타입, `PdfAdvancedRenderer` 페이지 획 리프팅(`initialPageStrokes`/`onStrokesChange`), `notesStore` `pdfPages` 필드 + `saveNotePdfPages` + 삭제 시 Storage 파일 정리, `LiveNoteView` 다운로드·복원·디바운스 저장, `NewNoteModal` PDF 선택 시 노트생성+업로드+한도안내.
  - `notes`에 `pdf_pages jsonb` 컬럼 추가(마이그레이션 사용자 실행 완료).
  - **실측(실 Supabase)**: PDF 노트 생성→Storage 업로드 / 필기→pdfPages 저장·동기화 / **fresh IDB 재로그인→PDF 자동 다운로드+필기 복원(6362px, 다시 고르기 없음)** / 10MB 초과 차단 배너 / 삭제 시 Storage 파일 제거.
  - **남음(후속)**: PDF 노트 썸네일, 서버측 한도 강제, tombstone/Storage purge.

**캡쳐 노트 영속화 (2026-07-10 세션) — 완료·검증:**
- 캡쳐 슬라이드(배경+잉크 합성 이미지 목록)를 **하나의 JSON으로 Storage에 저장**(`<uid>/<noteId>_capture.json`) — DB 컬럼 추가 없이 note-files 버킷 재사용.
- `pdfStore.ts`에 `uploadCaptureSlides`/`downloadCaptureSlides`/`deleteCaptureSlides`(+`CaptureSlide` 타입) 추가.
- `LectureCapture`: `noteId` prop 받아 마운트 시 복원 + add/remove/annotate 시 디바운스 저장 + 언마운트 flush + 한도 배너.
- `NewNoteModal`: 강의 판서 캡쳐 → `createNote('capture')` 후 noteId로 이동. `LiveNoteView`가 noteId 전달. `deleteNote`가 캡쳐 파일도 정리.
- **버그 발견·수정(검증 중)**: Storage 정책에 **UPDATE가 없어 upsert(덮어쓰기)=UPDATE가 RLS로 차단** → 캡쳐 2번째 저장부터 실패. `note_files_own_update` 정책 추가(사용자 실행)로 해결. schema.sql에 Storage 정책 4종 문서화.
- **실측**: 캡쳐 노트 생성·동기화 / Node로 슬라이드 심고 재열기→2개 자동 복원 / 앱에서 1개 삭제→Storage 2→1 반영(upsert 성공) / 삭제 시 파일 정리. (getDisplayMedia 화면캡쳐는 헤드리스 불가 — 저장/복원 데이터 경로만 검증)

**PDF 노트 썸네일 (2026-07-10 세션) — 완료·검증:**
- PDF 노트 저장 시 첫 페이지(배경 렌더 + 필기 레이어)를 240px JPEG로 합성해 `note.thumbnail`에 저장 → 대시보드 카드에 미리보기 표시(기존 일반 아이콘 대체). `LiveNoteView.makePdfThumb` + 디바운스 저장에 연결.
- 실측: 필기→썸네일 생성(JPEG 3KB)·동기화, 대시보드 카드 이미지 표시(240×311) 확인.
- **캡쳐 노트 썸네일**도 추가: 첫 슬라이드를 240px JPEG로 축소해 `saveNoteThumbnail`로 저장(`LectureCapture`). 실측: 슬라이드 저장 시 썸네일 생성(2KB)·동기화·카드 표시 확인.

**노트북 타이핑 노트 동기화 (2026-07-10 세션) — 완료·검증:**
- 노트북 모드 '타이핑 복습' 텍스트가 로컬 state일 뿐 미저장이던 것 → `note.typedText`로 저장·클라우드 동기화(strokes와 동일 디바운스+LWW 패턴).
- `notesStore`: Note.typedText + NoteRow.typed_text + toRow/fromRow + `saveNoteTypedText`. `notes`에 `typed_text text` 컬럼 추가(마이그레이션 실행 완료).
- `LiveNoteView`: 노트 열 때 typedText 복원 + 타이핑 시 0.8초 디바운스 저장. placeholder의 "0.1초" 문구는 실제(디바운스 LWW)에 맞게 "동기화"로 완화.
- 실측: 타이핑→저장·동기화(_dirty false) / fresh IDB 재로그인→노트 열기→타이핑 48자 복원(크로스디바이스). (진짜 문자단위 실시간 동기화는 후속)

**⚠️ 외부 준비물 적용됨(이번 세션)**: Supabase Storage `note-files` 버킷(Private) + 정책 4종(read/insert/**update**/delete), `notes` 컬럼 `pdf_pages`·`typed_text`.

**바로 이어서 할 후보 (사용자와 정할 것):**
- **B** 실제 호스팅·도메인 점검 (GitHub 자동배포는 이미 있음 → 도메인 연결·배포 확인)
- **C** Stripe 구독 결제 (3단계, Stripe 계정 필요. Pro 티어 UI는 배선만 됨)
- **D** 남은 마무리: Google Drive 활성화(Client ID 필요) / PDF·캡쳐 노트 클라우드 영속화 / tombstone 오래된 행 정리(purge)

**활성화 대기 중인 외부 준비물:**
- Google Drive 내보내기 실동작 → `.env.local`에 `VITE_GOOGLE_CLIENT_ID`(발급 절차는 `.env.example`)
- AI 요약 실생성 검증 → 사용자 본인 Anthropic API 키(설정 → AI 엔진)

> 상세 로그는 §11 "제품화 전환" 참고. 테스트 계정: `a@test.com`/`b@test.com` (비번 메모리 참조).

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

---

## 11. 제품화 전환 (2026-07~) — 졸업 제출 이후

> 학교 제출 **완료**. 목표가 **"대중이 실제로 쓰는 수익형 웹 제품"**으로 변경됨.

### 확정된 방향
- **수익모델:** 구독/프리미엄 (Pro 티어). AdSense는 로그인 월 뒤 필기 앱 특성상 부적합으로 판단(트래픽·색인 콘텐츠 부족).
- **데이터 저장:** 하이브리드 → 실무는 **Supabase 기본 저장(코어) + Google Drive 선택적 내보내기**. Google 로그인을 *선택*으로 만들어 OAuth 앱 검증(수 주) 부담을 뒤로 미룸.

### 인증 (완료 · 2026-07)
- **사용자 소유 Firebase 프로젝트(`omnibridge-ai-953cb`)로 교체** (기존 AI Studio 자동생성 프로젝트는 소유권 없음).
- 이메일/비밀번호 회원가입·로그인 + Google 로그인(**팝업 방식**) + 자동 로그인(Firebase 로컬 지속성 + `ob_guest`/`ob_onboarding_done` localStorage 플래그) + 로딩 스플래시·폴백 타이머.
- **구글은 리다이렉트 아님, 팝업 필수** — localhost↔firebaseapp.com 교차도메인 저장소 차단 때문. 콘솔에서 이메일/비번·Google 제공자 활성화됨.

### 정직한 현재 상태 (실제 vs 시뮬) — 2026-07-09 갱신
- ✅ **손필기 노트가 실제로 영속 저장됨** — IndexedDB(`notesStore`), 노트별 `InkStroke[]`. 대시보드 목록·생성·열기·삭제·이름변경 실제 동작(더미 제거).
- ✅ **다중 노트 워크스페이스** — 포토샵식 탭 + 좌우 2분할 + 크롬식 `+` 팝업(노트 열기/새 노트). 꽉찬 레이아웃.
- ✅ 인증 · 필기 엔진(펜 5종/레이어/획·영역 지우개) · 온디바이스 Whisper 전사.
- ✅ **AI 요약 = 실 Claude 연동(BYOK)** — 사용자 본인 키로 전사 텍스트를 실시간 요약(더미 제거). 요청 경로(CORS·엔드포인트·헤더)는 검증됨, 유효 키로의 생성은 사용자 키 필요.
- ✅ **노트 클라우드 저장 + 계정별 격리(4b)** — 손필기 노트가 Supabase `notes`에 계정별로 저장됨(로컬 IndexedDB는 오프라인 캐시). 다른 기기/브라우저에서 같은 계정 로그인 시 노트 복원. 2계정 실측 검증됨. (Drive는 여전히 업로드만, 읽기 없음)
- 🟡 Supabase = **인증(Auth) + 노트 DB 영속(4b)** 사용 중 + Realtime 브로드캐스트. 단, PDF/캡쳐 노트는 아직 클라우드 미영속(빈 노트만).
- ⚠️ PDF/캡쳐 노트는 비영속(임시 뷰). PDF 필기는 페이지 로컬 상태.

### 제품화 로드맵
| 단계 | 내용 | 외부 준비물 | 상태 |
|---|---|---|---|
| **1a** | 로컬 우선 실제 노트 CRUD (IndexedDB), 더미 제거 + 다중 노트 워크스페이스(탭/분할) | 없음 | ✅ **완료** |
| **1b** | Supabase 저장 + 계정별 격리(RLS). 인증도 Supabase Auth로 통합(Path 2) | Supabase 프로젝트 | ✅ **완료** (4a·4b, 2계정 실측 검증) |
| **1c** | 내보내기: 로컬 `.ob` 내보내기/가져오기 ✅ + Google Drive 업로드(코드 완성, ID 대기) | Drive용 Google OAuth Client ID | 🔄 로컬 ✅ / Drive 준비됨(비활성) |
| **2** | 이용약관·개인정보처리방침 페이지 ✅ / 실제 호스팅·도메인 ⬜ | 도메인 | 🔄 법적 페이지 ✅ / 호스팅·도메인 남음 |
| **3** | Stripe 등 구독 결제 | 결제사 계정 | ⬜ |

### 완료된 작업 로그 (커밋)
- `95af5b3` 필기 레이어·지우개 (이전 세션 체크포인트)
- `1bb5c22` 로그인 개편 (구글 팝업 + 이메일 회원가입 + 자동 로그인, 사용자 소유 Firebase)
- `478e6c3` **1a**: 실제 노트 저장 (IndexedDB, 손필기 중심)
- `7ecb504` 1a 다듬기: 노트 이름변경 + 편집기 헤더
- `c430ead` 다중 노트 워크스페이스: 탭 + 2분할 + 꽉찬 레이아웃
- `f78a01d` 크롬식 `+` 버튼 → 노트 열기/새 노트 팝업
- `4ffdc8a` 새 노트 모달 공용화(`NewNoteModal`) — 홈·워크스페이스 동일
- `fb24917` **1b-4a**: 인증을 Firebase→**Supabase Auth(이메일)**로 전환 + `supabase/schema.sql`(notes+RLS)
- `51a4ee0` 로그아웃/프로필 드롭다운 + 설정 로그아웃 + 조건부 구독해지

### 2단계-법적 페이지 (약관·개인정보) — 2026-07-09
**결정(사용자): "A" = 약관·개인정보 먼저.** 공개 런칭 전 법적 필수(이미 이메일·노트 수집 중).
- **`src/components/LegalView.tsx`** — 이용약관 + 개인정보처리방침(한국어). 상단 토글로 두 문서 전환, 뒤로가기. 앱 실제 동작에 맞춰 정직하게 작성: 수집=이메일·노트·썸네일 / 전사=온디바이스(외부 전송 없음) / AI 요약=BYOK일 때만 Anthropic 전송 / 저장=Supabase(RLS 계정격리)+로컬 IndexedDB 캐시 / 내보내기·삭제 권리. 문의처=`milkychrischris@gmail.com`. (상용화 시 법률 검토 권장 주석)
- **연결**: `App`이 `legalDoc` 상태로 오버레이(로그인·앱 어느 단계에서도 최상단, 뒤로가기 시 이전 화면 복귀). 로그인 푸터 "서비스 약관/개인정보 처리방침"을 실제 링크로, 설정→"권한 & 정보"에 약관·개인정보 링크 추가.
- **검증**: 로그인 푸터 링크→약관 열림→뒤로가기 로그인 복귀 / 설정 링크→개인정보 열림→뒤로가기 앱 복귀 / 두 문서 렌더·토글·Supabase·Anthropic·BYOK 문구 확인. tsc 0에러·build 통과·콘솔 에러 없음.

### AI 요약 실연동 (BYOK) — 2026-07-09
**결정(사용자): "AI 요약 진짜로" + 키 방식 = BYOK(사용자 자기 키).** 간판 기능이던 "AI 요약 카드"가 더미(4초마다 `dummyData.summaryCards`)였던 걸 실제 Claude 요약으로 교체.
- **`src/lib/aiSummary.ts`** — 사용자 본인 Anthropic API 키를 설정에서 입력→localStorage 저장(BYOK, 키가 본인 소유라 노출 위험 없음·BYOS 철학과 동일). 브라우저에서 Messages API 직접 호출(`anthropic-dangerous-direct-browser-access`). SDK 미설치(번들 경량화·CLAUDE.md "불필요한 의존성 금지")로 `fetch` 사용.
- **모델 선택** — Haiku 4.5(기본, 빠름·저렴) / Sonnet 5 / Opus 4.8. 요약은 고빈도라 Haiku 기본, 비용은 사용자 부담이므로 모델 선택권을 사용자에게 노출(claude-api 스킬 지침 "비용은 사용자 결정").
- **`SettingsView` AI 엔진** — 키 입력(password)·저장·**테스트** 버튼 + 모델 드롭다운.
- **`LiveNoteView`** — 더미 카드 타이머 제거. 녹음 중 전사(`transcription.lines`)를 6초 후 첫 요약 + 이후 20초마다 Claude로 요약해 카드 갱신. 키 없으면 "설정 필요" 안내 카드, 실패 시 오류 카드.
- **검증**: 설정 UI 렌더(키/모델/버튼) 확인 / 키 미설정 시 안내 카드·더미 제거 확인 / **가짜 키 테스트 → `OPTIONS 200`(CORS 프리플라이트) + `POST 401`**(Anthropic 실제 도달·엔드포인트·헤더·CORS 정상) 네트워크 로그로 확인. tsc 0에러·build 통과.
- **미검증**: 유효 키로의 실제 요약 생성(사용자 유료 키 필요 — Drive와 동일한 정직한 경계).

### 1c 진행 상황 (내보내기/가져오기) — 2026-07-09
**결정(사용자): "둘 다" — 로컬 파일 먼저 + Drive 코드까지.**
- ✅ **로컬 `.ob` 내보내기/가져오기 (검증됨)** — `src/lib/exporter.ts`. `.ob`=JSON(`{format,version,notes[]}`), 노트별/전체 내보내기 + 파일 가져오기(새 id 발급으로 덮어쓰기 방지, 현재 계정 소유로 저장 → write-through로 클라우드에도 동기화).
  - UI: 대시보드 카드 hover에 **내보내기(Download)** 버튼, 헤더에 **가져오기(Upload)** 버튼, 설정 '데이터 내보내기'→**전체 내보내기(.ob)**.
  - 실측 검증: 내보내기 blob 가로채 `.ob` 구조·strokes 확인 / 획 든 `.ob` 가져오기 → 새 노트 생성·획(`__marker`)·스타일 보존·`user_id`=현재계정·`_dirty:false`(Supabase 업로드 성공, Node로 행 확인).
- 🔄 **Google Drive 업로드 (코드 완성, 비활성)** — `exportNoteToDrive` + `drive.ts` upload + `auth.ts` GIS 토큰(팝업, `drive.file` 스코프, 온디맨드). `VITE_GOOGLE_CLIENT_ID` 없으면 `isGoogleConfigured=false`로 카드의 Drive 버튼 미노출(죽은 버튼 방지). **활성화하려면**: Google Cloud에서 OAuth Client ID 발급 후 `.env.local`에 입력(`.env.example`에 절차 문서화). drive.file 스코프라 앱 심사 불필요.
  - **미검증**: 실제 Drive 업로드는 Client ID가 없어 헤드리스 검증 불가(코드 경로만 확인). ID 준비 후 검증 필요.
- **버그 수정(검증 중 발견)**: `listNotes`가 `currentUid()`로 필터하는데 앱 로드 직후 세션 확정 전 대시보드가 마운트되면 `uid=null`로 걸러져 **로그인 유저 노트가 빈 목록**으로 보이던 문제 → `auth.onUserChange` 구독으로 세션 확정/계정 변경 시 대시보드가 재조회하도록 수정(검증됨).

### 1b 진행 상황 (Supabase 클라우드 저장 + 계정별 격리)
**인증 방식 결정 = Path 2 (Supabase Auth로 통합).** Firebase↔Supabase 서드파티 인증은 `role:authenticated` 커스텀 클레임(Firebase Cloud Function + Blaze 유료플랜) 필요라 부담 → 더 단순한 Supabase Auth로 전환. Firebase 코드/설정은 잔존(미사용, 이후 정리 가능).

- ✅ **4a 완료** (`fb24917`, `51a4ee0`): 인증을 Supabase Auth(이메일)로 교체. 세션 자동유지·자동로그인, 로그인 화면 구글 버튼 제거, 상단 프로필 드롭다운·설정 로그아웃. Google/Drive는 현재 비활성(no-op, 이후 추가).
- ✅ **4b 완료·검증됨**: `notesStore`가 로컬(IndexedDB)=오프라인 캐시 + Supabase `notes`=진실의 원천 구조로 확장.
  - **계정 스코프**: 노트에 `user_id` 부여, `listNotes`가 현재 로그인 계정 노트만 반환(같은 브라우저 계정 격리).
  - **낙관적 write-through**: 로컬 즉시 저장 → 백그라운드 Supabase upsert. 실패/오프라인이면 `_dirty` 플래그로 남겨 재로그인·`online` 이벤트 시 재전송(`syncNotesFromCloud`).
  - **LWW 머지**: 로그인 시(`App.tsx onAuthSuccess`) 원격 pull → `updated_at` 최신 우선 병합. `onNotesChanged` 구독으로 대시보드 자동 갱신.
  - **결정(사용자)**: 동기화=즉시 write-through / 충돌=Last-Write-Wins.
  - **실측 검증(2계정, 실 Supabase)**: ①a가 만든 노트가 Supabase에 업로드(`_dirty→false`, Node로 행 확인) ②RLS로 a 세션은 a 노트만 조회 ③b 대시보드에 a 노트 안 보임(앱 스코프 격리) ④빈 IDB(기기 교체 시뮬)에서 a 재로그인 시 Supabase에서 노트 복원.
  - **알려진 한계**: 게스트(`user_id:null`)로 만든 노트는 로그인 후 계정으로 자동 이관 안 됨(후속). 오프라인 중 삭제는 tombstone 미구현이라 다음 pull에서 되돌아올 수 있음.

**환경/설정 (사용자 소유):**
- Supabase 프로젝트 `wegzchfcbcfuzggwpxft`, 키는 `.env.local`(git 제외). dev 서버 재시작 필요.
- `notes` 테이블 + RLS(`auth.jwt()->>'sub' = user_id`) 생성 완료 → `supabase/schema.sql`.
- 테스트 계정: `a@test.com`(생성·확인·로그인 검증됨), `b@test.com`(격리 테스트용, 필요). Supabase → Authentication → Users → Add user → **Auto Confirm User**로 생성(대시보드의 Confirm email 토글이 안 보여 Users 직접 생성으로 우회).

**4b 주의(SIM):**
- 전역 `syncEngine.yStrokes`가 모든 획을 누적 → 노트별 스코프 필요(1a는 이미 노트별 IndexedDB로 분리).
- 로컬 IndexedDB는 사용자 무관 공유 → Supabase는 RLS로 분리하고, 로컬 캐시도 user별 키 분리 고려.
- 구독 해지 버튼은 `plan!=='free'`일 때만 표시되나 실제 Pro 전환 경로(Stripe, 3단계)가 없어 현재는 도달 불가(배선만).

### 협업 에이전트 팀 (`.claude/agents/`)
바이브코딩(메인 코딩) · SIM(냉정 QA, 매 응답 끝 오류 점검) · UX/UI 디자이너 · AI 사업화 · AI 전문가.
반복 루틴은 `.claude/skills/verify-and-commit`(검증+커밋) 스킬로 표준화.
