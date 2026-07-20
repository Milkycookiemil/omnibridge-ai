// src/components/ink/QuickColorPalette.tsx
// 3색 퀵 팔레트(즐겨찾기). 삼성 노트 참고 — 올가미 버튼 왼쪽에 두어 색을 바로바로 적용.
//  - 클릭/탭: 해당 색을 현재 펜에 즉시 적용
//  - 우클릭(마우스) 또는 길게 누르기 600ms(태블릿/터치): 그 칸을 '현재 펜 색'으로 저장
// 색은 preferences에 영속되어 노트·기기 재방문에도 유지된다.
//
// 실기기 터치 방어:
//  - 버튼에 포인터 캡처를 걸어 손가락이 살짝 미끄러져도 길게 누르기가 취소되지 않고,
//    스와치 밖에서 떼도 pointerup이 버튼으로 전달돼 타이머가 정확히 해제된다.
//  - touch-action:none + user-select/touch-callout 차단으로 스크롤·텍스트선택·iOS 콜아웃 억제.
//  - Android는 길게 누르면 자체 contextmenu(≈500ms)를 먼저 쏨 → 그 경로도 저장으로 처리(중복 없음).
//  - 히트 영역: 시각 스와치는 20px, 버튼 패딩으로 실터치 영역 ≈32px 확보.
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

  // 길게 누르기 감지: pointerdown에서 타이머 시작, up/cancel로 해제.
  // (leave로는 취소하지 않는다 — 포인터 캡처 덕에 up은 어디서 떼도 버튼에 도착)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false); // 저장이 발동했으면 이어지는 click(적용)은 무시
  const [savedFlash, setSavedFlash] = useState<number | null>(null); // 저장 피드백(잠깐 반짝)

  const saveSlot = (i: number) => {
    suppressClickRef.current = true; // 타이머·contextmenu 어느 경로든 저장 후 click 억제
    setFavoriteColor(i, activeColor);
    setSavedFlash(i);
    setTimeout(() => setSavedFlash(null), 700);
  };
  const cancelPress = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
  };
  const startPress = (e: React.PointerEvent, i: number) => {
    suppressClickRef.current = false;
    // 미끄러짐 허용: 캡처를 걸면 손가락이 스와치 밖으로 나가도 이벤트가 버튼으로 온다.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 미지원 브라우저 무해 */ }
    cancelPress();
    pressTimerRef.current = setTimeout(() => saveSlot(i), LONG_PRESS_MS);
  };

  return (
    <div className="flex items-center" title="퀵 색상 · 클릭=적용 / 우클릭·길게 누르기=현재 색 저장">
      {favoriteColors.map((c, i) => (
        <button
          key={i}
          onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } onPick(c); }}
          onContextMenu={(e) => { e.preventDefault(); cancelPress(); saveSlot(i); }}
          onPointerDown={(e) => startPress(e, i)}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          title={`즐겨찾기 색 ${i + 1}`}
          className="p-1.5 rounded-lg group touch-none select-none"
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
        >
          <span
            className={cn(
              'block w-5 h-5 rounded-full border shadow-sm transition-transform group-hover:scale-110',
              savedFlash === i ? 'ring-2 ring-emerald-400 scale-125'
                : eq(activeColor, c) ? 'border-slate-500 ring-2 ring-slate-300 scale-110' : 'border-slate-200'
            )}
            style={{ backgroundColor: c }}
          />
        </button>
      ))}
    </div>
  );
}
