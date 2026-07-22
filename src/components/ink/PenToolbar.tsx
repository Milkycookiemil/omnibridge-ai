// src/components/ink/PenToolbar.tsx
// A-1 + 삼성노트 스타일 툴바(5종 아이콘) + 활성 펜 팝오버.
// 팝오버: 펜촉 종류 선택 + 획 미리보기 + 굵기/투명도/필압 + 지우개 모드 + 색상(6프리셋 + '상세').
// '상세'는 툴바 퀵 팔레트와 '동일한' ColorDetailPicker를 연다(고급 색 선택기 단일화). 낡은 256격자·중복 네이티브 입력은 제거.
import React, { useState } from 'react';
import { Pen, Pencil, Brush, Highlighter, Eraser, Palette } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PEN_COLORS, HIGHLIGHTER_COLORS, PEN_META, type PenModel, type PenType } from '../../lib/inkEngine';
import { PenTip } from './PenTip';
import { ColorDetailPicker } from './ColorDetailPicker';
import { usePreferences } from '../../lib/preferences';

const PEN_ICONS: Record<PenType, React.FC<any>> = {
  pen: Pen,
  pencil: Pencil,
  brush: Brush,
  highlighter: Highlighter,
  eraser: Eraser,
};

const ORDER: PenType[] = ['pen', 'pencil', 'brush', 'highlighter', 'eraser'];

interface PenToolbarProps {
  activeType: PenType;
  activePen: PenModel;
  setActiveType: (t: PenType) => void;
  updateActivePen: (patch: Partial<PenModel>) => void;
  onOpenChange?: (open: boolean) => void; // 팝오버 열림/닫힘 알림(부모가 툴바 가로스크롤을 잠깐 끄는 용도)
}

// 값 버블이 달린 슬라이더 (삼성노트식). trackBg를 주면 트랙 배경으로 쓴다(투명도 그라디언트 등).
function BubbleSlider({
  min, max, step, value, onChange, format, accent = '#334155', trackBg,
}: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; format: (v: number) => string;
  accent?: string; trackBg?: string;
}) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const bubbleLeft = `calc(${pct * 100}% + ${(0.5 - pct) * 22}px)`; // 썸 폭 보정
  return (
    <div className="relative pt-7">
      <div
        className="absolute top-0 -translate-x-1/2 min-w-[34px] px-1.5 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-xs font-bold text-slate-700 tabular-nums pointer-events-none"
        style={{ left: bubbleLeft }}
      >
        {format(value)}
      </div>
      <div className="relative h-2.5 flex items-center">
        {trackBg && <div className="absolute inset-0 rounded-full border border-slate-200" style={{ background: trackBg }} />}
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={cn('relative w-full h-2.5 rounded-full appearance-none cursor-pointer', trackBg ? 'bg-transparent' : 'bg-slate-200')}
          style={{ accentColor: accent }}
        />
      </div>
    </div>
  );
}

