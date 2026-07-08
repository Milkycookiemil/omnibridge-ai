// src/components/ink/InkCanvas.tsx
// 재사용 가능한 필기 캔버스. 빈 노트·캡쳐 슬라이드 위에 공용으로 그린다.
//
// 스트로크 저장 모델 (#5 레이어 / #7 획 지우개의 기반):
//  - 모든 획을 InkStroke 객체(세그먼트 배열)로 보관하고,
//  - 레이어마다 오프스크린 캔버스를 두어 표시 캔버스에 순서대로 합성한다(포토샵 방식).
//  - 영역 지우개(destination-out)는 활성 레이어에만 적용되고,
//  - 획 지우개는 히트테스트로 스트로크를 통째 삭제한 뒤 해당 레이어만 재렌더한다.
//
// 동기화: 로컬 입력은 onDelta로 세그먼트(strokeId/layerId 포함)·erase_strokes 연산을 내보내고,
// 원격/리플레이는 ref.applyDelta로 동일 경로를 타므로 미러링·유실0 리플레이가 그대로 유지된다.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  renderInkSegment, widthForPressure, distancePointToSegment,
  type InkDelta, type InkSegment, type InkStroke, type InkLayer, type PenModel,
} from '../../lib/inkEngine';
import { LayerPanel } from './LayerPanel';

const genId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const DEFAULT_LAYER: InkLayer = { id: 'layer-1', name: '레이어 1', visible: true };

export interface InkCanvasHandle {
  applyDelta: (delta: InkDelta) => void; // 원격/리플레이 델타 반영
  clear: () => void;
  exportPng: () => string | null;        // 합성 결과 (A-3 슬라이드 저장용)
  getCanvas: () => HTMLCanvasElement | null;
}

