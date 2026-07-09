// src/components/LegalView.tsx
// 이용약관 / 개인정보처리방침 페이지 (로드맵 2단계 — 공개 런칭 법적 필수).
// 로그인 화면 푸터·설정(권한 & 정보)에서 진입. 앱 실제 동작에 맞춰 정직하게 작성:
//  - 계정: Supabase Auth(이메일). 노트: Supabase notes 테이블 + 로컬 IndexedDB 캐시.
//  - 음성 전사: 온디바이스(브라우저 내 Whisper) — 외부 전송 없음.
//  - AI 요약: 사용자가 본인 키를 입력한 경우에만 전사 텍스트를 Anthropic으로 전송(BYOK).
// ※ 실제 상용화 시 법률 검토 권장. 문구는 합리적 초안.
import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';

export type LegalDoc = 'terms' | 'privacy';

interface LegalViewProps {
  doc: LegalDoc;
  onBack: () => void;
  onSwitch: (doc: LegalDoc) => void;
}

const EFFECTIVE_DATE = '2026년 7월 9일';
const CONTACT_EMAIL = 'milkychrischris@gmail.com';
const SERVICE_NAME = 'OmniBridge AI';

export function LegalView({ doc, onBack, onSwitch }: LegalViewProps) {
  return (
    <div className="h-screen w-full bg-[#F4F5F7] text-slate-800 flex flex-col overflow-hidden">
      {/* 상단 바 */}
      <div className="shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
            title="돌아가기"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <span className="text-blue-500">✦</span> {SERVICE_NAME}
          </span>
          <div className="ml-auto flex items-center bg-slate-100 rounded-lg p-1 text-sm font-bold">
            <button
              onClick={() => onSwitch('terms')}
              className={`px-3 py-1 rounded-md transition-colors ${doc === 'terms' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              이용약관
            </button>
            <button
              onClick={() => onSwitch('privacy')}
              className={`px-3 py-1 rounded-md transition-colors ${doc === 'privacy' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              개인정보처리방침
            </button>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key={doc}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto px-5 py-10 pb-24"
        >
          {doc === 'terms' ? <Terms /> : <Privacy />}
        </motion.div>
      </div>
    </div>
  );
}

// 공통 문단 스타일
const H1: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1.5">{children}</h1>
);
const Meta: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-slate-400 mb-8">{children}</p>
);
const H2: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <h2 className="text-base font-bold text-slate-900 mt-8 mb-2">
    제{n}조 · {children}
  </h2>
);
const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm leading-relaxed text-slate-600 mb-2">{children}</p>
);
const LI: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="text-sm leading-relaxed text-slate-600">{children}</li>
);

function Terms() {
  return (
    <>
      <H1>이용약관</H1>
      <Meta>시행일: {EFFECTIVE_DATE}</Meta>

      <H2 n={1}>목적</H2>
      <P>
        본 약관은 {SERVICE_NAME}(이하 "서비스")가 제공하는 멀티모달 필기·학습 동기화 서비스의
        이용 조건과 절차, 이용자와 서비스의 권리·의무 및 책임사항을 규정합니다.
      </P>

      <H2 n={2}>서비스 내용</H2>
      <P>
        서비스는 손필기·타이핑 노트의 작성과 저장, 기기 간 동기화, 온디바이스 음성 전사,
        선택적 AI 요약 기능을 제공합니다. 서비스의 구체적 기능은 개선을 위해 변경될 수 있습니다.
      </P>

      <H2 n={3}>계정</H2>
      <ul className="list-disc pl-5 space-y-1 mb-2">
        <LI>이용자는 이메일과 비밀번호로 계정을 생성하며, 계정 정보의 관리 책임은 이용자에게 있습니다.</LI>
        <LI>게스트 모드로도 이용할 수 있으나, 이 경우 노트는 해당 브라우저에만 저장되고 계정 간 동기화되지 않습니다.</LI>
      </ul>

      <H2 n={4}>콘텐츠의 소유권</H2>
      <P>
        이용자가 작성한 노트·필기·녹음 등 모든 콘텐츠의 소유권은 이용자에게 있습니다. 서비스는
        동기화·저장·요약 등 기능 제공에 필요한 범위에서만 콘텐츠를 처리하며, 이를 제3자에게
        판매하거나 광고 목적으로 이용하지 않습니다. 이용자는 언제든 노트를 `.ob` 파일로 내보내
        데이터를 이전할 수 있습니다.
      </P>

      <H2 n={5}>유료 서비스</H2>
      <P>
        일부 부가기능은 유료(Pro) 플랜으로 제공될 수 있습니다. 요금·결제·해지 조건은 결제 시점에
        별도로 고지되며, 결제 수단 연동 전까지는 무료 범위에서 모든 핵심 기능을 이용할 수 있습니다.
      </P>

      <H2 n={6}>이용자의 의무</H2>
      <P>
        이용자는 관련 법령과 본 약관을 준수해야 하며, 타인의 권리를 침해하거나 서비스의 정상적
        운영을 방해하는 행위를 해서는 안 됩니다.
      </P>

      <H2 n={7}>면책</H2>
      <P>
        서비스는 데이터 유실 방지를 위해 최선을 다하나, 천재지변·이용자 기기 문제·제3자 서비스
        (클라우드 저장소 등) 장애 등 서비스의 합리적 통제를 벗어난 사유로 발생한 손해에 대해서는
        관련 법령이 허용하는 범위에서 책임이 제한됩니다.
      </P>

      <H2 n={8}>약관의 변경</H2>
      <P>
        서비스는 필요 시 본 약관을 개정할 수 있으며, 변경 시 시행일과 변경 내용을 서비스 내에
        공지합니다. 변경 후에도 서비스를 계속 이용하면 개정 약관에 동의한 것으로 봅니다.
      </P>

      <H2 n={9}>문의</H2>
      <P>
        약관에 관한 문의는 <a className="text-blue-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> 으로 연락해 주세요.
      </P>
    </>
  );
}

