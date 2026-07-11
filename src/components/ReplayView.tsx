import React, { useState, useEffect, useRef } from 'react';
import { dummyData } from '../data';
import { Play, Pause, FastForward, Rewind } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ViewState } from '../types';

interface ReplayViewProps {
  initialInkGroupId?: string;
  onNavigate: (view: ViewState) => void;
}

export function ReplayView({ initialInkGroupId, onNavigate }: ReplayViewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeInk, setActiveInk] = useState<string | null>(initialInkGroupId || null);
  const [progress, setProgress] = useState(0); // 0 to 100
  const progressRef = useRef(progress);
  
  // Total mock duration: 25 minutes roughly (1500 sec)
  const TOTAL_DURATION = 1500;
  
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        // Mock playback speed (much faster for demo)
        const newProgress = Math.min(progressRef.current + 0.1, 100);
        setProgress(newProgress);
        
        // Auto-highlight based on progress time
        const currentSeconds = (newProgress / 100) * TOTAL_DURATION;
        let bestInk = null;
        for (const card of dummyData.summaryCards) {
          if (currentSeconds >= card.timestamp) {
            bestInk = card.inkGroupId;
          }
        }
        if (bestInk !== activeInk) {
          setActiveInk(bestInk);
        }
        
        if (newProgress >= 100) setIsPlaying(false);
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, activeInk]);

  // Jump to specific card
  const jumpToCard = (card: typeof dummyData.summaryCards[0]) => {
    setActiveInk(card.inkGroupId);
    setProgress((card.timestamp / TOTAL_DURATION) * 100);
    setIsPlaying(true);
  };
  
  const jumpToInk = (inkId: string) => {
    const card = dummyData.summaryCards.find(c => c.inkGroupId === inkId);
    if (card) {
      jumpToCard(card);
    }
  };

  const formatTime = (prog: number) => {
    const sec = Math.floor((prog / 100) * TOTAL_DURATION);
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative w-full h-full">
      <div className="px-8 py-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{dummyData.currentNote.title}</h1>
          <p className="text-sm text-slate-500 mt-1">녹화된 리플레이 · {dummyData.currentNote.lastOpened} · {dummyData.currentNote.progress}</p>
        </div>
        <div className="flex gap-2">
          {dummyData.aiInsights.tags.map(tag => (
            <div key={tag} className="px-3 py-1 rounded bg-violet-50 border border-violet-100 text-xs text-violet-600 font-medium italic">{tag}</div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 bg-slate-50">
        
        {/* Left: Ink Canvas */}
        <div className="w-[60%] p-8 overflow-hidden relative bg-white border-r border-slate-200 flex items-center justify-center">
          <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(#000000 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
          
          <div className="relative z-10 w-full h-full max-w-2xl max-h-[80vh] border border-slate-200 rounded-2xl p-8 bg-white shadow-sm">
            <svg className="w-full h-full" viewBox="0 0 600 800" fill="none" xmlns="http://www.w3.org/2000/svg">
              <text x="50" y="50" className="text-slate-400 text-xl font-bold font-sans" fill="currentColor">6강. 비즈니스 모델 캔버스</text>
              
              {/* Ink Group 1: 00:30 BMC 개요 */}
              <g
                onClick={() => jumpToInk('ink-1')}
                className="cursor-pointer transition-all duration-300 transform origin-left"
              >
                <path d="M 50 120 Q 300 110, 550 125" stroke="#334155" strokeWidth="3" opacity="0.8" />
                <path d="M 100 150 C 150 140, 200 160, 250 150" stroke="#334155" strokeWidth="2" opacity="0.6" />
                <text x="50" y="100" fill="currentColor" className="text-slate-400 text-sm font-sans italic">The 9 Building Blocks</text>
                {activeInk === 'ink-1' && (
                  <rect x="30" y="70" width="540" height="100" fill="url(#glow-amber)" className="animate-pulse duration-300" />
                )}
              </g>

              {/* Ink Group 2: 05:12 가치 제안 */}
              <g 
                onClick={() => jumpToInk('ink-2')}
                className="cursor-pointer transition-all duration-300 transform origin-left"
              >
                <rect x="50" y="220" width="150" height="80" rx="10" stroke="#334155" strokeWidth="3" opacity="0.8" strokeDasharray="5 5" />
                <path d="M 70 260 L 180 260" stroke="#F59E0B" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
                <text x="60" y="250" fill="currentColor" className="text-slate-800 text-lg font-sans">고객 결과 중심</text>
                {activeInk === 'ink-2' && (
                  <rect x="40" y="210" width="170" height="100" fill="url(#glow-amber)" className="animate-pulse duration-300" />
                )}
              </g>
              
              {/* Ink Group 3: 12:30 수익원 */}
              <g 
                onClick={() => jumpToInk('ink-3')}
                className="cursor-pointer transition-all duration-300 transform origin-left"
              >
                <path d="M 280 220 C 350 200, 400 300, 480 250" stroke="#334155" strokeWidth="4" opacity="0.8" />
                <circle cx="280" cy="220" r="8" fill="#3B82F6" />
                <circle cx="480" cy="250" r="10" fill="#22D3EE" />
                <text x="250" y="190" fill="currentColor" className="text-slate-400 text-sm font-sans">무료 (Freemium)</text>
                <text x="470" y="290" fill="currentColor" className="text-cyan-500 font-bold text-lg font-sans">PRO 전환!</text>
                {activeInk === 'ink-3' && (
                  <rect x="230" y="170" width="300" height="140" fill="url(#glow-amber)" className="animate-pulse duration-300" />
                )}
              </g>
              
              {/* Ink Group 4: 18:45 비용 구조 */}
              <g 
                onClick={() => jumpToInk('ink-4')}
                className="cursor-pointer transition-all duration-300 transform origin-left"
              >
                <path d="M 50 380 L 550 380" stroke="#334155" strokeWidth="2" opacity="0.4" strokeDasharray="10 10"/>
                <text x="50" y="430" fill="currentColor" className="text-slate-800 text-xl font-bold font-sans">비용 구조 = 고정비 + 변동비</text>
                <path d="M 50 450 Q 100 440, 200 455" stroke="#334155" strokeWidth="2" opacity="0.7" />
                <path d="M 50 460 Q 150 490, 300 450" stroke="#334155" strokeWidth="3" opacity="0.8" />
                {activeInk === 'ink-4' && (
                  <rect x="30" y="390" width="540" height="90" fill="url(#glow-amber)" className="animate-pulse duration-300" />
                )}
              </g>

              <defs>
                <radialGradient id="glow-amber" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
                </radialGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Right: Summary Timeline */}
        <div className="w-[40%] bg-slate-50 flex flex-col p-6 gap-4 overflow-y-auto">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2 shrink-0">AI Summary Timeline</div>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {dummyData.summaryCards.map((card, i) => {
              const isActive = activeInk === card.inkGroupId;
              return (
                <div 
                  key={i}
                  onClick={() => jumpToCard(card)}
                  className={cn(
                    "p-4 rounded-xl cursor-pointer transition-all duration-300 border shadow-sm",
                    isActive 
                      ? "bg-amber-50 border-amber-200 border-l-4 border-l-amber-500 shadow-md shadow-amber-500/10" 
                      : "bg-white border-slate-200 border-l-4 border-l-violet-500 hover:bg-slate-50"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn("text-[10px] font-mono", isActive ? "text-amber-600 font-bold" : "text-violet-600 font-bold")}>
                      {card.time}
                    </span>
                    <span className={cn("text-[10px] px-1 rounded font-bold", isActive ? "bg-amber-500 text-white" : "bg-violet-100 text-violet-700")}>
                      {isActive ? "REPLAYING" : "TOPIC"}
                    </span>
                  </div>
                  <p className={cn("text-sm font-medium", isActive ? "text-slate-900 font-bold" : "text-slate-700")}>
                    {card.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom: Audio Player Proxy */}
      <div className="h-[110px] bg-white border-t border-slate-200 shadow-lg flex items-center px-8 gap-8 relative overflow-hidden shrink-0 z-20">
        <div className="absolute top-0 left-0 h-[2px] bg-blue-500" style={{ width: `${progress}%`, transition: 'width 0.1s linear' }}></div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors shadow-sm"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
          </button>
          <div className="text-sm font-mono tracking-tight text-slate-700 font-medium w-24">
            {formatTime(progress)} / 25:00
          </div>
        </div>
        
        <div className="flex-1 flex flex-col justify-center">
            <div 
              className="h-2 w-full bg-slate-100 rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const p = ((e.clientX - rect.left) / rect.width) * 100;
                setProgress(p);
              }}
            >
              <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${progress}%` }}></div>
            </div>
        </div>
        
        <div className="flex gap-4">
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg">
            <Rewind className="w-5 h-5" />
          </button>
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg">
            <FastForward className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
