// src/lib/inkEngine.ts
// 펜 종류별 렌더링 + 필압→굵기 매핑 엔진.
// InkCanvas(빈 노트·PDF·캡쳐 슬라이드 공용)와 동기화 양쪽에서 이 한 벌을 사용한다.

export type PenType = 'pen' | 'pencil' | 'brush' | 'highlighter' | 'eraser';

// 지우개 모드: 영역(픽셀 destination-out) / 획(스트로크 통째 삭제)
export type EraserMode = 'area' | 'stroke';

// 펜 한 자루의 설정. 필압 감도(pressureGain)는 팝오버 슬라이더로 조절된다.
export interface PenModel {
  type: PenType;
  color: string;
  baseWidth: number;
  pressureGain: number; // 클수록 약한 힘에도 굵게
  opacity: number;
  eraserMode?: EraserMode; // 지우개 전용
}

// 실시간 릴레이·CRDT·렌더에 공통으로 흐르는 잉크 세그먼트 (최소 단위 = 델타 청크).
// 굵기는 필압이 반영된 최종 값으로 저장해 원격/리플레이에서 동일하게 재현한다.
// strokeId/layerId로 세그먼트를 스트로크·레이어 단위로 묶는다 (획 지우기·레이어의 기반).
export interface InkSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
  penType: PenType;
  color: string;
  width: number;
  opacity: number;
  strokeId?: string;
  layerId?: string;
}

// 획 지우기(스트로크 삭제) 연산. CRDT에는 append-only 이벤트로 쌓여
// 리플레이 시 세그먼트·삭제가 순서대로 적용돼 동일한 최종 상태를 재현한다.
export interface EraseStrokesOp {
  type: 'erase_strokes';
  strokeIds: string[];
}

// 동기화 채널·CRDT를 흐르는 잉크 이벤트의 합집합
export type InkDelta = InkSegment | EraseStrokesOp;

// 캔버스 내부 모델: 레이어(포토샵식)와 스트로크(획 단위 저장)
export interface InkLayer {
  id: string;
  name: string;
  visible: boolean;
}

export interface InkStroke {
  id: string;
  layerId: string;
  penType: PenType;
  color: string;
  opacity: number;
  segs: { from: { x: number; y: number }; to: { x: number; y: number }; width: number }[];
}

// 점-선분 거리 (획 지우개 히트테스트용)
export function distancePointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export const PEN_COLORS = ['#334155', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'];
// 형광펜은 형광 계열로 제한
export const HIGHLIGHTER_COLORS = ['#fde047', '#86efac', '#fca5a5', '#93c5fd', '#f0abfc'];

export const DEFAULT_PENS: Record<PenType, PenModel> = {
  pen:         { type: 'pen',         color: '#334155', baseWidth: 3,  pressureGain: 1.0, opacity: 1 },
  pencil:      { type: 'pencil',      color: '#475569', baseWidth: 2.5, pressureGain: 0.6, opacity: 0.55 },
  brush:       { type: 'brush',       color: '#334155', baseWidth: 5,  pressureGain: 2.2, opacity: 1 },
  highlighter: { type: 'highlighter', color: '#fde047', baseWidth: 18, pressureGain: 0,   opacity: 0.30 },
  eraser:      { type: 'eraser',      color: '#000000', baseWidth: 22, pressureGain: 0,   opacity: 1, eraserMode: 'area' },
};

export const PEN_META: Record<PenType, { label: string }> = {
  pen: { label: '볼펜' },
  pencil: { label: '연필' },
  brush: { label: '브러쉬' },
  highlighter: { label: '형광펜' },
  eraser: { label: '지우개' },
};

// 필압(0~1)을 펜 종류별 곡선으로 굵기에 매핑. 마우스(pressure=0)는 0.5로 폴백.
export function widthForPressure(model: PenModel, pressure: number): number {
  const p = pressure > 0 ? pressure : 0.5;
  switch (model.type) {
    case 'pen':         return model.baseWidth * (0.5 + p * model.pressureGain);
    case 'pencil':      return model.baseWidth * (0.7 + p * model.pressureGain * 0.4);
    case 'brush':       return model.baseWidth * (0.3 + p * model.pressureGain);
    case 'highlighter': return model.baseWidth;            // 굵기 일정
    case 'eraser':      return model.baseWidth;
    default:            return model.baseWidth;
  }
}

// 스트로크 전체를 부드러운 곡선(중점 이차베지어)으로 렌더해 '각짐'을 없앤다.
//  - 데이터 모델(segs)·동기화는 그대로. 렌더만 부드럽게 → 유실0·리플레이 무손상.
//  - 볼펜·연필·브러쉬만 스무딩(둥근 캡이라 이음새 없음). 형광펜·지우개는 기존 직선 유지
//    (형광펜 납작 캡은 곡선 분할 시 이음새가 생겨서 제외).
export function renderStrokeSmoothed(ctx: CanvasRenderingContext2D, stroke: InkStroke) {
  const segs = stroke.segs;
  if (!segs.length) return;
  if (stroke.penType === 'highlighter' || stroke.penType === 'eraser' || segs.length < 2) {
    for (const s of segs) {
      renderInkSegment(ctx, {
        from: s.from, to: s.to, width: s.width,
        penType: stroke.penType, color: stroke.color, opacity: stroke.opacity,
      });
    }
    return;
  }
  const pts = [segs[0].from, ...segs.map((s) => s.to)];
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = stroke.opacity;
  ctx.strokeStyle = stroke.color;
  // 시작점 → 첫 중점
  const firstMid = mid(pts[0], pts[1]);
  ctx.lineWidth = segs[0].width;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(firstMid.x, firstMid.y);
  ctx.stroke();
  // 중간: 중점 →(control=실제 점)→ 다음 중점, 굵기는 해당 세그먼트
  for (let i = 1; i < pts.length - 1; i++) {
    const m0 = mid(pts[i - 1], pts[i]);
    const m1 = mid(pts[i], pts[i + 1]);
    ctx.lineWidth = segs[i].width;
    ctx.beginPath();
    ctx.moveTo(m0.x, m0.y);
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, m1.x, m1.y);
    ctx.stroke();
  }
  // 마지막 중점 → 끝점
  const n = pts.length - 1;
  const lastMid = mid(pts[n - 1], pts[n]);
  ctx.lineWidth = segs[n - 1].width;
  ctx.beginPath();
  ctx.moveTo(lastMid.x, lastMid.y);
  ctx.lineTo(pts[n].x, pts[n].y);
  ctx.stroke();
  ctx.restore();
}