function Privacy() {
  return (
    <>
      <H1>개인정보처리방침</H1>
      <Meta>시행일: {EFFECTIVE_DATE}</Meta>

      <P>
        {SERVICE_NAME}(이하 "서비스")는 이용자의 개인정보를 중요하게 여기며, 다음과 같이 수집·이용·보관합니다.
      </P>

      <H2 n={1}>수집하는 항목</H2>
      <ul className="list-disc pl-5 space-y-1 mb-2">
        <LI><b>계정 정보</b>: 이메일 주소, 비밀번호(암호화되어 인증 제공자에 저장).</LI>
        <LI><b>이용자 콘텐츠</b>: 노트 제목·손필기 획 데이터·미리보기 썸네일 등 이용자가 작성한 내용.</LI>
        <LI><b>음성·전사</b>: 녹음 및 음성 전사는 이용자 기기(브라우저) 내에서 처리되며, 서버로 전송·저장되지 않습니다.</LI>
      </ul>

      <H2 n={2}>이용 목적</H2>
      <P>
        수집한 정보는 계정 인증, 노트의 저장과 기기 간 동기화, 서비스 제공·유지·개선 목적으로만
        이용합니다. 광고 노출이나 개인정보 판매를 위해 이용하지 않습니다.
      </P>

      <H2 n={3}>저장 위치 및 처리 위탁</H2>
      <ul className="list-disc pl-5 space-y-1 mb-2">
        <LI>
          <b>Supabase</b>: 계정 인증과 노트 데이터의 클라우드 저장을 위해 Supabase(호스팅형 데이터베이스)를
          이용합니다. 노트는 행 수준 보안(RLS)으로 계정별로 격리되어 본인만 접근할 수 있습니다.
        </LI>
        <LI>
          <b>로컬 저장소</b>: 오프라인 이용과 빠른 응답을 위해 노트가 이용자 브라우저(IndexedDB)에도
          캐시됩니다.
        </LI>
        <LI>
          <b>Anthropic (AI 요약, 선택)</b>: 이용자가 설정에서 <i>본인의 API 키</i>를 입력해 AI 요약을 켠 경우에
          한해, 요약을 위해 전사 텍스트가 Anthropic의 Claude API로 전송됩니다. 키를 입력하지 않으면
          어떤 텍스트도 전송되지 않습니다. 키는 이용자 브라우저에만 저장됩니다.
        </LI>
      </ul>

      <H2 n={4}>보관 및 파기</H2>
      <P>
        개인정보와 콘텐츠는 계정이 유지되는 동안 보관되며, 이용자가 노트를 삭제하면 클라우드와
        로컬에서 함께 삭제됩니다. 계정 및 전체 데이터의 삭제를 원하시면 아래 문의처로 요청해 주세요.
      </P>

      <H2 n={5}>이용자의 권리</H2>
      <P>
        이용자는 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있으며, 노트를 `.ob`
        파일로 직접 내보내 언제든 데이터를 이전할 수 있습니다.
      </P>

      <H2 n={6}>쿠키 및 로컬 저장소</H2>
      <P>
        서비스는 로그인 상태 유지와 이용자 설정(알림·전사 패널·AI 키 등) 저장을 위해 브라우저의
        로컬 저장소를 사용합니다. 광고·추적 목적의 제3자 쿠키는 사용하지 않습니다.
      </P>

      <H2 n={7}>문의처</H2>
      <P>
        개인정보 관련 문의·요청은 <a className="text-blue-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> 으로 연락해 주세요.
      </P>

      <H2 n={8}>개정</H2>
      <P>
        본 방침은 법령이나 서비스 변경에 따라 개정될 수 있으며, 변경 시 시행일과 내용을 서비스 내에
        공지합니다.
      </P>
    </>
  );
}