interface InkCanvasProps {
  pen: PenModel;
  width?: number;
  height?: number;
  className?: string;
  backgroundStyle?: React.CSSProperties; // 종이 격자/괘선 등
  backgroundImage?: string;              // 슬라이드 배경
  onDelta?: (delta: InkDelta) => void;
  showLayers?: boolean;                  // 레이어 패널 표시 여부
}

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(
  { pen, width = 800, height = 800, className, backgroundStyle, backgroundImage, onDelta, showLayers = false },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- 모델 (렌더와 무관한 데이터는 ref로: 포인터 이벤트 중 리렌더 방지) ---
  const strokesRef = useRef<Map<string, InkStroke>>(new Map());
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // 레이어 목록/활성은 패널 UI가 필요하므로 state + 동기 ref 미러
  const [layers, setLayers] = useState<InkLayer[]>([{ ...DEFAULT_LAYER }]);
  const [activeLayerId, setActiveLayerId] = useState(DEFAULT_LAYER.id);
  const layersRef = useRef<InkLayer[]>([{ ...DEFAULT_LAYER }]);
  const activeLayerRef = useRef(DEFAULT_LAYER.id);

  const updateLayers = (updater: (prev: InkLayer[]) => InkLayer[]) => {
    layersRef.current = updater(layersRef.current);
    setLayers(layersRef.current);
  };
  const setActive = (id: string) => {
    activeLayerRef.current = id;
    setActiveLayerId(id);
  };

  // --- 드로잉 진행 상태 ---
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const currentStrokeIdRef = useRef<string | null>(null);

  // --- 레이어 오프스크린 캔버스 ---
  const getLayerCanvas = (layerId: string): HTMLCanvasElement => {
    let c = layerCanvasesRef.current.get(layerId);
    if (!c) {
      c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      layerCanvasesRef.current.set(layerId, c);
    }
    return c;
  };

  // 표시 캔버스 = 보이는 레이어들을 순서대로 합성
  const composite = () => {
    const main = canvasRef.current;
    const ctx = main?.getContext('2d');
    if (!main || !ctx) return;
    ctx.clearRect(0, 0, main.width, main.height);
    for (const layer of layersRef.current) {
      if (!layer.visible) continue;
      const lc = layerCanvasesRef.current.get(layer.id);
      if (lc) ctx.drawImage(lc, 0, 0);
    }
  };

  // 한 레이어를 스트로크 모델에서 처음부터 재렌더 (획 삭제·리사이즈 후)
  const rebuildLayer = (layerId: string) => {
    const lc = getLayerCanvas(layerId);
    const ctx = lc.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, lc.width, lc.height);
    for (const stroke of strokesRef.current.values()) {
      if (stroke.layerId !== layerId) continue;
      for (const s of stroke.segs) {
        renderInkSegment(ctx, {
          from: s.from, to: s.to, width: s.width,
          penType: stroke.penType, color: stroke.color, opacity: stroke.opacity,
        });
      }
    }
  };

  // 원격 델타가 모르는 레이어를 가리키면 생성 (기기 간 레이어 자동 전파)
  const ensureLayer = (layerId: string) => {
    if (layersRef.current.some((l) => l.id === layerId)) return;
    updateLayers((prev) => [...prev, { id: layerId, name: `레이어 ${prev.length + 1}`, visible: true }]);
  };

  // --- 델타 적용 (로컬/원격/리플레이 공용 경로) ---
  const applyDelta = (delta: InkDelta) => {
    if ('from' in delta) {
      const layerId = delta.layerId ?? layersRef.current[0]?.id ?? DEFAULT_LAYER.id;
      if (delta.layerId) ensureLayer(delta.layerId);
      const strokeId = delta.strokeId ?? genId();
      let stroke = strokesRef.current.get(strokeId);
      if (!stroke) {
        stroke = { id: strokeId, layerId, penType: delta.penType, color: delta.color, opacity: delta.opacity, segs: [] };
        strokesRef.current.set(strokeId, stroke);
      }
      stroke.segs.push({ from: delta.from, to: delta.to, width: delta.width });
      const ctx = getLayerCanvas(stroke.layerId).getContext('2d');
      if (ctx) renderInkSegment(ctx, delta);
      composite();
    } else if (delta.type === 'erase_strokes') {
      const affectedLayers = new Set<string>();
      for (const id of delta.strokeIds) {
        const st = strokesRef.current.get(id);
        if (st) {
          affectedLayers.add(st.layerId);
          strokesRef.current.delete(id);
        }
      }
      affectedLayers.forEach(rebuildLayer);
      composite();
    }
  };

  // --- 획 지우개: 히트테스트 → 스트로크 통째 삭제 ---
  const eraseStrokesAt = (p: { x: number; y: number }) => {
    const threshold = Math.max(pen.baseWidth, 12);
    const hit: string[] = [];
    for (const stroke of strokesRef.current.values()) {
      // 활성 레이어의 실제 잉크만 대상 (영역 지우개 자국은 히트 제외)
      if (stroke.layerId !== activeLayerRef.current || stroke.penType === 'eraser') continue;
      for (const s of stroke.segs) {
        if (distancePointToSegment(p, s.from, s.to) <= threshold + s.width / 2) {
          hit.push(stroke.id);
          break;
        }
      }
    }
    if (hit.length > 0) {
      const op: InkDelta = { type: 'erase_strokes', strokeIds: hit };
      applyDelta(op);
      onDelta?.(op);
    }
  };

  // --- 레이어 조작 (패널 콜백) ---
  const addLayer = () => {
    const id = genId();
    updateLayers((prev) => [...prev, { id, name: `레이어 ${prev.length + 1}`, visible: true }]);
    setActive(id);
    composite();
  };

  const removeLayer = (id: string) => {
    if (layersRef.current.length <= 1) return;
    // 해당 레이어의 스트로크는 삭제 연산으로 전파 (원격도 함께 지워짐)
    const ids = [...strokesRef.current.values()].filter((s) => s.layerId === id).map((s) => s.id);
    ids.forEach((sid) => strokesRef.current.delete(sid));
    layerCanvasesRef.current.delete(id);
    updateLayers((prev) => prev.filter((l) => l.id !== id));
    if (activeLayerRef.current === id) {
      setActive(layersRef.current[layersRef.current.length - 1].id);
    }
    composite();
    if (ids.length > 0) onDelta?.({ type: 'erase_strokes', strokeIds: ids });
  };

  const toggleLayerVisible = (id: string) => {
    updateLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
    composite();
  };

  useImperativeHandle(ref, () => ({
    applyDelta,
    clear: () => {
      strokesRef.current.clear();
      layerCanvasesRef.current.forEach((c) => c.getContext('2d')?.clearRect(0, 0, c.width, c.height));
      composite();
    },
    exportPng: () => canvasRef.current?.toDataURL('image/png') ?? null,
    getCanvas: () => canvasRef.current,
  }));

  // 크기 변경 시 오프스크린 재생성 + 모델에서 재렌더 (내용 유실 없음)
  useEffect(() => {
    layerCanvasesRef.current.forEach((c) => {
      c.width = width;
      c.height = height;
    });
    layersRef.current.forEach((l) => rebuildLayer(l.id));
    composite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // --- 포인터 입력 ---
  const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const isStrokeEraser = () => pen.type === 'eraser' && (pen.eraserMode ?? 'area') === 'stroke';

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    drawingRef.current = true;
    const pt = toCanvasCoords(e);
    if (isStrokeEraser()) {
      eraseStrokesAt(pt);
      return;
    }
    lastRef.current = pt;
    currentStrokeIdRef.current = genId();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const to = toCanvasCoords(e);

    if (isStrokeEraser()) {
      eraseStrokesAt(to);
      return;
    }

    const from = lastRef.current;
    if (!from) { lastRef.current = to; return; }

    // 마우스는 pressure=0 → inkEngine에서 0.5로 폴백. 펜은 실제 필압 사용.
    const seg: InkSegment = {
      from, to,
      penType: pen.type,
      color: pen.color,
      width: widthForPressure(pen, e.pressure),
      opacity: pen.opacity,
      strokeId: currentStrokeIdRef.current ?? genId(),
      layerId: activeLayerRef.current,
    };
    applyDelta(seg);      // 로컬도 원격과 같은 경로로 모델에 반영
    lastRef.current = to;
    onDelta?.(seg);       // 실시간 릴레이(strokeId/layerId 포함)
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastRef.current = null;
    currentStrokeIdRef.current = null;
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
      {showLayers && (
        <LayerPanel
          layers={layers}
          activeLayerId={activeLayerId}
          onAdd={addLayer}
          onRemove={removeLayer}
          onToggleVisible={toggleLayerVisible}
          onSelect={setActive}
        />
      )}
    </div>
  );
});
