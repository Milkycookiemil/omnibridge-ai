// src/components/ink/PenToolbar.tsx
// A-1: 펜 5종 선택 + 활성 펜 팝오버(색상 팔레트·굵기·필압 감도).
import React, { useState } from 'react';
import { Pen, Pencil, Brush, Highlighter, Eraser } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  PEN_COLORS, HIGHLIGHTER_COLORS, PEN_META,
  type PenModel, type PenType,
} from '../../lib/inkEngine';

const PEN_ICONS: Record<PenType, React.FC<any>> = {
  pen: Pen,
  pencil: Pencil,
  brush: Brush,
  highlighter: Highlighter,
  eraser: Eraser,
};

const ORDER: PenType[] = ['pen', 'pencil', 'brush', 'highlighter', 'eraser'];

// 256색 전문가 팔레트 (16×16). 마지막 열은 무채색(흰→검).
const EXPERT_COLORS: string[] = (() => {
  const out: string[] = [];
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      if (c === 15) {
        out.push(`hsl(0,0%,${Math.round(100 - (r / 15) * 100)}%)`);
      } else {
        const hue = Math.round((c / 15) * 360);
        const light = Math.round(90 - (r / 15) * 78);
        out.push(`hsl(${hue},75%,${light}%)`);
      }
    }
  }
  return out;
})();

// 임의 CSS 색을 네이티브 색상 입력(type=color)이 요구하는 #rrggbb로 정규화
function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return '#000000';
  ctx.fillStyle = color;
  return /^#[0-9a-f]{6}$/i.test(ctx.fillStyle) ? ctx.fillStyle : '#000000';
}

interface PenToolbarProps {
  activeType: PenType;
  activePen: PenModel;
  setActiveType: (t: PenType) => void;
  updateActivePen: (patch: Partial<PenModel>) => void;
}

export function PenToolbar({ activeType, activePen, setActiveType, updateActivePen }: PenToolbarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showExpert, setShowExpert] = useState(false);

  const handlePick = (t: PenType) => {
    if (t === activeType) {
      setPopoverOpen((o) => !o); // 활성 펜 재탭 → 팝오버 토글
    } else {
      setActiveType(t);
      setPopoverOpen(true);
    }
  };

  const isEraser = activeType === 'eraser';
  const showPressure = activeType === 'pen' || activeType === 'pencil' || activeType === 'brush';
  const palette = activeType === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS;

  return (
    <div className="relative">
      <div className="flex gap-1.5 items-center">
        {ORDER.map((t) => {
          const Icon = PEN_ICONS[t];
          const active = t === activeType;
          return (
            <button
              key={t}
              onClick={() => handlePick(t)}
              title={PEN_META[t].label}
              className={cn(
                "p-2 rounded-lg transition-colors relative",
                active ? "bg-slate-100 text-slate-800" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              )}
            >
              <Icon className="w-5 h-5" />
              {/* 활성 펜의 현재 색을 점으로 표시 (지우개 제외) */}
              {active && t !== 'eraser' && (
                <span
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-1 rounded-full"
                  style={{ backgroundColor: activePen.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 팝오버 */}
      {popoverOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setPopoverOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 z-30 space-y-4">
            <div className="text-xs font-bold text-slate-500">{PEN_META[activeType].label} 설정</div>

            {!isEraser && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-400">색상</span>
                  <div className="flex items-center gap-1.5">
                    {/* 팔레트 탭: OS 색상 선택기로 구체적 설정 */}
                    <label
                      className="w-6 h-6 rounded-md border border-slate-200 cursor-pointer overflow-hidden flex items-center justify-center"
                      title="팔레트에서 직접 선택"
                      style={{ background: 'conic-gradient(red,#ff0,lime,aqua,blue,magenta,red)' }}
                    >
                      <input
                        type="color"
                        value={toHex(activePen.color)}
                        onChange={(e) => updateActivePen({ color: e.target.value })}
                        className="opacity-0 w-0 h-0"
                      />
                    </label>
                    {/* 전문가 색 선택 탭: 256색 */}
                    <button
                      onClick={() => setShowExpert((v) => !v)}
                      className={cn("text-[10px] font-bold px-2 py-1 rounded-md border transition-colors",
                        showExpert ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-50")}
                    >
                      256색
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {palette.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateActivePen({ color: c })}
                      className={cn(
                        "w-7 h-7 rounded-full border-2 transition-all shadow-sm",
                        activePen.color === c ? "border-slate-400 scale-110" : "border-transparent hover:scale-105"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                {showExpert && (
                  <div
                    className="mt-3 grid gap-0.5 p-1.5 bg-slate-50 rounded-lg border border-slate-200"
                    style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}
                  >
                    {EXPERT_COLORS.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => updateActivePen({ color: c })}
                        title={c}
                        className={cn(
                          "w-full aspect-square rounded-[2px] hover:scale-[1.6] hover:z-10 transition-transform relative",
                          activePen.color === c ? "ring-2 ring-slate-800 z-10" : ""
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {isEraser && (
              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-2">지우개 모드</div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => updateActivePen({ eraserMode: 'area' })}
                    className={cn("flex-1 py-1.5 text-[11px] font-bold rounded-lg border transition-colors",
                      (activePen.eraserMode ?? 'area') === 'area'
                        ? "bg-slate-800 text-white border-slate-800"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50")}
                  >
                    영역 지우기
                  </button>
                  <button
                    onClick={() => updateActivePen({ eraserMode: 'stroke' })}
                    className={cn("flex-1 py-1.5 text-[11px] font-bold rounded-lg border transition-colors",
                      activePen.eraserMode === 'stroke'
                        ? "bg-slate-800 text-white border-slate-800"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50")}
                  >
                    획 지우기
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">
                  {(activePen.eraserMode ?? 'area') === 'area'
                    ? '문지른 영역의 잉크를 지웁니다.'
                    : '스치기만 해도 획을 통째로 지웁니다.'}
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-400">굵기</span>
                <span className="text-[11px] font-mono text-slate-500">{activePen.baseWidth.toFixed(0)}px</span>
              </div>
              <input
                type="range" min={1} max={isEraser ? 40 : 24} step={1}
                value={activePen.baseWidth}
                onChange={(e) => updateActivePen({ baseWidth: parseInt(e.target.value) })}
                className="w-full accent-slate-700 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
              />
            </div>

            {showPressure && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-400">필압 감도</span>
                  <span className="text-[11px] font-mono text-slate-500">{activePen.pressureGain.toFixed(1)}</span>
                </div>
                <input
                  type="range" min={0} max={3} step={0.1}
                  value={activePen.pressureGain}
                  onChange={(e) => updateActivePen({ pressureGain: parseFloat(e.target.value) })}
                  className="w-full accent-violet-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                />
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
                  <span>낮음 (세게 눌러야 굵게)</span>
                  <span>높음</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
