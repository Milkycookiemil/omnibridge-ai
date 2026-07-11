# CLAUDE.md — 프로젝트 가이드

이 파일은 Claude Code가 이 프로젝트에서 작업할 때 자동으로 읽는 지침 파일이다.
프로젝트 루트에 `CLAUDE.md`라는 이름으로 두면 세션 시작 시 자동으로 컨텍스트에 로드된다.

---

## 1. 로컬 연결 (Claude Code 설치·실행)

### 설치

```bash
# npm으로 설치 (Node.js 18+ 필요)
npm install -g @anthropic-ai/claude-code

# 또는 데스크톱 앱 사용 (Mac/Windows 지원)
# https://claude.ai/download
```

### 실행

```bash
cd /path/to/project   # 프로젝트 폴더로 이동
claude                # 대화형 세션 시작
```

- 처음 실행하면 브라우저로 Anthropic 계정 로그인(OAuth)을 안내한다.
- `claude "질문"` — 일회성 질문 실행
- `claude -c` — 직전 세션 이어서 계속
- VS Code / JetBrains 확장으로 IDE 안에서도 사용 가능

### 로컬 환경 정보

- OS: Windows 11 (win32)
- 셸: PowerShell (기본) — POSIX 스크립트는 Bash 도구 사용
- 작업 디렉토리: `D:\claude code\omnibridge-ai` (프로젝트 루트 기준으로 실행할 것)

---

## 2. 필수 세팅

### 설정 파일 위치

| 파일 | 용도 |
|------|------|
| `~/.claude/CLAUDE.md` | 전역 지침 (모든 프로젝트 공통) |
| `<프로젝트>/CLAUDE.md` | 프로젝트별 지침 (이 파일) |
| `~/.claude/settings.json` | 전역 설정 (권한, 훅, 환경변수) |
| `<프로젝트>/.claude/settings.json` | 프로젝트 설정 (팀 공유, git 커밋) |
| `<프로젝트>/.claude/settings.local.json` | 개인 설정 (git 제외) |

