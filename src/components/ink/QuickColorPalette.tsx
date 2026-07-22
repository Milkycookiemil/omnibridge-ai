// src/components/ink/QuickColorPalette.tsx
// 색상 UI 단일 허브(삼성 노트 참고). 툴바에 항상 보이는 즐겨찾기 스와치 + '팔레트' 버튼 →
// 상세 선택기(ColorDetailPicker) 한 곳에서만 색을 고른다(펜 팝오버엔 색상 UI 없음).
//  - 탭(비활성 스와치): 그 색을 현재 펜에 즉시 적용(활성이 됨)
//  - 탭(이미 활성 스와치): 상세 선택기 열기 → 그 슬롯 색을 편집(재탭하면 닫힘). 활성 스와치엔 ▾ 단서 표시.
//  - '팔레트' 버튼: 즐겨찾기를 건드리지 않고 임의 색을 골라 펜에만 적용(최근색에 쌓임).
//  - 우클릭(마우스) 또는 길게 누르기 600ms(태블릿/터치): 그 칸을 '현재 펜 색'으로 저장
// 색·즐겨찾기·최근색은 preferences에 영속되어 노트·기기 재방문에도 유지된다.
//
// 실기기 터치 방어:
//  - 버튼에 포인터 캡처를 걸어 손가락이 살짝 미끄러져도 길게 누르기가 취소되지 않고,
//    스와치 밖에서 떼도 pointerup이 버튼으로 전달돼 타이머가 정확히 해제된다.
//  - touch-action:none + user-select/touch-callout 차단으로 스크롤·텍스트선택·iOS 콜아웃 억제.
//  - Android는 길게 누르면 자체 contextmenu(≈500ms)를 먼저 쏨 → 그 경로도 저장으로 처리(중복 없음).
//  - 히트 영역: 각 버튼 44px(시각 스와치 20px + 여유) 확보.
import React, { useRef, useState } from 'react';
import { Palette, ChevronDown } from 'lucide-react';
import { usePreferences } from '../../lib/preferences';
import { cn } from '../../lib/utils';
import { ColorDetailPicker } from './ColorDetailPicker';

const LONG_PRESS_MS = 600;

interface QuickColorPaletteProps {
  activeColor: string;
  onPick: (color: string) => void;
  onOpenChange?: (open: boolean) => void; // 상세 선택기 열림/닫힘 알림
}

// 상세 선택기 대상: 특정 즐겨찾기 슬롯(number) 또는 즐겨찾기와 무관한 자유 선택('free').
type DetailTarget = number | 'free' | null;

export function QuickColorPalette({ activeColor, onPick, onOpenChange }: QuickColorPaletteProps) {
  const { favoriteColors, setFavoriteColor } = usePreferences();
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  // 길게 누르기 감지: pointerdown에서 타이머 시작, up/cancel로 해제.
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false); // 저장이 발동했으면 이어지는 click(적용)은 무시
  const [savedFlash, setSavedFlash] = useState<number | null>(null); // 저장 피드백(잠깐 반짝)
  const [detailForRaw, setDetailForRaw] = useState<DetailTarget>(null); // 상세 선택기 대상
  const detailFor = detailForRaw;
  const setDetailFor = (v: DetailTarget) => { setDetailForRaw(v); onOpenChange?.(v !== null); };
  const [detailOrig, setDetailOrig] = useState('#000000');           // 전/후 미리보기의 '전'

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
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 미지원 브라우저 무해 */ }
    cancelPress();
    pressTimerRef.current = setTimeout(() => saveSlot(i), LONG_PRESS_MS);
  };

  const handleTap = (i: number) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; } // 길게 누르기 저장 뒤 click 무시
    if (detailFor === i) { setDetailFor(null); return; }        // 상세 열려있으면 닫기
    if (eq(activeColor, favoriteColors[i])) {                   // 이미 활성 → 상세 열기
      setDetailOrig(favoriteColors[i]);
      setDetailFor(i);
    } else {                                                    // 아니면 적용(활성화)
      setDetailFor(null);
      onPick(favoriteColors[i]);
    }
  };

  const openFreePalette = () => {
    if (detailFor === 'free') { setDetailFor(null); return; }
    setDetailOrig(activeColor);
    setDetailFor('free');
  };

  // 상세에서 색 선택 → 슬롯 대상이면 그 슬롯 저장+적용, 자유 선택이면 펜에만 적용(즐겨찾기 불변).
  const handleDetailChange = (hex: string) => {
    if (detailFor === null) return;
    if (typeof detailFor === 'number') setFavoriteColor(detailFor, hex);
    onPick(hex);
  };

  return (
    <div className="relative flex items-center gap-0.5" title="퀵 색상 · 탭=적용 / 활성 스와치 재탭=상세 / 길게=현재 색 저장">
      {favoriteColors.map((c, i) => {
        const isActive = detailFor === i || eq(activeColor, c);
        return (
          <button
            key={i}
            onClick={() => handleTap(i)}
            onContextMenu={(e) => { e.preventDefault(); cancelPress(); saveSlot(i); }}
            onPointerDown={(e) => startPress(e, i)}
            onPointerUp={cancelPress}
            onPointerCancel={cancelPress}
            title={`즐겨찾기 색 ${i + 1} · 다시 누르면 상세 선택`}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg group touch-none select-none"
            style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
          >
            <span
              className={cn(
                'block w-5 h-5 rounded-full border shadow-sm transition-transform group-hover:scale-110',
                savedFlash === i ? 'ring-2 ring-emerald-400 scale-125'
                  : isActive ? 'border-slate-500 ring-2 ring-slate-300 scale-110' : 'border-slate-300'
              )}
              style={{ backgroundColor: c }}
            />
            {/* 재탭=상세 단서: 활성 스와치에만 ▾ 표시 */}
            {isActive && (
              <ChevronDown className="absolute bottom-1 right-1.5 w-3 h-3 text-slate-500 pointer-events-none" strokeWidth={3} />
            )}
          </button>
        );
      })}

      {/* 명시적 팔레트 버튼: 임의 색을 골라 펜에 적용(즐겨찾기 불변) */}
      <button
        onClick={openFreePalette}
        title="팔레트 — 원하는 색을 직접 선택"
        className={cn(
          'w-9 h-9 flex items-center justify-center rounded-lg transition-colors',
          detailFor === 'free' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
        )}
      >
        <Palette className="w-5 h-5" />
      </button>

      {/* 색상 상세 선택기 (스와치 아래로 펼침). 바깥 클릭 시 닫힘. */}
      {detailFor !== null && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDetailFor(null)} />
          <div className="absolute top-full left-0 mt-2 z-50">
            <ColorDetailPicker
              original={detailOrig}
              color={typeof detailFor === 'number' ? (favoriteColors[detailFor] ?? activeColor) : activeColor}
              onChange={handleDetailChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
