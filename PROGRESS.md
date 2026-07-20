# OmniBridge AI — 작업 진행 기록 (PROGRESS)

> 한성대학교 '멀티모달 AI 콘텐츠 기획 제작 실습[A]' 졸업 과제
> 태블릿 손필기 ↔ 노트북 타이핑을 0.1초로 잇는 멀티모달 학습 동기화 앱

> 📌 **이 파일은 "지금 어디까지 했나 / 다음에 뭘 하나"만 담는다(가볍게 유지).**
> 과거 세션 상세 로그·아키텍처·파일 변경 내역은 [`PROGRESS-archive.md`](./PROGRESS-archive.md) 참고.
> **세션 재개 시 읽을 것(최소):** `git log --oneline -8` + 이 파일 상단 + `MEMORY.md`. 그걸로 부족할 때만 archive를 `Grep`으로 필요한 키워드만.

---

## ⏩ 다음 세션 재개 지점 (2026-07-13 갱신)

**작업트리 clean · 로컬=원격(전부 push됨) · `tsc --noEmit` 0에러 · `npm run build` 통과.** HEAD=`5eff884`.

> ⚠️ **repo 루트의 `참고맨/` 폴더는 프로젝트 코드가 아님** — Edupen Pro(경쟁 전자칠판 SW) 참고 덤프. 커밋하지 말 것(`.gitignore` 대상 또는 프로젝트 밖으로).

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

### ✅ 실브라우저 검증 (2026-07-13 세션) — 필기 P0 시각 전부 통과
지난 세션 미검증이던 필기 P0을 **실제 에디터 화면에서 검증 완료**(게스트→새 노트→빈 페이지→무선 진입. 인앱 Browser 팬 + ref 클릭 + pointer 이벤트 주입 + 픽셀/각도 측정).
- ✅ **입력 스무딩**: 지그재그 획 꼭짓점이 둥글게 렌더(중점 이차베지어), 획 렌더·영속 정상.
- ✅ **undo/redo**: 획 픽셀 2384→0(undo)→2384(redo) 정확 왕복.
- ✅ **도형 인식**: 저노이즈 원→**정원 스냅** / 고노이즈(±14%) 원→자유곡선 유지(**낙서 거부도 정상**).
- ✅ **올가미 선택**: 선택박스+우하단 크기핸들+액션툴바(복제·삭제·색5종). 색 검정→빨강 변경 실동작(red 2329px).
- ✅ **자(직선+각도스냅)**: ±14px 흔든 입력→완벽 수평선 / ~40° 입력→**45° 스냅**(피팅각 45.0°, bbox 195×195 정사각).
- ⛔ **획↔전사 싱크**: 프리뷰 팬 **마이크 차단**(getUserMedia NotAllowedError) → 전사 라인 생성 불가 → 라인클릭/획탭 시각 검증 **여전히 불가**. 앱은 "오프라인 필기 모드"로 우아하게 폴백(크래시 없음). 매칭 수학은 node 로직 테스트가 커버.

### ✅ PDF 경로 검증 (2026-07-13 세션) + 🐛 게스트 PDF 버그 수정
검증 중 **게스트는 PDF 노트를 아예 못 여는 버그**를 발견·수정했다.
- **버그**: App은 `noteId` 있으면 WorkspaceView로 라우팅(App.tsx:154) → WorkspaceView(:130)가 `navContext.file`을 안 넘김 → LiveNoteView는 `downloadPdf`에 의존 → 게스트(Storage 없음, pdfStore.ts:66 `return null`)는 **"PDF 로딩 중…" 영구 멈춤**. 공개 "게스트로 둘러보기" 진입에서 간판 기능이 죽던 문제.
- **수정**: `pdfStore`에 방금 고른 PDF File을 세션 메모리에 잠시 두는 캐시(`stashPdfFile`/`takePdfFile`/`forgetPdfFile`). NewNoteModal이 stash → LiveNoteView가 `downloadPdf`보다 먼저 캐시 사용 → 게스트도 즉시 렌더, 로그인 사용자는 불필요한 Storage 재다운로드도 절약. 삭제 시 forgetPdfFile로 정리. tsc 0에러·build 통과.
- **실브라우저 검증(게스트, 테스트 PDF 2p 주입)**: PDF 2페이지 렌더 + 페이지 네비(1/2, ◀▶) / **PDF 헤더 녹음버튼 존재**(지난 세션 수정 확증) / PDF 위 **스무딩**(지그재그 라운딩 6282px) / **undo**(6282→0) / **도형 인식**(원 스냅 bbox 220×220) / **자**(±22px 흔든 입력→피팅각 0.2° 수평, 세로퍼짐 7px=선두께).

