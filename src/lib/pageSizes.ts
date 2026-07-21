// src/lib/pageSizes.ts
// 빈 노트 페이지 크기(비율·방향) 정의. GoodNotes/Notability/삼성노트 등 레퍼런스 필기앱이
// 기본 A4에 더해 정사각·와이드 비율을 제공하는 것을 참고했다.
//  - 비율은 "세로(portrait)" 기준 w:h(정사각 제외 w<=h)로 정의하고, '가로'는 두 값을 뒤집는다.
//  - 캔버스 논리 해상도는 긴 변을 LONG으로 고정해 계산(획 좌표 공간 = 이 w×h).
//  - sizeId 형식: `${비율id}-${p|l}` (예: 'a4-p'=A4 세로, '16x9-l'=16:9 가로). 정사각은 방향 무의미.

export type Orientation = 'p' | 'l'; // portrait / landscape

interface RatioDef { id: string; label: string; w: number; h: number } // 세로 기준(w<=h)

// UI 노출 순서 = 아래 순서. A4가 맨 앞(기본).
export const PAGE_RATIOS: RatioDef[] = [
  { id: 'a4', label: 'A4', w: 210, h: 297 },
  { id: 'sq', label: '1:1', w: 1, h: 1 },
  { id: '4x3', label: '4:3', w: 3, h: 4 },
  { id: '16x9', label: '16:9', w: 9, h: 16 },
  { id: '21x9', label: '21:9', w: 9, h: 21 },
];

const LONG = 1100; // 긴 변 논리 픽셀(디테일·성능 균형: 기존 800×800과 비슷한 규모)

export const DEFAULT_PAGE_SIZE = 'a4-p';

export const makeSizeId = (ratioId: string, o: Orientation) => `${ratioId}-${o}`;
export const parseSizeId = (sizeId: string): { ratioId: string; orient: Orientation } => {
  const [ratioId, orient] = sizeId.split('-');
  return { ratioId: ratioId || 'a4', orient: (orient as Orientation) || 'p' };
};
export const isSquare = (ratioId: string) => ratioId === 'sq';

// sizeId → 캔버스 논리 크기(px). 알 수 없으면 A4 세로.
export function pageDims(sizeId: string | undefined): { w: number; h: number } {
  if (!sizeId) return pageDims(DEFAULT_PAGE_SIZE);
  const { ratioId, orient } = parseSizeId(sizeId);
  const r = PAGE_RATIOS.find((x) => x.id === ratioId) ?? PAGE_RATIOS[0];
  let w = r.w, h = r.h;
  if (orient === 'l') { const t = w; w = h; h = t; } // 가로 = 뒤집기
  const scale = LONG / Math.max(w, h);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export function sizeLabel(sizeId: string | undefined): string {
  if (!sizeId) return 'A4 세로';
  const { ratioId, orient } = parseSizeId(sizeId);
  const r = PAGE_RATIOS.find((x) => x.id === ratioId);
  if (!r) return 'A4 세로';
  if (isSquare(ratioId)) return '1:1';
  return `${r.label} ${orient === 'l' ? '가로' : '세로'}`;
}
