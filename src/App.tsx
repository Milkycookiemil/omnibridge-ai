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
import { ReplayView } from './components/ReplayView';
import { SearchView } from './components/SearchView';
import { SettingsView } from './components/SettingsView';
import { AnimatePresence, motion } from 'motion/react';

import { initAuth } from './lib/auth';
import { LoginView } from './components/onboarding/LoginView';
import { OnboardingPermissions } from './components/onboarding/OnboardingPermissions';

type FlowStage = 'login' | 'onboarding' | 'app';

export default function App() {
  const [stage, setStage] = useState<FlowStage>('login');
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [navContext, setNavContext] = useState<any>(undefined);

  React.useEffect(() => {
    const unsubscribe = initAuth();
    return () => unsubscribe();
  }, []);

  const handleNavigate = (view: ViewState, context?: any) => {
    setCurrentView(view);
    setNavContext(context);
  };

  // 첫 진입 플로우: 1-Tap 로그인 → 권한 사전 안내 온보딩 → 본 앱
  if (stage === 'login') {
    return <LoginView onAuthenticated={() => setStage('onboarding')} />;
  }
  if (stage === 'onboarding') {
    return <OnboardingPermissions onComplete={() => setStage('app')} />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#F4F5F7] text-slate-800 font-sans overflow-hidden">
      <TopBar />
      
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
                <LiveNoteView navContext={navContext} />
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
                <SettingsView />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
