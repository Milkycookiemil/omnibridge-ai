# OmniBridge AI ✦

> 태블릿의 손필기와 노트북의 타이핑을 **0.1초**로 잇는 멀티모달 학습 동기화 필기 앱
>
> 한성대학교 · 멀티모달 AI 콘텐츠 기획 제작 실습[A] 졸업 프로젝트

하드웨어 생태계의 장벽을 넘어, 어떤 기기를 교차 사용하더라도 데이터 유실 없이 잉크 스트로크와 오디오가 실시간 병합되는 학습 자산화 솔루션입니다.

---

## 주요 기능

- **✍️ 전문가급 필기** — 펜 5종(볼펜·연필·브러쉬·형광펜·지우개), 필압 감지(S펜/애플펜슬), 256색 팔레트, **포토샵식 레이어**, 영역/획 지우개
- **🔄 실시간 미러링 동기화** — 태블릿에서 필기하면 노트북에 거의 즉시 반영 (Supabase Realtime + Yjs CRDT). 기기를 바꿔도 한 획도 잃지 않는 무결성 경험
- **🎙️ 온디바이스 AI 전사** — 강의 녹음을 브라우저 내 Whisper(transformers.js)로 실시간 전사 (키 불필요·프라이버시)
- **📄 PDF · 슬라이드 필기** — PDF 위에 바로 필기, 강의 판서 캡쳐 후 주석
- **☁️ BYOS 인프라** — 구독료 $0. 사용자 본인의 Google Drive에 `.ob` 자산으로 영속 저장

## 타겟 페르소나

- **김지원** (CPA 수험생) — 데이터 유실 제로 + 동기화 증거를 원하는 완벽주의 사용자
- **박철수** (가성비 대학생) — 유료 구독 없이 1-Tap 로그인으로 바로 쓰고 싶은 실속형 사용자

## 기술 스택

React 19 · Vite · Tailwind CSS v4 · Yjs(CRDT) · Supabase Realtime · Firebase(인증/Drive) · transformers.js(Whisper)

---

## 실행 방법

**필요 환경:** Node.js 20+

```bash
npm install
npm run dev        # http://localhost:3000
```

키 설정 없이 **시뮬레이션 모드**로 모든 화면이 작동합니다. (게스트로 둘러보기)

### (선택) 실시간 멀티기기 동기화 켜기

`.env.local` 파일을 만들고 [Supabase](https://supabase.com) 무료 프로젝트 키를 입력하면 실제 기기 간 실시간 동기화가 활성화됩니다.

```
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="<anon-public-key>"
```

> DB 스키마 설정은 필요 없습니다 (Realtime broadcast 사용).

---

작업 내역·아키텍처 상세는 [`PROGRESS.md`](./PROGRESS.md) 참고.
