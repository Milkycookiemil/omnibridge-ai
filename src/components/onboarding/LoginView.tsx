import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Cloud, Zap, Loader2 } from 'lucide-react';
import { googleSignIn } from '../../lib/auth';

interface LoginViewProps {
  onAuthenticated: () => void;
}

// Inline Google "G" mark so login button reads as an official 1-Tap entry point.
function GoogleMark() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

const TRUST_SIGNALS = [
  { icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-50', title: '필기 유실 제로', desc: '0.1초 무결성 동기화로 기기를 바꿔도 한 획도 잃지 않습니다.' },
  { icon: Cloud, color: 'text-blue-500', bg: 'bg-blue-50', title: '구독료 $0', desc: '내 구글 드라이브에 저장하는 BYOS 방식. 월 정액 결제가 없습니다.' },
  { icon: Zap, color: 'text-violet-500', bg: 'bg-violet-50', title: '온디바이스 AI', desc: 'NPU 기반 실시간 요약. 녹음은 내 기기 안에서만 처리됩니다.' },
];

export function LoginView({ onAuthenticated }: LoginViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await googleSignIn();
      if (result?.accessToken) {
        onAuthenticated();
      } else {
        setError('로그인 정보를 가져오지 못했습니다. 다시 시도해주세요.');
      }
    } catch (e: any) {
      // popup-closed-by-user 등은 조용히 무시, 그 외엔 안내
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
        setError('로그인에 실패했습니다. 게스트로 둘러보기를 이용해보세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-[#F4F5F7] text-slate-800 overflow-hidden">
      {/* Left: Brand & Persona Trust Panel */}
      <div className="relative hidden md:flex flex-col justify-between flex-[1.1] p-12 overflow-hidden bg-gradient-to-br from-[#0B1020] via-[#121A2E] to-[#1e293b] text-white">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-2 font-bold text-xl tracking-tight">
          <span className="text-cyan-400 text-2xl">✦</span> OmniBridge AI
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight mb-3">
              태블릿의 손필기와<br />노트북의 타이핑을<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">0.1초</span>로 잇다
            </h1>
            <p className="text-slate-300 text-base font-medium leading-relaxed">
              기기 생태계의 장벽을 넘는 멀티모달 학습 자산화 플랫폼
            </p>
          </div>

          <div className="space-y-4">
            {TRUST_SIGNALS.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.12 }}
                className="flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center shrink-0 border border-white/10">
                  <s.icon className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <div className="font-bold text-sm text-white">{s.title}</div>
                  <div className="text-xs text-slate-400">{s.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-500">
          한성대학교 멀티모달 AI 콘텐츠 기획 제작 실습 · 졸업 프로젝트
        </div>
      </div>

      {/* Right: Auth Actions */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="md:hidden flex items-center gap-2 font-bold text-lg tracking-tight mb-8 text-slate-800">
            <span className="text-blue-500 text-xl">✦</span> OmniBridge AI
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">시작하기</h2>
          <p className="text-slate-500 text-sm font-medium mb-8">
            복잡한 회원가입 없이, 구글 계정으로 1초 만에 시작하세요.
          </p>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleMark />}
            {loading ? '연결 중...' : 'Google 계정으로 1-Tap 시작'}
          </button>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 text-xs text-rose-500 font-medium text-center"
            >
              {error}
            </motion.p>
          )}

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium">또는</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <button
            onClick={onAuthenticated}
            className="w-full py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 text-sm transition-colors"
          >
            게스트로 둘러보기
          </button>

          <p className="mt-8 text-center text-xs text-slate-400 leading-relaxed">
            계속 진행하면 서비스 약관 및 개인정보 처리방침에 동의하게 됩니다.<br />
            필기 데이터는 사용자 본인의 Google Drive에만 저장됩니다.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
