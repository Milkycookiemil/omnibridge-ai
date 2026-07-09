/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { ViewState } from './types';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { LiveNoteView } from './components/LiveNoteView';
import { WorkspaceView } from './components/WorkspaceView';
import { useWorkspace } from './lib/workspace';
import { ReplayView } from './components/ReplayView';
import { SearchView } from './components/SearchView';
import { SettingsView } from './components/SettingsView';
import { AnimatePresence, motion } from 'motion/react';

import { initAuth, logout } from './lib/auth';
import { LoginView } from './components/onboarding/LoginView';
import { OnboardingPermissions } from './components/onboarding/OnboardingPermissions';

type FlowStage = 'loading' | 'login' | 'onboarding' | 'app';

// localStorage 키: 온보딩 1회 완료 여부 / 게스트 진입 여부(자동 로그인 유지용)
const ONBOARDING_DONE_KEY = 'ob_onboarding_done';
const GUEST_KEY = 'ob_guest';

const isOnboardingDone = () => localStorage.getItem(ONBOARDING_DONE_KEY) === '1';

export default function App() {
  // 인증 상태가 확정될 때까지 'loading'으로 시작 → 깜빡임 없이 자동 로그인 판단
  const [stage, setStage] = useState<FlowStage>('loading');
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [navContext, setNavContext] = useState<any>(undefined);

  React.useEffect(() => {
    let resolved = false;

    // 사용자 없음(또는 인증 확정 지연 시 폴백): 게스트면 유지, 아니면 로그인 화면
    const resolveSignedOut = () => {
      if (resolved) return;
      resolved = true;
      if (localStorage.getItem(GUEST_KEY) === '1') {
        setStage(isOnboardingDone() ? 'app' : 'onboarding');
      } else {
        setStage('login');
      }
    };

    const unsubscribe = initAuth(
      // 로그인된 사용자 존재(구글/이메일): 게스트 흔적 제거 후 온보딩(최초 1회) 또는 앱으로
      () => {
        resolved = true;
        localStorage.removeItem(GUEST_KEY);
        setStage(isOnboardingDone() ? 'app' : 'onboarding');
      },
      resolveSignedOut
    );

    // 리다이렉트 결과 처리 등으로 인증 확정이 지연·중단돼도 UI가 무한 스플래시에
    // 갇히지 않도록 안전장치. 실제 사용자가 뒤늦게 확정되면 onAuthSuccess가 덮어쓴다.
    const fallback = setTimeout(resolveSignedOut, 2000);

    return () => {
      clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  const handleNavigate = (view: ViewState, context?: any) => {
    // 저장된 노트(noteId)를 열면 작업공간 탭으로 추가. (빠른녹음/PDF/캡쳐 등 임시 흐름은 제외)
    if (view === 'live_note' && context?.noteId) {
      useWorkspace.getState().openNote({
        id: context.noteId,
        style: context.style ?? 'blank',
        title: context.title ?? '노트',
      });
    }
    setCurrentView(view);
    setNavContext(context);
  };

  // 게스트로 둘러보기: 플래그 저장 후 진입 (다음 방문에도 유지)
  const handleGuest = () => {
    localStorage.setItem(GUEST_KEY, '1');
    setStage(isOnboardingDone() ? 'app' : 'onboarding');
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    setStage('app');
  };

  // 로그아웃: 게스트 흔적 제거 + Supabase 세션 종료 → 로그인 화면으로.
  const handleLogout = async () => {
    localStorage.removeItem(GUEST_KEY);
    try {
      await logout();
    } catch (e) {
      console.warn('logout 실패:', e);
    }
    setStage('login');
  };

  // 인증 상태 확정 전 스플래시
  if (stage === 'loading') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-[#0B1020] text-white">
        <div className="flex items-center gap-2 font-bold text-2xl tracking-tight">
          <span className="text-cyan-400 text-3xl">✦</span> OmniBridge AI
        </div>
        <div className="w-6 h-6 border-2 border-white/20 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  // 첫 진입 플로우: 로그인 → 권한 사전 안내 온보딩 → 본 앱
  if (stage === 'login') {
    return <LoginView onGuest={handleGuest} />;
  }
  if (stage === 'onboarding') {
    return <OnboardingPermissions onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#F4F5F7] text-slate-800 font-sans overflow-hidden">
      <TopBar onNavigate={handleNavigate} onLogout={handleLogout} />

      <div className="flex flex-1 overflow-hidden">
        <BottomNav currentView={currentView} onViewChange={handleNavigate} />
        
        <main className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {currentView === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto w-full">
                <DashboardView onNavigate={handleNavigate} />
              </motion.div>
            )}
            {currentView === 'live_note' && (
              <motion.div key="live_note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-hidden w-full">
                {navContext?.noteId ? (
                  <WorkspaceView onEmpty={() => handleNavigate('dashboard')} onNavigate={handleNavigate} />
                ) : (
                  <LiveNoteView navContext={navContext} />
                )}
              </motion.div>
            )}
            {currentView === 'replay' && (
              <motion.div key="replay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-hidden w-full">
                <ReplayView initialInkGroupId={navContext?.inkGroup} onNavigate={handleNavigate} />
              </motion.div>
            )}
            {currentView === 'search' && (
              <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto w-full">
                <SearchView onNavigate={handleNavigate} />
              </motion.div>
            )}
            {currentView === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-hidden w-full">
                <SettingsView onLogout={handleLogout} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
