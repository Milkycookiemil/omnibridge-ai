// src/hooks/usePenState.ts
// 펜 5종 + 활성 펜 선택/편집 상태. InkCanvas를 쓰는 화면(빈 노트·슬라이드)에서 공용.
import { useState, useCallback } from 'react';
import { DEFAULT_PENS, type PenModel, type PenType } from '../lib/inkEngine';

export function usePenState(initial: PenType = 'pen') {
  const [pens, setPens] = useState<Record<PenType, PenModel>>(() => ({ ...DEFAULT_PENS }));
  const [activeType, setActiveType] = useState<PenType>(initial);

  const activePen = pens[activeType];

  // 활성 펜의 색상/굵기/필압감도 등을 부분 갱신
  const updateActivePen = useCallback((patch: Partial<PenModel>) => {
    setPens((prev) => ({
      ...prev,
      [activeType]: { ...prev[activeType], ...patch },
    }));
  }, [activeType]);

  return { pens, activeType, activePen, setActiveType, updateActivePen };
}
