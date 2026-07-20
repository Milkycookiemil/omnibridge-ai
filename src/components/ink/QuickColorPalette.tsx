// src/components/ink/QuickColorPalette.tsx
// 3색 퀵 팔레트(즐겨찾기). 삼성 노트 참고 — 올가미 버튼 왼쪽에 두어 색을 바로바로 적용.
//  - 클릭: 해당 색을 현재 펜에 즉시 적용
//  - 우클릭(길게 누르기 대체): 그 칸을 '현재 펜 색'으로 저장 → 나만의 즐겨찾기 구성
// 색은 preferences에 영속되어 노트·기기 재방문에도 유지된다.
import React from 'react';
import { usePreferences } from '../../lib/preferences';
import { cn } from '../../lib/utils';

interface QuickColorPaletteProps {
  activeColor: string;
  onPick: (color: string) => void;
}

export function QuickColorPalette({ activeColor, onPick }: QuickColorPaletteProps) {
  const { favoriteColors, setFavoriteColor } = usePreferences();
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  return (
    <div className="flex items-center gap-1" title="퀵 색상 · 클릭=적용 / 우클릭=현재 색 저장">
      {favoriteColors.map((c, i) => (
        <button
          key={i}
          onClick={() => onPick(c)}
          onContextMenu={(e) => { e.preventDefault(); setFavoriteColor(i, activeColor); }}
          title={`즐겨찾기 색 ${i + 1}`}
          className={cn(
            'w-5 h-5 rounded-full border shadow-sm transition-transform hover:scale-110',
            eq(activeColor, c) ? 'border-slate-500 ring-2 ring-slate-300 scale-110' : 'border-slate-200'
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}
