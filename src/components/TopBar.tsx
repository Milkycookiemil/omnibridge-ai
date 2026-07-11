import React, { useState } from 'react';
import { dummyData } from '../data';
import { Wifi, WifiOff, Cloud, CloudOff, RefreshCw, Tablet, Laptop, LogOut, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSyncEngine } from '../lib/syncEngine';
import { useDeviceMode } from '../lib/deviceMode';
import { getCurrentUser } from '../lib/auth';
import { ViewState } from '../types';

interface TopBarProps {
  onNavigate: (view: ViewState, context?: any) => void;
  onLogout: () => void;
}

export function TopBar({ onNavigate, onLogout }: TopBarProps) {
  const { isOnline, relayStatus, driveStatus, lastDriveSync, setOnline, liveConnected, peerCount } = useSyncEngine();
  const { deviceMode, setDeviceMode } = useDeviceMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const email = getCurrentUser()?.email ?? null;

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white/80 border-b border-slate-200 backdrop-blur-xl z-20 shrink-0 shadow-sm relative">
      <div className="flex items-center gap-6">
        {/* Brand */}
        <div className="font-bold text-lg tracking-tight text-slate-800 flex items-center gap-2">
          <span className="text-blue-500">✦</span>
          OmniBridge
        </div>

        <div className="h-4 w-[1px] bg-slate-200"></div>

        {/* Omni-Live Connection & Sync State */}
        <div className="flex items-center gap-4 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
          {!isOnline ? (
             <div className="flex items-center gap-2">
               <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse"></div>
               <span className="text-xs font-semibold tracking-wider uppercase text-slate-600">오프라인 모드 - 필기 로컬 안전 보관</span>
             </div>
          ) : (
             <>
                <div className="flex items-center gap-2">
                  <div className={cn("w-2.5 h-2.5 rounded-full", relayStatus === 'syncing' ? "bg-amber-400" : "bg-emerald-400 animate-pulse")}></div>
                  <span className="text-xs font-semibold tracking-wider text-slate-700">Omni-Live</span>
                  {liveConnected && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100" title="실시간 연결된 기기 수">
                      {peerCount}대 연결
                    </span>
                  )}
                </div>
                
                <div className="h-3 w-[1px] bg-slate-300"></div>

                <div className="flex items-center gap-2 text-xs font-bold font-mono">
                  {relayStatus === 'syncing' ? (
                     <span className="text-amber-500 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin"/> 실시간 연동 중</span>
                  ) : (
                     <span className="text-emerald-500">0.1초 무결성 동기화 완료</span>
                  )}
                </div>

                <div className="h-3 w-[1px] bg-slate-300"></div>
                
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                   {driveStatus === 'saving' && <span className="text-amber-500 flex items-center gap-1"><Cloud className="w-3 h-3 animate-pulse"/> 저장 중...</span>}
                   {driveStatus === 'saved' && <span className="text-slate-600 flex items-center gap-1"><Cloud className="w-3 h-3"/> 마지막 동기화: 방금 전</span>}
                   {driveStatus === 'idle' && lastDriveSync && <span className="text-slate-600 flex items-center gap-1"><Cloud className="w-3 h-3"/> 마지막 동기화: {lastDriveSync}</span>}
                   {driveStatus === 'idle' && !lastDriveSync && <span className="text-slate-400 flex items-center gap-1"><Cloud className="w-3 h-3"/> 동기화 대기 중</span>}
                </div>
             </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Device Mode Switcher — 이기종 크로스 시뮬레이션 (태블릿 ↔ 노트북) */}
        <div className="flex items-center bg-slate-100 p-1 rounded-full border border-slate-200 shrink-0" title="기기 모드 전환">
          <button
            onClick={() => setDeviceMode('tablet')}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap shrink-0",
              deviceMode === 'tablet' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600")}
          >
            <Tablet className="w-3.5 h-3.5 shrink-0" /> 태블릿
          </button>
          <button
            onClick={() => setDeviceMode('laptop')}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap shrink-0",
              deviceMode === 'laptop' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600")}
          >
            <Laptop className="w-3.5 h-3.5 shrink-0" /> 노트북
          </button>
        </div>

        {/* Network Toggle Button */}
        <button
           onClick={() => setOnline(!isOnline)}
           className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5", 
              isOnline ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-amber-100 text-amber-700 hover:bg-amber-200"
           )}
        >
           {isOnline ? <Wifi className="w-4 h-4"/> : <WifiOff className="w-4 h-4"/>}
           {isOnline ? "Online" : "Offline Test"}
        </button>

        {/* 사용자 프로필 드롭다운 (이메일 · 설정 · 로그아웃) */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-400 border border-black/5 shadow-sm hover:ring-2 hover:ring-blue-200 transition"
            title="계정"
          />
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="text-[11px] text-slate-400">로그인 계정</div>
                  <div className="text-sm font-semibold text-slate-800 truncate">{email ?? '게스트'}</div>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); onNavigate('settings'); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-500" /> 마이페이지 · 설정
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onLogout(); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> 로그아웃
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// Utility included for clsx merging
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
