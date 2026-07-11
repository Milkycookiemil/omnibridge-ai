import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Cloud, Bell, FolderOpen, ShieldCheck, ChevronRight, Check, Loader2 } from 'lucide-react';

interface OnboardingPermissionsProps {
  onComplete: () => void;
}

// 가입 직후 6개 권한 팝업이 연속으로 뜨는 '공포 허들'을 제거하기 위한
// 사전 안내(Contextual Help) 화면. 각 권한이 왜 필수인지 먼저 소명한다. (Nielsen Heuristic #10)
const PERMISSIONS = [
  {
    icon: Mic,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    title: '마이크',
    reason: '강의 음성을 녹음해 필기 획과 타임스탬프를 병합합니다.',
    note: '음성 전사는 기기 안에서만 처리되며 외부 서버로 전송되지 않습니다.',
    essential: true,
  },
  {
    icon: Cloud,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    title: '클라우드 동기화',
    reason: '필기와 노트를 안전한 클라우드에 저장해 모든 기기에서 이어서 봅니다.',
    note: '계정에 안전하게 저장되며, 언제든 파일(.ob)로 내보내 백업할 수 있습니다.',
    essential: true,
  },
  {
    icon: FolderOpen,
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    title: '저장소 / 미디어',
    reason: '오프라인 시 필기 획을 로컬 큐에 안전하게 격리 보관합니다.',
    note: '네트워크 복귀 시 충돌 없이 자동 병합됩니다.',
    essential: false,
  },
  {
    icon: Bell,
    color: 'text-violet-500',
    bg: 'bg-violet-50',
    title: '알림',
    reason: 'AI가 감지한 일정·복습 권장 구간을 비침습적으로 알려줍니다.',
    note: '언제든 설정에서 완전히 끌 수 있습니다.',
    essential: false,
  },
];

export function OnboardingPermissions({ onComplete }: OnboardingPermissionsProps) {
  const [requesting, setRequesting] = useState(false);

  const handleAllow = async () => {
    setRequesting(true);
    try {
      // 브라우저에서 실제로 요청 가능한 마이크 권한만 시연. 나머지는 안내 후 진입.
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      // 거부해도 앱 진입은 막지 않는다 (사용자 통제권 보장)
      console.warn('마이크 권한 거부됨 — 오프라인 필기 모드로 진입', e);
    } finally {
      setRequesting(false);
      onComplete();
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#F4F5F7] text-slate-800 p-6 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-[#0B1020] to-[#1e293b] text-white p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur border border-white/15 flex items-center justify-center mx-auto mb-4 relative z-10"
          >
            <ShieldCheck className="w-8 h-8 text-cyan-300" />
          </motion.div>
          <h1 className="text-xl font-bold tracking-tight relative z-10">시작하기 전에, 딱 4가지만 안내할게요</h1>
          <p className="text-sm text-slate-300 mt-2 relative z-10 font-medium">
            각 권한이 왜 필요한지 먼저 알려드립니다. 갑작스러운 팝업은 없어요.
          </p>
        </div>

        {/* Permission list */}
        <div className="p-6 space-y-3">
          {PERMISSIONS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="flex gap-4 items-start p-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <div className={`w-11 h-11 rounded-xl ${p.bg} flex items-center justify-center shrink-0`}>
                <p.icon className={`w-5 h-5 ${p.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <h4 className="font-bold text-slate-800 text-sm">{p.title}</h4>
                  {p.essential ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">필수</span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">선택</span>
                  )}
                </div>
                <p className="text-sm text-slate-600 font-medium leading-snug">{p.reason}</p>
                <p className="text-xs text-slate-400 mt-1 leading-snug">{p.note}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-6 pt-2 space-y-3">
          <button
            onClick={handleAllow}
            disabled={requesting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-sync text-white font-bold shadow-lg shadow-blue-500/20 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {requesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            {requesting ? '권한 확인 중...' : '확인했어요, 시작하기'}
            {!requesting && <ChevronRight className="w-4 h-4" />}
          </button>
          <button
            onClick={onComplete}
            className="w-full py-3 rounded-xl text-slate-500 font-bold text-sm hover:bg-slate-100 transition-colors"
          >
            나중에 설정하기
          </button>
        </div>
      </motion.div>
    </div>
  );
}