export function PenToolbar({ activeType, activePen, setActiveType, updateActivePen, onOpenChange }: PenToolbarProps) {
  const { popoverTapClose } = usePreferences(); // 켜면 노트 화면 아무 곳이나 눌러도 팝오버가 닫힌다
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false); // 팝오버 안 색상 상세 선택기 펼침
  const [detailOrig, setDetailOrig] = useState('#000000');

  const openPopover = (v: boolean) => { setPopoverOpen(v); onOpenChange?.(v); };
  const handlePick = (t: PenType) => {
    if (t === activeType) {
      openPopover(!popoverOpen); // 활성 펜 재탭 → 팝오버 토글
    } else {
      setActiveType(t);
      openPopover(true);
    }
  };

  const isEraser = activeType === 'eraser';
  const showPressure = activeType === 'pen' || activeType === 'pencil' || activeType === 'brush';
  const palette = activeType === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS;

  return (
    <div className="relative">
      <div className="flex gap-1 items-center">
        {ORDER.map((t) => {
          const Icon = PEN_ICONS[t];
          const active = t === activeType;
          return (
            <button
              key={t}
              onClick={() => handlePick(t)}
              title={PEN_META[t].label}
              className={cn(
                // 히트 영역 44px(실터치 여유) — 아이콘은 그대로, 눌리는 범위만 확보.
                "w-9 h-9 flex items-center justify-center rounded-lg transition-colors relative",
                active ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              )}
            >
              <Icon className="w-5 h-5" />
              {/* 활성 펜의 현재 색을 점으로 표시 (지우개 제외) */}
              {active && t !== 'eraser' && (
                <span
                  className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-1 rounded-full"
                  style={{ backgroundColor: activePen.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 팝오버 (삼성노트 스타일) — 펜 물성만 */}
      {popoverOpen && (
        <>
          {/* 바깥 탭으로 닫기(설정). 끄면 배경을 두지 않아 팝오버를 연 채로 필기할 수 있다. */}
          {popoverTapClose && <div className="fixed inset-0 z-20" onClick={() => { openPopover(false); setDetailOpen(false); }} />}
          <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 z-30 max-h-[80vh] overflow-y-auto">
            {/* 헤더: 실사풍 펜촉으로 종류 선택 */}
            <div className="flex items-end justify-around gap-1 px-1 pt-1 pb-2 border-b border-slate-100">
              {ORDER.map((t) => {
                const active = t === activeType;
                const tipColor = t === activePen.type ? activePen.color : (t === 'highlighter' ? '#fde047' : '#334155');
                return (
                  <button
                    key={t}
                    onClick={() => setActiveType(t)}
                    title={PEN_META[t].label}
                    className={cn('relative transition-all', active ? '-translate-y-1' : 'opacity-70 hover:opacity-100')}
                  >
                    <PenTip type={t} color={tipColor} className="w-7 h-16" />
                    {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-500" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 space-y-3">
              {/* 실시간 미리보기 획 */}
              {!isEraser && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 h-12 flex items-center justify-center overflow-hidden">
                  <svg width="100%" height="100%" viewBox="0 0 240 44" preserveAspectRatio="xMidYMid meet">
                    <path
                      d="M14,30 C48,4 78,40 110,22 S186,8 226,24"
                      fill="none"
                      stroke={activePen.color}
                      strokeWidth={Math.max(1, Math.min(activePen.baseWidth, 30))}
                      strokeLinecap={activeType === 'highlighter' ? 'butt' : 'round'}
                      strokeLinejoin="round"
                      opacity={activePen.opacity}
                    />
                  </svg>
                </div>
              )}

              {/* 굵기 */}
              <div>
                <div className="text-xs font-bold text-slate-500 mb-0.5">굵기</div>
                <BubbleSlider
                  min={1} max={isEraser ? 40 : 30} step={1}
                  value={activePen.baseWidth}
                  onChange={(v) => updateActivePen({ baseWidth: v })}
                  format={(v) => `${v.toFixed(0)}`}
                />
              </div>

              {/* 투명도 (지우개 외) — 체커보드 위 색 그라디언트 */}
              {!isEraser && (
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-0.5">투명도</div>
                  <BubbleSlider
                    min={0.1} max={1} step={0.05}
                    value={activePen.opacity}
                    onChange={(v) => updateActivePen({ opacity: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                    accent={activePen.color}
                    trackBg={`linear-gradient(to right, transparent, ${activePen.color}), repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 0 / 10px 10px`}
                  />
                </div>
              )}

              {/* 필압 감도 */}
              {showPressure && (
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-0.5">필압 감도</div>
                  <BubbleSlider
                    min={0} max={3} step={0.1}
                    value={activePen.pressureGain}
                    onChange={(v) => updateActivePen({ pressureGain: v })}
                    format={(v) => v.toFixed(1)}
                    accent="#8b5cf6"
                  />
                </div>
              )}

              {/* 지우개 모드 */}
              {isEraser && (
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-2">지우개 모드</div>
                  <div className="flex gap-1.5">
                    {(['area', 'stroke'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => updateActivePen({ eraserMode: m })}
                        className={cn('flex-1 py-2 text-xs font-bold rounded-lg border transition-colors',
                          (activePen.eraserMode ?? 'area') === m
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
                      >
                        {m === 'area' ? '영역 지우기' : '획 지우기'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-snug">
                    {(activePen.eraserMode ?? 'area') === 'area' ? '문지른 영역의 잉크를 지웁니다.' : '스치기만 해도 획을 통째로 지웁니다.'}
                  </p>
                </div>
              )}

              {/* 색상: 6프리셋(빠른 선택) + '상세'(툴바 퀵 팔레트와 동일한 ColorDetailPicker). 낡은 256격자·중복 네이티브 입력 제거. */}
              {!isEraser && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-500">색상</span>
                    <button
                      onClick={() => { setDetailOrig(activePen.color); setDetailOpen((v) => !v); }}
                      title="색상 상세 선택기 (색상×명도 그리드 · HSV · 스포이드 · 최근색)"
                      className={cn('flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md border transition-colors',
                        detailOpen ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
                    >
                      <Palette className="w-3.5 h-3.5" /> 상세
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {palette.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateActivePen({ color: c })}
                        className={cn('w-7 h-7 rounded-full border-2 transition-all shadow-sm',
                          activePen.color === c ? 'border-slate-400 scale-110' : 'border-transparent hover:scale-105')}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  {detailOpen && (
                    <div className="mt-3 flex justify-center">
                      <ColorDetailPicker
                        original={detailOrig}
                        color={activePen.color}
                        onChange={(hex) => updateActivePen({ color: hex })}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