// 도구별 마우스 커서(SVG 데이터 URI). 십자 대신 실제 펜 굵기/모양을 보여준다.
//  - 볼펜·연필·브러쉬·지우개: 회색 테두리 + 투명 내부의 원
//  - 형광펜: 가로로 길고 세로로 낮은(납작한) 회색 테두리 사각형
// scale = 표시 픽셀 / 캔버스 논리 픽셀 (리사이즈 시 실제 굵기와 커서를 맞춘다).
export function cursorForPen(pen: PenModel, scale = 1): string {
  const gray = '#94a3b8'; // slate-400
  const sw = 1.5;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  if (pen.type === 'highlighter') {
    const w = clamp(pen.baseWidth * scale, 16, 90);
    const h = clamp(pen.baseWidth * scale * 0.5, 6, 26); // 가로 길고 세로 낮게
    const W = Math.round(w + 4), H = Math.round(h + 4);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="2" y="2" width="${Math.round(w)}" height="${Math.round(h)}" rx="2" fill="none" stroke="${gray}" stroke-width="${sw}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(W / 2)} ${Math.round(H / 2)}, crosshair`;
  }
  // 볼펜·연필·브러쉬·지우개 → 원
  const d = clamp(pen.baseWidth * scale, 8, 90);
  const S = Math.round(d + 4);
  const c = Math.round(S / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><circle cx="${c}" cy="${c}" r="${Math.round(d / 2)}" fill="none" stroke="${gray}" stroke-width="${sw}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`;
}

// 펜 종류·필압을 반영해 from→to 한 세그먼트를 그린다 (로컬/원격/리플레이 공용).
export function renderInkSegment(ctx: CanvasRenderingContext2D, seg: InkSegment) {
  ctx.save();
  ctx.lineWidth = seg.width;
  ctx.lineJoin = 'round';

  if (seg.penType === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.moveTo(seg.from.x, seg.from.y);
    ctx.lineTo(seg.to.x, seg.to.y);
    ctx.stroke();
  } else if (seg.penType === 'highlighter') {
    // 형광펜: 납작한 캡 + multiply 합성 + 낮은 알파
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap = 'butt';
    ctx.globalAlpha = seg.opacity;
    ctx.strokeStyle = seg.color;
    ctx.beginPath();
    ctx.moveTo(seg.from.x, seg.from.y);
    ctx.lineTo(seg.to.x, seg.to.y);
    ctx.stroke();
  } else if (seg.penType === 'pencil') {
    // 연필: 낮은 불투명도 + 약간 거친 질감(미세 지터 2회 중첩)
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.globalAlpha = seg.opacity;
    ctx.strokeStyle = seg.color;
    for (let i = 0; i < 2; i++) {
      const j = i === 0 ? 0 : 0.6;
      ctx.beginPath();
      ctx.moveTo(seg.from.x + j, seg.from.y - j);
      ctx.lineTo(seg.to.x + j, seg.to.y - j);
      ctx.stroke();
    }
  } else {
    // 볼펜 / 브러쉬: 불투명 둥근 캡
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.globalAlpha = seg.opacity;
    ctx.strokeStyle = seg.color;
    ctx.beginPath();
    ctx.moveTo(seg.from.x, seg.from.y);
    ctx.lineTo(seg.to.x, seg.to.y);
    ctx.stroke();
  }
  ctx.restore();
}
