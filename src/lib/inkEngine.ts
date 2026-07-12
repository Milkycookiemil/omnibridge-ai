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

// 획에 녹음 시각(t)을 붙이는 연산 — 획↔전사 싱크를 기기 간에 전파(획은 세그먼트로
// 먼저 전달되고, 이 연산이 뒤따라 t를 설정한다).
export interface StrokeTimeOp {
  type: 'stroke_time';
  strokeId: string;
  t: number;
}

// 동기화 채널·CRDT를 흐르는 잉크 이벤트의 합집합
export type InkDelta = InkSegment | EraseStrokesOp | StrokeTimeOp;

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
  t?: number; // 녹음 중 그렸다면 녹음 시작부터의 경과 초(획↔전사 싱크용)
}

// #4 자(직선): 끝점을 45° 배수에 가까우면 스냅한다(반듯한 선·수직·수평·대각).
export function snapLineEnd(start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number } {
  const dx = end.x - start.x, dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { ...end };
  let ang = Math.atan2(dy, dx);
  const step = Math.PI / 4; // 45°
  const snapped = Math.round(ang / step) * step;
  if (Math.abs(ang - snapped) < (12 * Math.PI) / 180) ang = snapped; // 12° 이내면 스냅
  return { x: start.x + Math.cos(ang) * len, y: start.y + Math.sin(ang) * len };
}

// #4 도형 보정: 자유곡선 점들을 직선/타원/사각형으로 인식(없으면 null).
export type RecognizedShape =
  | { kind: 'line'; a: { x: number; y: number }; b: { x: number; y: number } }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | null;

export function recognizeShape(points: { x: number; y: number }[]): RecognizedShape {
  if (points.length < 4) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const w = maxX - minX, h = maxY - minY, diag = Math.hypot(w, h);
  if (diag < 16) return null; // 너무 작은 자국은 보정 안 함
  const start = points[0], end = points[points.length - 1];
  const closeDist = Math.hypot(end.x - start.x, end.y - start.y);
  // 경로 총길이 (직선성·닫힘 판단용)
  let pathLen = 0;
  for (let i = 1; i < points.length; i++) pathLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  const closed = closeDist < diag * 0.22;

  if (!closed) {
    // 직선: start-end 선에서 평균 수직편차가 작고 + 별로 안 꺾임(현/경로길이 ≈ 1)
    let dev = 0;
    for (const p of points) dev += distancePointToSegment(p, start, end);
    dev /= points.length;
    const straightness = Math.hypot(end.x - start.x, end.y - start.y) / (pathLen || 1);
    return (dev < diag * 0.06 && straightness > 0.85) ? { kind: 'line', a: { ...start }, b: { ...end } } : null;
  }

  // 닫힘: 타원 vs 사각형 경계 적합 오차 비교 + 수용 임계(어느 것도 안 맞으면 보정 안 함)
  const cx = minX + w / 2, cy = minY + h / 2, rx = w / 2 || 1, ry = h / 2 || 1;
  let ellErr = 0, rectErr = 0;
  for (const p of points) {
    ellErr += Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1);
    const dmin = Math.min(Math.abs(p.x - minX), Math.abs(p.x - maxX), Math.abs(p.y - minY), Math.abs(p.y - maxY));
    rectErr += dmin / diag;
  }
  ellErr /= points.length; rectErr /= points.length;
  // 타원·사각형 각각 수용 임계(삼각형·낙서는 둘 다 못 넘어 null). 둘 다 넘으면 오차 작은 쪽.
  const ellOk = ellErr < 0.10, rectOk = rectErr < 0.06;
  if (!ellOk && !rectOk) return null;
  if (ellOk && (!rectOk || ellErr <= rectErr)) return { kind: 'ellipse', cx, cy, rx, ry };
  return { kind: 'rect', x: minX, y: minY, w, h };
}

// 인식된 도형을 폴리라인 점들로 변환(스트로크 세그먼트 생성용).
export function shapeToPoints(shape: NonNullable<RecognizedShape>): { x: number; y: number }[] {
  if (shape.kind === 'line') return [shape.a, shape.b];
  if (shape.kind === 'rect') {
    const { x, y, w, h } = shape;
    return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }];
  }
  const out: { x: number; y: number }[] = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    out.push({ x: shape.cx + Math.cos(t) * shape.rx, y: shape.cy + Math.sin(t) * shape.ry });
  }
  return out;
}

// 점이 다각형(올가미 경로) 안에 있는지 — 레이 캐스팅.
export function pointInPolygon(pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// 스트로크의 모든 점을 순회 (from + 각 to). 바운딩·히트테스트 공용.
export function strokePoints(stroke: InkStroke): { x: number; y: number }[] {
  if (!stroke.segs.length) return [];
  return [stroke.segs[0].from, ...stroke.segs.map((s) => s.to)];
}

// 스트로크 바운딩 박스 (굵기 반영). 빈 스트로크는 null.
export function strokeBounds(stroke: InkStroke): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const pts = strokePoints(stroke);
  if (!pts.length) return null;
  const halfMax = Math.max(...stroke.segs.map((s) => s.width)) / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX - halfMax, minY: minY - halfMax, maxX: maxX + halfMax, maxY: maxY + halfMax };
}

// 스트로크를 평행이동한 새 스트로크(깊은 복사, 새 id는 호출측에서 부여).
export function translateStroke(stroke: InkStroke, dx: number, dy: number): InkStroke {
  return {
    ...stroke,
    segs: stroke.segs.map((s) => ({
      from: { x: s.from.x + dx, y: s.from.y + dy },
      to: { x: s.to.x + dx, y: s.to.y + dy },
      width: s.width,
    })),
  };
}

// 앵커(ax,ay) 기준으로 (sx,sy)배 확대/축소한 새 스트로크. 굵기는 평균 배율로.
export function scaleStroke(stroke: InkStroke, ax: number, ay: number, sx: number, sy: number): InkStroke {
  const ws = (Math.abs(sx) + Math.abs(sy)) / 2;
  const tp = (p: { x: number; y: number }) => ({ x: ax + (p.x - ax) * sx, y: ay + (p.y - ay) * sy });
  return {
    ...stroke,
    segs: stroke.segs.map((s) => ({ from: tp(s.from), to: tp(s.to), width: Math.max(0.5, s.width * ws) })),
  };
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
// InkStroke(빈 노트)·PageStroke(PDF, 픽셀 환산) 양쪽이 만족하는 구조적 서브셋을 받는다.
type SmoothStrokeLike = {
  segs: { from: { x: number; y: number }; to: { x: number; y: number }; width: number }[];
  penType: PenType; color: string; opacity: number;
};
export function renderStrokeSmoothed(ctx: CanvasRenderingContext2D, stroke: SmoothStrokeLike) {
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