### ✅ 전사 완전 복구 (2026-07-13 세션) — 그동안 전사가 0줄이던 근본 버그
- **증상**: 녹음해도 전사 라인이 하나도 안 생김.
- **원인(런타임 진단)**: 모델 파일은 다 받아지는데 **onnxruntime-web이 세션 생성에서 실패** — `qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits Missing required scale`. `@huggingface/transformers` v4.2.0의 ONNX 런타임이 whisper-tiny의 **양자화(q8)/fp16 디코더**를 못 연다(모델 export 불호환). getTranscriber가 매번 reject → flush마다 throw → 라인 0.
- **검증**: 브라우저에서 실제 파이프라인에 합성 PCM을 먹여 dtype/모델별로 실측 — `Xenova/whisper-tiny` **q8·fp16 실패**, `onnx-community/whisper-base` **q8·fp16도 동일 실패**, **fp32만 세션 생성+한국어 출력 성공**.
- **수정**: `transcription.ts`에서 `pipeline(..., { dtype: 'fp32' })` 명시. 실제 앱 코드 경로(`getTranscriber`→`transcribePcm16k`)로 재검증 통과. tsc 0에러·build 통과.
- **트레이드오프**: fp32라 최초 다운로드 ~145MB(encoder 31MB+decoder 113MB, 이후 캐시). 이 transformers 버전에선 다국어(한국어) 되는 유일한 조합. 크기 줄이려면 추후 transformers/ORT 업그레이드 후 q8 재시도.
- **남은 확인**: 실제 마이크로 한국어 정확도(whisper-tiny 한계)·5초 윈도 지연은 실사용 확인 필요.
- **후속 수정(조용한 실패 노출)**: 모델 로드 실패를 삼키고 '청취 중'으로 진행하던 것 → 실패 시 status `'error'`+안내 메시지 노출하고 캡처 시작 안 함(`useTranscription`). rejected 싱글톤이 재시도를 영구 차단하던 것도 수정(`transcription.ts`, 실패 시 `transcriberPromise=null`). TranscriptPanel에 '전사 오류' 뱃지+메시지. → "청취 중인데 라인 0"이 이제 명확한 에러로 보임. (증상 신고자: 실제로는 옛 캐시 번들 로드 실패였을 가능성 → 강력 새로고침 필요)

### ⚠️ 아직 실브라우저 미검증(마이크 필요 등)
- **녹음→전사→라인클릭/획탭 싱크**: 실제 마이크 있는 브라우저에서 확인 필요(프리뷰 팬 마이크 차단).
- **PDF 올가미**: 엔진 공용이라 기본 선택은 될 것으로 보이나 이번에 미측정. PDF 올가미 **크기조절**은 PROGRESS상 원래 후속 과제.
- **고정 비율 페이지 리사이즈**: 창 리사이즈 시 찌그러짐 없는지 미확인.

### 바로 이어서 할 후보
- **실브라우저 검증(추천)**: 위 "검증 한계"의 미검증 항목들을 실제 화면에서 확인
- **P1 나머지**: PDF 페이지 썸네일 네비·북마크 / 확대해서 쓰기(zoom-write)
- **필기 마저**: PDF 올가미 크기조절, 앱 내 남은 옛 문구 통일(SettingsView 데모기능 등)
- **개인정보 1~3순위 실측**(국외이전 고지·동의 분리·만14세는 코드 반영됨, 상용화 시 변호사 검토)
- **Stripe 결제**(3단계, 수익화)
- **커스텀 도메인 / Google Drive 활성화(Client ID)**

---

## 📚 과거 세션 로그 / 아키텍처 / 파일 변경 내역

전부 [`PROGRESS-archive.md`](./PROGRESS-archive.md)로 이관됨. 목차:
- §1 프로젝트 개요 · §2 타겟 페르소나 · §3 하이브리드 동기화 아키텍처
- §4 UT 결함 수정 · §5 작업 현황(간극 5개) · §6 파일 변경 내역 · §7 실행 방법
- §8 실제 동기화 활성화 · §9 알려진 이슈 · §9-1 TASKS 2차 리팩토링 · §9-2 3차 개선
- §10 남은 작업 · §11 제품화 전환(인증·로드맵·커밋 로그·정직한 현재 상태)
- 이전 재개 지점(2026-07-10): 게스트 이관·tombstone·PDF/캡쳐 영속화·썸네일·타이핑 동기화
