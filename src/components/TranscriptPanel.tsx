// src/components/TranscriptPanel.tsx
// #4: 하단 도킹 AI 패널 — 왼쪽 [실시간 전사], 오른쪽 [요약]. 필기는 메인을 꽉 채우고
// 이 패널은 탭 핸들로 접기/펼치기(상태는 preferences에 영속).
import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, ChevronDown, ChevronUp, Loader2, Lock, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import type { TranscriptLine, TranscribeStatus } from '../hooks/useTranscription';

interface TranscriptPanelProps {
  lines: TranscriptLine[];
  status: TranscribeStatus;
  modelProgress: number;
  open: boolean;
  onToggle: () => void;
  summarySlot?: React.ReactNode; // 오른쪽 요약 컬럼 내용
  onLineClick?: (line: TranscriptLine) => void; // P1: 라인 클릭 → 그 시각의 필기 하이라이트
}

const PANEL_H = 248; // px

export function TranscriptPanel({ lines, status, modelProgress, open, onToggle, summarySlot, onLineClick }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines.length]);

  const statusBadge = () => {
    switch (status) {
      case 'loading':
        return <span className="flex items-center gap-1 text-amber-600"><Loader2 className="w-3 h-3 animate-spin" /> 온디바이스 모델 로딩 {modelProgress > 0 ? `${modelProgress}%` : ''}</span>;
      case 'transcribing':
        return <span className="flex items-center gap-1 text-violet-600"><Loader2 className="w-3 h-3 animate-spin" /> 전사 중…</span>;
      case 'listening':
        return <span className="flex items-center gap-1 text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> 청취 중</span>;
      default:
        return <span className="text-slate-400">대기</span>;
    }
  };

  return (
    <>
      {/* 탭 핸들 */}
      <button
        onClick={onToggle}
        style={{ bottom: open ? PANEL_H - 4 : 8 }}
        className={cn(
          "absolute left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-1.5 bg-white border border-slate-200 shadow-md text-xs font-bold text-slate-600 hover:text-slate-900 transition-all",
          open ? "rounded-t-xl border-b-0" : "rounded-full"
        )}
      >
        <FileText className="w-3.5 h-3.5 text-blue-500" />
        실시간 전사 · 요약
        {lines.length > 0 && <span className="bg-slate-100 text-slate-500 px-1.5 rounded-full">{lines.length}</span>}
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {/* 도킹 패널 (2단: 전사 | 요약) */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            style={{ height: PANEL_H }}
            className="absolute left-0 right-0 bottom-0 bg-white border-t border-slate-200 shadow-2xl z-30 rounded-t-2xl flex overflow-hidden"
          >
            {/* 왼쪽: 실시간 전사 */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200">
              <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-blue-500" /> 실시간 전사
                  <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400 ml-1"><Lock className="w-3 h-3" /> 온디바이스</span>
                </h4>
                <div className="text-xs font-bold">{statusBadge()}</div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {lines.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                    {status === 'idle' ? '녹음을 시작하면 음성이 실시간으로 전사됩니다.'
                      : status === 'loading' ? '최초 1회 온디바이스 모델을 준비 중입니다…'
                      : '음성을 듣고 있습니다…'}
                  </div>
                ) : (
                  lines.map((l, i) => (
                    <button
                      key={i}
                      onClick={() => onLineClick?.(l)}
                      className="w-full flex gap-3 text-sm text-left rounded-lg -mx-2 px-2 py-1 hover:bg-blue-50 transition-colors group"
                      title="이 시점에 그린 필기 보기"
                    >
                      <span className="font-mono text-xs text-blue-500 font-bold shrink-0 mt-0.5 group-hover:underline">{l.time}</span>
                      <span className="text-slate-700 leading-relaxed">{l.text}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* 오른쪽: AI 요약 */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <Sparkles className="w-4 h-4 text-violet-600" /> AI 요약
                </h4>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-3">
                {summarySlot}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
