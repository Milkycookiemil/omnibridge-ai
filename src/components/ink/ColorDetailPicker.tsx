// src/components/ink/ColorDetailPicker.tsx
// 삼성 노트식 색상 상세 선택기. 퀵 팔레트 스와치를 (활성 상태에서) 한 번 더 누르면 뜬다.
//  - 표준 탭: 색상×명도 프리셋 그리드(+ 무채색 열)
//  - 사용자 지정 탭: 채도/명도 사각 + 색상(hue) 슬라이더 (HSV 드래그)
//  - 공통 하단: 전/후 미리보기 + 색상코드(hex) + 빨강/녹색/파랑 값 + 최근색 + 스포이드
import React, { useEffect, useRef, useState } from 'react';
import { Pipette } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePreferences } from '../../lib/preferences';

// ── 색 변환 유틸 ──────────────────────────────────────────────
const clamp = (v: number, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v));
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, '0')).join('').toUpperCase();
function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

// 표준 탭 프리셋 그리드: 첫 열 무채색(흰→검), 이후 12색상 × 명도.
const STD_ROWS = 10, STD_HUES = 12;
const stdGrid: string[][] = (() => {
  const rows: string[][] = [];
  for (let r = 0; r < STD_ROWS; r++) {
    const row: string[] = [];
    const gl = Math.round(100 - (r / (STD_ROWS - 1)) * 100);
    row.push(`hsl(0 0% ${gl}%)`);
    for (let c = 0; c < STD_HUES; c++) {
      const hue = Math.round((c / STD_HUES) * 360);
      const light = Math.round(92 - (r / (STD_ROWS - 1)) * 82);
      row.push(`hsl(${hue} 78% ${light}%)`);
    }
    rows.push(row);
  }
  return rows;
})();
// CSS hsl 문자열을 hex로 정규화(캔버스 이용).
function cssToHex(css: string): string {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return '#000000';
  ctx.fillStyle = css;
  return /^#[0-9a-f]{6}$/i.test(ctx.fillStyle) ? ctx.fillStyle.toUpperCase() : '#000000';
}

const hasEyeDropper = typeof window !== 'undefined' && typeof (window as any).EyeDropper === 'function';