### 권한(permissions) 예시 — `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run build)",
      "Bash(npm run dev:*)",
      "Bash(git status)",
      "Bash(git diff:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)"
    ]
  }
}
```

### 배포 규칙 (중요)

- **배포는 `git push origin master`로만 한다.** (이 저장소의 배포 브랜치는 `master`. GitHub Actions가 `master` push 시 GitHub Pages로 자동 배포)
- Netlify CLI, Vercel CLI 등으로 직접 배포하지 마.
- 배포·서버 구성은 기존 방식 그대로 유지하고 임의로 바꾸지 마.

---

## 3. 하네스(Harness) 기본 내용

하네스란 Claude가 실제로 동작하는 실행 환경(도구, 권한, 컨텍스트 관리)을 말한다.

### Claude가 쓰는 주요 도구

- **Read / Write / Edit** — 파일 읽기·생성·수정
- **Bash** — 셸 명령 실행 (권한 모드에 따라 승인 필요)
- **Glob / Grep** — 파일·코드 검색
- **Agent(서브에이전트)** — 큰 탐색·병렬 작업을 별도 에이전트에 위임
- **WebSearch / WebFetch** — 웹 검색·페이지 가져오기
- **Skill(슬래시 명령)** — `/init`, `/code-review`, `/simplify` 등

### 컨텍스트 로딩 순서

1. `~/.claude/CLAUDE.md` (전역 지침)
2. 프로젝트 루트의 `CLAUDE.md` (이 파일)
3. 메모리 인덱스 (`~/.claude/projects/.../memory/MEMORY.md`)

대화가 길어지면 자동으로 요약(compact)되어 다음 컨텍스트로 이어진다.

### 권한 모드

- 기본: 파일 수정·명령 실행 전 사용자 승인 요청
- `/permissions` 로 허용 목록 관리 (터미널 세션에서)
- 자주 쓰는 안전한 명령은 settings.json의 allow에 등록해 프롬프트 줄이기

### 훅(hooks) — 자동화

특정 이벤트(도구 실행 전/후, 세션 종료 등)에 셸 명령을 자동 실행하려면
settings.json에 hooks를 등록한다. "매번 X 할 때마다 Y 해줘" 같은 자동화는
기억이 아니라 훅으로만 보장된다.

---

## 4. 작업 원칙 (요약)

우선순위: **정확성 > 검증 > 최소 변경 > 명확성 > 유지보수성**

- 파일·API·스키마가 존재한다고 가정하지 말고 먼저 읽어서 확인해.
- 수정 전에 관련 파일을 읽고, 수정 후에는 테스트·실행으로 검증해.
- 요청된 작업에만 변경을 국한하고, 관련 없는 리팩토링은 하지 마.
- 가장 단순한 해결책을 선호하고, 불필요한 의존성·추상화를 추가하지 마.
- 기존 프로젝트의 관례와 스타일을 따라.
- 막히면 멈추고 무엇이 막혔는지, 무엇이 검증됐는지 명확히 보고해.
- 검증 없이 "성공했다"고 주장하지 마.

---

## 5. 프로젝트별 정보

- **프로젝트 이름:** OmniBridge AI — 태블릿 손필기 ↔ 노트북 타이핑을 0.1초로 잇는 멀티모달 학습 동기화 필기 앱 (한성대 졸업 과제)
- **기술 스택:** React 19 · Vite · Tailwind CSS v4 · Yjs(CRDT) · Supabase Realtime · Firebase(인증/Drive) · transformers.js(Whisper)
- **개발 서버 실행:** `npm run dev` (http://localhost:3000)
- **빌드:** `npm run build`
- **타입 체크:** `npx tsc --noEmit` (커밋 전 0에러 유지)
- **테스트:** 별도 테스트 러너 없음 — 타입체크 + 빌드 + 프리뷰 런타임 검증으로 확인
- **배포:** `git push origin master` (GitHub Actions → GitHub Pages 자동 배포)
- **주의사항:**
  - 동기화 아키텍처: CRDT 델타 → Supabase Realtime broadcast(실시간 릴레이, 0.1초) → Debounce 후 `.ob`로 Google Drive 영속 저장. 유실 0 무결성이 핵심 가치이므로 획 삭제조차 `erase_strokes` append-only 연산으로 CRDT에 쌓는 구조를 깨지 말 것.
  - Supabase 키가 없으면 **시뮬레이션 모드**로 정상 동작(발표·시연 가능). 실연동은 `.env.local`에 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 입력 시 활성화.
  - 드로잉은 공용 엔진(`inkEngine` + `InkCanvas` + `PenToolbar`)으로 통합됨 — 빈 노트·슬라이드·PDF가 동일 엔진 사용. 새 드로잉 화면도 자체 레거시 드로잉을 만들지 말고 공용 엔진을 재사용할 것.
  - 상세 작업 내역·아키텍처는 [`PROGRESS.md`](./PROGRESS.md) 참고.

---

## 6. 에이전트 팀 운영 규칙

이 프로젝트는 역할별 에이전트로 협업한다. 정의는 `.claude/agents/`에 있다.

- **바이브코딩** — 메인 코딩 에이전트(기본). 실제 구현·검증·수정을 담당한다.
- **SIM** (`.claude/agents/sim.md`) — 냉정한 QA 비평가.
  - **매 응답 끝에** 직전 작업/주장에 오류·리스크가 없는지 점검한 결과를 반드시 덧붙인다.
  - 형식: 문제가 있으면 심각도 순 목록, 없으면 정확히 한 줄 `SIM: 오류 사항 없음.`
  - 코드가 바뀐 무거운 턴은 SIM 서브에이전트를 실제로 띄워 독립 검증할 수 있다. 가벼운 턴은 SIM 관점으로 인라인 점검한다.
- **UX/UI 디자이너** (`.claude/agents/ux-ui-designer.md`) — 사용자가 UX/UI를 물으면 이 에이전트(페르소나)로 답한다.
- **AI 사업화** (`.claude/agents/ai-business.md`) — 사용자가 수익화/사업을 물으면 이 에이전트(페르소나)로 답한다.
- **AI 전문가** (`.claude/agents/ai-expert.md`) — 사용자가 AI 활용법·워크플로우 효율·에이전트/스킬/훅/컨텍스트 관리를 물으면 이 에이전트(페르소나)로 답한다.
- **필기앱 전문가** (`.claude/agents/note-app-expert.md`) — 전문가 3인 패널(🧭 기획 팀장 · ⚙️ 프로그래밍 PM · 🎓 파워유저 대학생). 사용자가 필기앱의 기능 기획·시장 전략·기술 실현성·UI/UX·사용성을 물으면 이 에이전트(페르소나)로 답한다.

### 응답 말미 고정 형식 (매 응답)
매 응답은 아래 두 줄로 끝낸다:
1. **SIM** 점검 (오류 있으면 목록, 없으면 `SIM: 오류 사항 없음.`)
2. 그 아래 **에이전트 명단**을 한 줄에 하나씩(구분되게) 나열한다:
   - 🧩 바이브코딩 (메인 코딩)
   - 🔎 SIM (냉정한 QA)
   - 🎨 UX/UI 디자이너
   - 💰 AI 사업화
   - 🧠 AI 전문가
   - 📝 필기앱 전문가 (기획 팀장·프로그래밍 PM·파워유저 3인 패널)
   - 사용자가 자꾸 잊으므로 매번 상기시킨다. 새 에이전트를 만들면 이 명단에 추가한다.

> 참고: `.claude/agents/*.md`는 세션 시작 시 로드된다. 새로 추가한 세션에서는 Agent 도구로 띄우려면 재시작이 필요할 수 있으나, 페르소나 규칙(위)은 바이브코딩이 인라인으로 즉시 준수한다.
