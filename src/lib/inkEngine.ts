// src/lib/inkEngine.ts
// 펜 종류별 렌더링 + 필압→굵기 매핑 엔진.
// InkCanvas(빈 노트·PDF·캡쳐 슬라이드 공용)와 동기화 양쪽에서 이 한 벌을 사용한다.

export type PenType = 'pen' | 'pencil' | 'brush' | 'highlighter' | 'eraser';

// 펜 한 자루의 설정. 필압 감도(pressureGain)는 팝오버 슬라이더로 조절된다.
export interface PenModel {
  type: PenType;
  color: string;
  baseWidth: number;
  pressureGain: number; // 클수록 약한 힘에도 굵게
  opacity: number;
}

// 실시간 릴레이·CRDT·렌더에 공통으로 흐르는 잉크 세그먼트 (최소 단위 = 델타 청크).
// 굵기는 필압이 반영된 최종 값으로 저장해 원격/리플레이에서 동일하게 재현한다.
export interface InkSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
  penType: PenType;
  color: string;
  width: number;
  opacity: number;
}

export const PEN_COLORS = ['#334155', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'];
// 형광펜은 형광 계열로 제한
export const HIGHLIGHTER_COLORS = ['#fde047', '#86efac', '#fca5a5', '#93c5fd', '#f0abfc'];

export const DEFAULT_PENS: Record<PenType, PenModel> = {
  pen:         { type: 'pen',         color: '#334155', baseWidth: 3,  pressureGain: 1.0, opacity: 1 },
  pencil:      { type: 'pencil',      color: '#475569', baseWidth: 2.5, pressureGain: 0.6, opacity: 0.55 },
  brush:       { type: 'brush',       color: '#334155', baseWidth: 5,  pressureGain: 2.2, opacity: 1 },
  highlighter: { type: 'highlighter', color: '#fde047', baseWidth: 18, pressureGain: 0,   opacity: 0.30 },
  eraser:      { type: 'eraser',      color: '#000000', baseWidth: 22, pressureGain: 0,   opacity: 1 },
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