export function ColorDetailPicker({
  original, color, onChange,
}: {
  original: string;   // 열릴 때의 원래 색(전/후 미리보기 '전')
  color: string;      // 현재 선택 색(hex)
  onChange: (hex: string) => void;
}) {
  const { recentColors, pushRecentColor } = usePreferences();
  const [tab, setTab] = useState<'std' | 'custom'>('std');
  const rgb = hexToRgb(color);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  const pureHue = (() => { const c = hsvToRgb(hsv.h, 1, 1); return rgbToHex(c.r, c.g, c.b); })(); // 현재 색상의 순수 hue(SV 사각 배경용)
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  // 최신 color를 드래그 종료 콜백에서 읽기 위한 ref (드래그 핸들러보다 먼저 선언)
  const colorRef = useRef(color); colorRef.current = color;

  const commit = (hex: string) => { onChange(hex); };
  const commitFinal = (hex: string) => { onChange(hex); pushRecentColor(hex); };

  // 색상코드 직접 입력: 타이핑 중에는 초안을 유지하고, 6자리로 완성될 때마다 즉시 반영.
  // (최근색은 입력이 끝났을 때만 쌓이도록 blur에서 commitFinal)
  const [hexDraft, setHexDraft] = useState(color.toUpperCase());
  useEffect(() => { setHexDraft(color.toUpperCase()); }, [color]);
  const onHexInput = (v: string) => {
    setHexDraft(v);
    const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
    if (m) commit('#' + m[1].toUpperCase());
  };
  // 빨강/녹색/파랑 직접 입력: 0~255로 보정해 즉시 반영.
  const setChannel = (ch: 'r' | 'g' | 'b', v: number) => {
    const n = clamp(Number.isFinite(v) ? Math.round(v) : 0);
    const next = { ...rgb, [ch]: n };
    commit(rgbToHex(next.r, next.g, next.b));
  };

  // 사용자 지정: SV 사각/hue 슬라이더 드래그
  const dragSV = (e: React.PointerEvent) => {
    const el = svRef.current; if (!el) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const move = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (cx - r.left) / r.width));
      const v = Math.max(0, Math.min(1, 1 - (cy - r.top) / r.height));
      const c = hsvToRgb(hsv.h, s, v);
      commit(rgbToHex(c.r, c.g, c.b));
    };
    move(e.clientX, e.clientY);
    (el as any).__mv = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    el.addEventListener('pointermove', (el as any).__mv);
    const up = () => { el.removeEventListener('pointermove', (el as any).__mv); el.removeEventListener('pointerup', up); commitFinal(colorRef.current); };
    el.addEventListener('pointerup', up);
  };
  const dragHue = (e: React.PointerEvent) => {
    const el = hueRef.current; if (!el) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const move = (cx: number) => {
      const r = el.getBoundingClientRect();
      const h = Math.max(0, Math.min(360, ((cx - r.left) / r.width) * 360));
      const c = hsvToRgb(h, hsv.s || 1, hsv.v || 1);
      commit(rgbToHex(c.r, c.g, c.b));
    };
    move(e.clientX);
    (el as any).__mv = (ev: PointerEvent) => move(ev.clientX);
    el.addEventListener('pointermove', (el as any).__mv);
    const up = () => { el.removeEventListener('pointermove', (el as any).__mv); el.removeEventListener('pointerup', up); commitFinal(colorRef.current); };
    el.addEventListener('pointerup', up);
  };

  return (
    <div className="w-64 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 select-none" onClick={(e) => e.stopPropagation()}>
      {/* 탭 */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 mb-3">
        {(['std', 'custom'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('flex-1 py-1.5 text-xs font-bold rounded-md transition-colors',
              tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {t === 'std' ? '표준' : '사용자 지정'}
          </button>
        ))}
      </div>

      {tab === 'std' ? (
        <div className="rounded-lg overflow-hidden border border-slate-200">
          {stdGrid.map((row, ri) => (
            <div key={ri} className="flex">
              {row.map((css, ci) => {
                const hex = cssToHex(css);
                const active = hex.toLowerCase() === color.toLowerCase();
                return (
                  <button key={ci} onClick={() => commitFinal(hex)} title={hex}
                    className={cn('flex-1 aspect-square', active ? 'ring-2 ring-slate-800 ring-inset z-10 relative' : '')}
                    style={{ background: css }} />
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {/* 채도/명도 사각 */}
          <div ref={svRef} onPointerDown={dragSV}
            className="relative w-full h-32 rounded-lg cursor-crosshair touch-none"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pureHue})` }}>
            <div className="absolute w-3 h-3 rounded-full border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: color }} />
          </div>
          {/* 색상(hue) 슬라이더 */}
          <div ref={hueRef} onPointerDown={dragHue}
            className="relative w-full h-4 rounded-full cursor-pointer touch-none"
            style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}>
            <div className="absolute top-1/2 w-4 h-4 rounded-full border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: color }} />
          </div>
        </div>
      )}

      {/* 전/후 미리보기 + 값(직접 입력 가능) */}
      <div className="flex items-center gap-2.5 mt-3">
        <div className="w-11 h-9 rounded-md overflow-hidden border border-slate-200 flex shrink-0">
          <div className="flex-1" style={{ backgroundColor: original }} />
          <div className="flex-1" style={{ backgroundColor: color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 shrink-0">색상 코드</span>
            <input
              value={hexDraft}
              onChange={(e) => onHexInput(e.target.value)}
              onBlur={() => { setHexDraft(color.toUpperCase()); commitFinal(colorRef.current); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              spellCheck={false}
              className="min-w-0 flex-1 font-mono text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {(['r', 'g', 'b'] as const).map((ch) => (
              <label key={ch} className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold text-slate-500">{ch === 'r' ? '빨강' : ch === 'g' ? '녹색' : '파랑'}</span>
                <input
                  type="number" min={0} max={255} inputMode="numeric"
                  value={rgb[ch]}
                  onChange={(e) => setChannel(ch, parseInt(e.target.value, 10))}
                  onBlur={() => commitFinal(colorRef.current)}
                  className="w-full font-mono text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 최근색 + 스포이드 */}
      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
        {Array.from({ length: 5 }).map((_, i) => {
          const c = recentColors[i];
          return c
            ? <button key={i} onClick={() => commitFinal(c)} title={c}
                className="w-6 h-6 rounded-full border border-slate-200 hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
            : <div key={i} className="w-6 h-6 rounded-full border border-dashed border-slate-200" />;
        })}
        <div className="flex-1" />
        {hasEyeDropper && (
          <button
            title="화면에서 색 추출(스포이드)"
            onClick={async () => { try { const r = await new (window as any).EyeDropper().open(); if (r?.sRGBHex) commitFinal(r.sRGBHex.toUpperCase()); } catch { /* 취소 */ } }}
            className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
          ><Pipette className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  );
}
