// src/components/ink/QuickColorPalette.tsx
// 3색 퀵 팔레트(즐겨찾기). 삼성 노트 참고 — 올가미 버튼 왼쪽에 두어 색을 바로바로 적용.
//  - 클릭/탭: 해당 색을 현재 펜에 즉시 적용
//  - 우클릭(마우스) 또는 길게 누르기 600ms(태블릿/터치): 그 칸을 '현재 펜 색'으로 저장
// 색은 preferences에 영속되어 노트·기기 재방문에도 유지된다.
import React, { useRef, useState } from 'react';
import { usePreferences } from '../../lib/preferences';
import { cn } from '../../lib/utils';

const LONG_PRESS_MS = 600;

interface QuickColorPaletteProps {
  activeColor: string;
  onPick: (color: string) => void;
}

export function QuickColorPalette({ activeColor, onPick }: QuickColorPaletteProps) {
  const { favoriteColors, setFavoriteColor } = usePreferences();
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  // 길게 누르기 감지: pointerdown에서 타이머 시작, up/leave/cancel로 해제.
  // 길게 눌러 저장이 발동하면 이어지는 click(적용)은 무시한다.
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);
  const [savedFlash, setSavedFlash] = useState<number | null>(null); // 저장 피드백(잠깐 반짝)

  const saveSlot = (i: number) => {
    setFavoriteColor(i, activeColor);
    setSavedFlash(i);
    setTimeout(() => setSavedFlash(null), 700);
  };
  const startPress = (i: number) => {
    longFiredRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      longFiredRef.current = true;
      saveSlot(i);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
  };

  return (
    <div className="flex items-center gap-1" title="퀵 색상 · 클릭=적용 / 우클릭·길게 누르기=현재 색 저장">
      {favoriteColors.map((c, i) => (
        <button
          key={i}
          onClick={() => { if (longFiredRef.current) { longFiredRef.current = false; return; } onPick(c); }}
          onContextMenu={(e) => { e.preventDefault(); cancelPress(); saveSlot(i); }}
          onPointerDown={() => startPress(i)}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          title={`즐겨찾기 색 ${i + 1}`}
          className={cn(
            'w-5 h-5 rounded-full border shadow-sm transition-transform hover:scale-110 touch-none select-none',
            savedFlash === i ? 'ring-2 ring-emerald-400 scale-125'
              : eq(activeColor, c) ? 'border-slate-500 ring-2 ring-slate-300 scale-110' : 'border-slate-200'
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}
