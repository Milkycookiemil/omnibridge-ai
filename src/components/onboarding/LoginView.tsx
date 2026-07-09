import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Cloud, Zap, Loader2, Mail, Lock } from 'lucide-react';
import { emailSignIn, emailSignUp, authErrorMessage } from '../../lib/auth';

interface LoginViewProps {
  // 게스트로 둘러보기 (실계정 없이 진입). 실계정 로그인/회원가입 성공은
  // App의 인증 리스너가 자동으로 화면을 전환한다.
  onGuest: () => void;
}

const TRUST_SIGNALS = [
  { icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-50', title: '필기 유실 제로', desc: '0.1초 무결성 동기화로 기기를 바꿔도 한 획도 잃지 않습니다.' },
  { icon: Cloud, color: 'text-blue-500', bg: 'bg-blue-50', title: '구독료 $0', desc: '내 구글 드라이브에 저장하는 BYOS 방식. 월 정액 결제가 없습니다.' },
  { icon: Zap, color: 'text-violet-500', bg: 'bg-violet-50', title: '온디바이스 AI', desc: 'NPU 기반 실시간 요약. 녹음은 내 기기 안에서만 처리됩니다.' },
];

type Mode = 'login' | 'signup';

export function LoginView({ onGuest }: LoginViewProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) return setError('이메일을 입력해 주세요.');
    if (password.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.');

    setLoading(true);
    try {
      // 성공 시 App의 onAuthStateChanged가 온보딩/앱으로 자동 전환한다.
      if (mode === 'signup') {
        await emailSignUp(email, password);
      } else {
        await emailSignIn(email, password);
      }
    } catch (err: any) {
      setError(authErrorMessage(err));
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setError(null);
    setMode((m) => (m === 'login' ? 'signup' : 'login'));
  };

  const busy = loading;

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
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm py-8"
        >
          <div className="md:hidden flex items-center gap-2 font-bold text-lg tracking-tight mb-8 text-slate-800">
            <span className="text-blue-500 text-xl">✦</span> OmniBridge AI
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
            {mode === 'login' ? '로그인' : '회원가입'}
          </h2>
          <p className="text-slate-500 text-sm font-medium mb-6">
            {mode === 'login'
              ? '이메일로 로그인하세요.'
              : '이메일로 새 계정을 만들어 시작하세요.'}
          </p>

          {/* 이메일 / 비밀번호 폼 */}
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일"
                autoComplete="email"
                disabled={busy}
                className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition disabled:opacity-60"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 (6자 이상)"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                disabled={busy}
                className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold shadow-lg shadow-blue-500/20 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
            </button>
          </form>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 text-xs text-rose-500 font-medium text-center"
            >
              {error}
            </motion.p>
          )}

          {/* 로그인 ↔ 회원가입 전환 */}
          <p className="mt-4 text-center text-sm text-slate-500">
            {mode === 'login' ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'}{' '}
            <button
              type="button"
              onClick={toggleMode}
              disabled={busy}
              className="font-bold text-blue-600 hover:text-blue-700 disabled:opacity-60"
            >
              {mode === 'login' ? '회원가입' : '로그인'}
            </button>
          </p>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium">또는</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <button
            onClick={onGuest}
            disabled={busy}
            className="w-full py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 text-sm transition-colors disabled:opacity-60"
          >
            게스트로 둘러보기
          </button>

          <p className="mt-8 text-center text-xs text-slate-400 leading-relaxed">
            계속 진행하면 서비스 약관 및 개인정보 처리방침에 동의하게 됩니다.<br />
            필기 데이터는 안전하게 클라우드에 동기화됩니다.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
