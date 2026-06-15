// src/components/ink/InkCanvas.tsx
// 재사용 가능한 필기 캔버스. 빈 노트·PDF·캡쳐 슬라이드 위에 공용으로 그린다.
// - pointer 이벤트로 e.pressure(S펜/애플펜슬 필압)·e.pointerType 수집
// - 펜 종류별 렌더는 inkEngine에 위임
// - 부모는 onSegment로 각 세그먼트를 받아 동기화에 흘려보낸다
// - ref(InkCanvasHandle)로 원격/리플레이 세그먼트 주입·초기화·PNG 추출
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { renderInkSegment, widthForPressure, type InkSegment, type PenModel } from '../../lib/inkEngine';

export interface InkCanvasHandle {
  drawSegment: (seg: InkSegment) => void; // 외부(원격/리플레이) 세그먼트 렌더
  clear: () => void;
  exportPng: () => string | null;         // 합성 저장용 (A-3)
  getCanvas: () => HTMLCanvasElement | null;
}

interface InkCanvasProps {
  pen: PenModel;
  width?: number;
  height?: number;
  className?: string;
  backgroundStyle?: React.CSSProperties; // 종이 격자/괘선 등
  backgroundImage?: string;              // 슬라이드/PDF 페이지 배경
  onSegment?: (seg: InkSegment) => void;
}

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(
  { pen, width = 800, height = 800, className, backgroundStyle, backgroundImage, onSegment },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  useImperativeHandle(ref, () => ({
    drawSegment: (seg) => {
      const ctx = getCtx();
      if (ctx) renderInkSegment(ctx, seg);
    },
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    exportPng: () => canvasRef.current?.toDataURL('image/png') ?? null,
    getCanvas: () => canvasRef.current,
  }));

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    drawingRef.current = true;
    lastRef.current = toCanvasCoords(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const from = lastRef.current;
    const to = toCanvasCoords(e);
    if (!from) { lastRef.current = to; return; }

    // 마우스는 pressure=0 → inkEngine에서 0.5로 폴백. 펜은 실제 필압 사용.
    const width = widthForPressure(pen, e.pressure);
    const seg: InkSegment = {
      from, to,
      penType: pen.type,
      color: pen.color,
      width,
      opacity: pen.opacity,
    };
    const ctx = getCtx();
    if (ctx) renderInkSegment(ctx, seg);
    lastRef.current = to;
    onSegment?.(seg);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  return (
    <div className={`relative ${className ?? ''}`}>
      {backgroundImage && (
        <img
          src={backgroundImage}
          alt="필기 배경"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
      )}
      {backgroundStyle && <div className="absolute inset-0 pointer-events-none" style={backgroundStyle} />}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="absolute inset-0 w-full h-full touch-none cursor-crosshair z-10"
      />
    </div>
  );
});
