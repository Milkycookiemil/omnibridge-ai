import React from 'react';
import { ViewState } from '../types';
import { Home, Edit3, Search, Settings } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface BottomNavProps {
  currentView: ViewState;
  onViewChange: (view: ViewState) => void;
}

export function BottomNav({ currentView, onViewChange }: BottomNavProps) {
  const navItems = [
    { id: 'dashboard', label: '메인', icon: Home },
    { id: 'search', label: '검색', icon: Search },
    { id: 'settings', label: '설정', icon: Settings },
  ] as const;

  return (
    <nav className="w-16 flex flex-col items-center py-8 gap-10 bg-white/80 border-r border-slate-200 h-full overflow-visible shrink-0 z-20 relative shadow-sm">
      {navItems.map((item) => {
        const isActive = currentView === item.id;
        const Icon = item.icon;
        const isDisabled = 'disabled' in item ? item.disabled : false;
        return (
          <button
            key={item.id}
            onClick={() => !isDisabled && onViewChange(item.id as ViewState)}
            disabled={isDisabled}
            className={cn(
              "p-3 rounded-xl transition-all duration-200 relative group flex items-center justify-center",
              isActive ? "bg-blue-50 border border-blue-200 text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50",
              isDisabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <Icon className="w-6 h-6" />
            <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-xl drop-shadow-xl flex items-center">
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-800 border-l border-b border-slate-700 rotate-45"></div>
                {item.label}
            </div>
          </button>
        );
      })}
    </nav>
  );
}
