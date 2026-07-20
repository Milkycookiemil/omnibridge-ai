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
import { Copy, Trash2, Minus, Plus } from 'lucide-react';
import {
  renderInkSegment, renderStrokeSmoothed, widthForPressure, distancePointToSegment, cursorForPen,
  pointInPolygon, strokePoints, strokeBounds, translateStroke, scaleStroke,
  snapLineEnd, recognizeShape, shapeToPoints,
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
  exportStrokes: () => InkStroke[];      // 노트 영속 저장용 스냅샷
  loadStrokes: (strokes: InkStroke[]) => void; // 저장된 노트 불러오기
  undo: () => void;                      // #3 실행취소
  redo: () => void;                      // #3 다시실행
  highlightByTime: (sec: number, windowSec?: number) => number; // P1 전사→획 하이라이트(맞은 획 수 반환)
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
  selectMode?: boolean;                  // 올가미 선택 모드(그리기 대신 선택/변형)
  straightLine?: boolean;                // #4 자: 직선 모드
  shapeMode?: boolean;                   // #4 도형 보정 모드
  onHistoryChange?: (s: { canUndo: boolean; canRedo: boolean }) => void; // #3 버튼 활성화용
  strokeTime?: () => number | undefined; // P1 녹음 중이면 획에 찍을 경과 초, 아니면 undefined
  onStrokeTap?: (t: number) => void;     // P1 역방향: 선택 모드에서 시각 있는 획 탭 → 전사로 점프
}

type SelBox = { x: number; y: number; w: number; h: number };
type Selection = { ids: string[]; box: SelBox };
type DragState =
  | { mode: 'lasso' }
  | { mode: 'move'; start: { x: number; y: number }; baseBox: SelBox }
  | { mode: 'scale'; anchor: { x: number; y: number }; baseBox: SelBox };

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(
  { pen, width = 800, height = 800, className, backgroundStyle, backgroundImage, onDelta, showLayers = false, selectMode = false, straightLine = false, shapeMode = false, onHistoryChange, strokeTime, onStrokeTap },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // 표시 스케일(표시 px / 캔버스 논리 px) — 커서 굵기를 실제 렌더 굵기와 맞춘다.
  const [dispScale, setDispScale] = useState(1);
  // 고정 비율 페이지 크기(화면 맞춤=100% 기준)·컨테이너 내 오프셋(px).
  const [page, setPage] = useState({ w: 0, h: 0, offX: 0, offY: 0 });
  // 확대/축소 배율. 1 = 100%(화면 맞춤). 25%~400% 범위. 확대 시 페이지 박스가 커지고 스크롤된다.
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 0.25, ZOOM_MAX = 4;
  const setZoomClamped = (z: number | ((p: number) => number)) =>
    setZoom((prev) => {
      const next = typeof z === 'function' ? z(prev) : z;
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
    });

  // P1 전사→획 하이라이트 박스(잠깐 반짝이고 사라짐)
  const [highlightBox, setHighlightBox] = useState<SelBox | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- 올가미 선택 상태 ---
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const previewRef = useRef<null | { kind: 'move'; dx: number; dy: number } | { kind: 'scale'; ax: number; ay: number; sx: number; sy: number }>(null);
  const dragRef = useRef<DragState | null>(null);
  const lassoRef = useRef<{ x: number; y: number }[] | null>(null);
  const applySelection = (s: Selection | null) => { selectionRef.current = s; selectedIdsRef.current = new Set(s?.ids ?? []); setSelection(s); };

  // --- #3 실행취소/다시실행 히스토리 ---
  // 각 사용자 동작을 {removed, added}로 기록 → 취소=added 제거+removed 복원, 재실행=반대.
  type UndoEntry = { removed: InkStroke[]; added: InkStroke[] };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const pendingEraseRef = useRef<InkStroke[]>([]); // 획 지우개 드래그 누적(한 번에 취소)
  const deepStroke = (st: InkStroke): InkStroke => ({ ...st, segs: st.segs.map((s) => ({ from: { ...s.from }, to: { ...s.to }, width: s.width })) });
  const notifyHistory = () => onHistoryChange?.({ canUndo: undoStackRef.current.length > 0, canRedo: redoStackRef.current.length > 0 });
  const pushUndo = (entry: UndoEntry) => {
    if (!entry.removed.length && !entry.added.length) return;
    undoStackRef.current.push(entry);
    redoStackRef.current = [];
    notifyHistory();
  };

  // --- 드로잉 진행 상태 ---
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const currentStrokeIdRef = useRef<string | null>(null);
  const gestureRef = useRef<{ x: number; y: number }[] | null>(null); // #4 자/도형 제스처 점들

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
    const pv = previewRef.current;
    for (const stroke of strokesRef.current.values()) {
      if (stroke.layerId !== layerId) continue;
      // 이동/크기 조절 중인 선택 획은 변형본으로 미리보기(저장 데이터는 불변).
      let s = stroke;
      if (pv && selectedIdsRef.current.has(stroke.id)) {
        s = pv.kind === 'move' ? translateStroke(stroke, pv.dx, pv.dy) : scaleStroke(stroke, pv.ax, pv.ay, pv.sx, pv.sy);
      }
      renderStrokeSmoothed(ctx, s); // 완성된 획은 부드러운 곡선으로 재렌더
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
    } else if (delta.type === 'stroke_time') {
      // 원격/리플레이: 이미 존재하는 획에 녹음 시각을 설정(획↔전사 싱크 전파)
      const st = strokesRef.current.get(delta.strokeId);
      if (st) st.t = delta.t;
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
      // undo용: 지워진 획 원본을 드래그 동안 누적(pointerup에서 한 번에 기록)
      for (const id of hit) { const st = strokesRef.current.get(id); if (st) pendingEraseRef.current.push(deepStroke(st)); }
      const op: InkDelta = { type: 'erase_strokes', strokeIds: hit };
      applyDelta(op);
      onDelta?.(op);
    }
  };

  // 옛 획 제거 + 새 획 추가 (로컬 즉시 + 원격: 삭제 + 세그먼트 재추가). undo 기록은 호출측.
  const applyStrokeReplaceCore = (removeIds: string[], addStrokes: InkStroke[]) => {
    const affected = new Set<string>();
    for (const id of removeIds) { const st = strokesRef.current.get(id); if (st) affected.add(st.layerId); strokesRef.current.delete(id); }
    for (const st of addStrokes) { strokesRef.current.set(st.id, st); affected.add(st.layerId); }
    previewRef.current = null;
    affected.forEach(rebuildLayer); composite();
    if (removeIds.length) onDelta?.({ type: 'erase_strokes', strokeIds: removeIds });
    for (const st of addStrokes) for (const s of st.segs) onDelta?.({ from: s.from, to: s.to, width: s.width, penType: st.penType, color: st.color, opacity: st.opacity, strokeId: st.id, layerId: st.layerId });
  };

  const undo = () => {
    const e = undoStackRef.current.pop(); if (!e) return;
    applyStrokeReplaceCore(e.added.map((s) => s.id), e.removed.map(deepStroke));
    applySelection(null);
    redoStackRef.current.push(e); notifyHistory();
  };
  const redo = () => {
    const e = redoStackRef.current.pop(); if (!e) return;
    applyStrokeReplaceCore(e.removed.map((s) => s.id), e.added.map(deepStroke));
    applySelection(null);
    undoStackRef.current.push(e); notifyHistory();
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
    undo,
    redo,
    // P1: 주어진 시각(초) 근처에 그린 획들의 영역을 잠깐 하이라이트. 맞은 획 수 반환.
    highlightByTime: (sec: number, windowSec = 6) => {
      const matches = [...strokesRef.current.values()].filter((st) => st.t !== undefined && Math.abs((st.t as number) - sec) <= windowSec);
      if (!matches.length) { setHighlightBox(null); return 0; }
      const box = boxOfStrokes(matches);
      if (box) {
        setHighlightBox(box);
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setHighlightBox(null), 1800);
      }
      return matches.length;
    },
    clear: () => {
      strokesRef.current.clear();
      layerCanvasesRef.current.forEach((c) => c.getContext('2d')?.clearRect(0, 0, c.width, c.height));
      undoStackRef.current = []; redoStackRef.current = []; notifyHistory();
      applySelection(null);
      composite();
    },
    exportPng: () => canvasRef.current?.toDataURL('image/png') ?? null,
    getCanvas: () => canvasRef.current,
    // 스트로크 모델 스냅샷(깊은 복사) — 저장 후 외부 변형이 캔버스에 영향 없게.
    exportStrokes: () =>
      [...strokesRef.current.values()].map((st) => ({
        ...st,
        segs: st.segs.map((s) => ({ from: { ...s.from }, to: { ...s.to }, width: s.width })),
      })),
    // 저장된 스트로크로 캔버스 복원: 초기화 → 레이어 보장 → 모델 주입 → 재렌더.
    loadStrokes: (strokes: InkStroke[]) => {
      strokesRef.current.clear();
      layerCanvasesRef.current.forEach((c) => c.getContext('2d')?.clearRect(0, 0, c.width, c.height));
      for (const st of strokes) {
        ensureLayer(st.layerId);
        strokesRef.current.set(st.id, {
          ...st,
          segs: st.segs.map((s) => ({ from: { ...s.from }, to: { ...s.to }, width: s.width })),
        });
      }
      layersRef.current.forEach((l) => rebuildLayer(l.id));
      undoStackRef.current = []; redoStackRef.current = []; notifyHistory();
      applySelection(null);
      composite();
    },
  }));

  // 컨테이너에 고정 비율 페이지를 균일 축소로 맞춘다(찌그러짐 0) + 커서 스케일 갱신.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const aspect = width / height;
    const measure = () => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      let pw = cw, ph = cw / aspect;
      if (ph > ch) { ph = ch; pw = ch * aspect; } // 세로가 넘치면 높이에 맞춤
      setPage({ w: pw, h: ph, offX: (cw - pw) / 2, offY: (ch - ph) / 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  // 표시 스케일 = 화면맞춤 스케일 × 줌. 오버레이·커서·올가미가 모두 이 값을 쓴다.
  useEffect(() => {
    setDispScale((page.w ? page.w / width : 1) * zoom);
  }, [page.w, zoom, width]);

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

  // 선택 모드를 끄면 선택·프리뷰·올가미 경로를 정리한다.
  useEffect(() => {
    if (!selectMode) {
      previewRef.current = null; dragRef.current = null; lassoRef.current = null;
      if (selectionRef.current) { selectionRef.current = null; selectedIdsRef.current = new Set(); setSelection(null); }
      layersRef.current.forEach((l) => rebuildLayer(l.id));
      composite();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode]);

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

  // ===== 올가미 선택/변형 =====
  const emitStrokeSegs = (st: InkStroke) => {
    for (const s of st.segs) {
      onDelta?.({ from: s.from, to: s.to, width: s.width, penType: st.penType, color: st.color, opacity: st.opacity, strokeId: st.id, layerId: st.layerId });
    }
  };
  const boxOfStrokes = (strokes: InkStroke[]): SelBox | null => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const st of strokes) {
      const b = strokeBounds(st); if (!b) continue;
      if (b.minX < minX) minX = b.minX; if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX; if (b.maxY > maxY) maxY = b.maxY;
    }
    return isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
  };
  const getStrokes = (ids: string[]) => ids.map((id) => strokesRef.current.get(id)).filter(Boolean) as InkStroke[];
  // 옛 스트로크 → 새 스트로크 교체 (유실0 동기화 + #3 undo 기록).
  const replaceStrokes = (oldIds: string[], newStrokes: InkStroke[]) => {
    const removed = getStrokes(oldIds).map(deepStroke);
    applyStrokeReplaceCore(oldIds, newStrokes);
    pushUndo({ removed, added: newStrokes.map(deepStroke) });
  };
  const deleteSelection = () => {
    const ids = [...selectedIdsRef.current]; if (!ids.length) return;
    const removed = getStrokes(ids).map(deepStroke);
    applyStrokeReplaceCore(ids, []);
    pushUndo({ removed, added: [] });
    applySelection(null);
  };
  const duplicateSelection = () => {
    const src = getStrokes([...selectedIdsRef.current]); if (!src.length) return;
    const copies = src.map((st) => ({ ...translateStroke(st, 24, 24), id: genId() }));
    for (const st of copies) strokesRef.current.set(st.id, st);
    rebuildLayer(activeLayerRef.current); composite();
    for (const st of copies) emitStrokeSegs(st);
    pushUndo({ removed: [], added: copies.map(deepStroke) });
    const box = boxOfStrokes(copies);
    if (box) applySelection({ ids: copies.map((s) => s.id), box });
  };
  const recolorSelection = (color: string) => {
    const src = getStrokes([...selectedIdsRef.current]); if (!src.length) return;
    const oldIds = src.map((s) => s.id);
    const news = src.map((st) => ({ ...translateStroke(st, 0, 0), id: genId(), color }));
    replaceStrokes(oldIds, news);
    const box = boxOfStrokes(news);
    applySelection(box ? { ids: news.map((s) => s.id), box } : null);
  };

  const HANDLE_HIT = 16; // 리사이즈 핸들 히트 반경(표시 px)
  const drawLasso = () => {
    composite();
    const ctx = canvasRef.current?.getContext('2d');
    const pts = lassoRef.current;
    if (!ctx || !pts || pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5 / dispScale;
    ctx.setLineDash([6 / dispScale, 4 / dispScale]);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke(); ctx.restore();
  };
  const handleSelectDown = (pt: { x: number; y: number }) => {
    const sel = selectionRef.current;
    if (sel) {
      const hitR = HANDLE_HIT / dispScale;
      const cx = sel.box.x + sel.box.w, cy = sel.box.y + sel.box.h;
      if (Math.abs(pt.x - cx) <= hitR && Math.abs(pt.y - cy) <= hitR) {
        dragRef.current = { mode: 'scale', anchor: { x: sel.box.x, y: sel.box.y }, baseBox: { ...sel.box } }; return;
      }
      if (pt.x >= sel.box.x && pt.x <= cx && pt.y >= sel.box.y && pt.y <= cy) {
        dragRef.current = { mode: 'move', start: pt, baseBox: { ...sel.box } }; return;
      }
    }
    dragRef.current = { mode: 'lasso' }; lassoRef.current = [pt]; applySelection(null);
  };
  const handleSelectMove = (pt: { x: number; y: number }) => {
    const d = dragRef.current; if (!d) return;
    if (d.mode === 'lasso') { lassoRef.current?.push(pt); drawLasso(); return; }
    if (d.mode === 'move') {
      const dx = pt.x - d.start.x, dy = pt.y - d.start.y;
      previewRef.current = { kind: 'move', dx, dy };
      rebuildLayer(activeLayerRef.current); composite();
      setSelection((s) => s ? { ...s, box: { x: d.baseBox.x + dx, y: d.baseBox.y + dy, w: d.baseBox.w, h: d.baseBox.h } } : s);
      return;
    }
    if (d.mode === 'scale') {
      const minSize = 8 / dispScale;
      const sx = Math.max(pt.x - d.anchor.x, minSize) / d.baseBox.w;
      const sy = Math.max(pt.y - d.anchor.y, minSize) / d.baseBox.h;
      previewRef.current = { kind: 'scale', ax: d.anchor.x, ay: d.anchor.y, sx, sy };
      rebuildLayer(activeLayerRef.current); composite();
      setSelection((s) => s ? { ...s, box: { x: d.anchor.x, y: d.anchor.y, w: d.baseBox.w * sx, h: d.baseBox.h * sy } } : s);
      return;
    }
  };
  const handleSelectUp = () => {
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    if (d.mode === 'lasso') {
      const poly = lassoRef.current ?? []; lassoRef.current = null;
      if (poly.length < 3) {
        // 탭(드래그 없음): 활성 레이어에서 시각(t) 있는 획을 짚으면 전사로 점프
        const tap = poly[0];
        if (tap && onStrokeTap) {
          const thr = 14;
          let hitT: number | undefined;
          for (const st of strokesRef.current.values()) {
            if (st.layerId !== activeLayerRef.current || st.t === undefined || st.penType === 'eraser') continue;
            if (st.segs.some((s) => distancePointToSegment(tap, s.from, s.to) <= thr + s.width / 2)) hitT = st.t; // 위 획 우선
          }
          if (hitT !== undefined) { onStrokeTap(hitT); }
        }
        composite(); return;
      }
      const ids: string[] = [];
      for (const st of strokesRef.current.values()) {
        if (st.layerId !== activeLayerRef.current) continue;
        const pts = strokePoints(st); if (!pts.length) continue;
        let inside = 0;
        for (const p of pts) if (pointInPolygon(p, poly)) inside++;
        if (inside >= pts.length / 2) ids.push(st.id);
      }
      const box = ids.length ? boxOfStrokes(getStrokes(ids)) : null;
      applySelection(box ? { ids, box } : null);
      composite();
      return;
    }
    const pv = previewRef.current; previewRef.current = null;
    if (!pv) { rebuildLayer(activeLayerRef.current); composite(); return; }
    const src = getStrokes([...selectedIdsRef.current]);
    const oldIds = src.map((s) => s.id);
    const news = src.map((st) => ({
      ...(pv.kind === 'move' ? translateStroke(st, pv.dx, pv.dy) : scaleStroke(st, pv.ax, pv.ay, pv.sx, pv.sy)),
      id: genId(),
    }));
    replaceStrokes(oldIds, news);
    const box = boxOfStrokes(news);
    applySelection(box ? { ids: news.map((s) => s.id), box } : null);
  };

  // ===== #4 자(직선)/도형 보정 제스처 (놓을 때 한 번에 확정) =====
  const isGesture = () => (straightLine || shapeMode) && pen.type !== 'eraser';
  const buildStrokeFromPoints = (pts: { x: number; y: number }[]): InkStroke | null => {
    if (pts.length < 2) return null;
    const w = widthForPressure(pen, 0.5);
    const segs = [];
    for (let i = 1; i < pts.length; i++) segs.push({ from: { ...pts[i - 1] }, to: { ...pts[i] }, width: w });
    return { id: genId(), layerId: activeLayerRef.current, penType: pen.type, color: pen.color, opacity: pen.opacity, segs };
  };
  const commitGestureStroke = (stroke: InkStroke) => {
    const t = strokeTime?.(); if (t !== undefined) stroke.t = t;
    strokesRef.current.set(stroke.id, stroke);
    rebuildLayer(stroke.layerId); composite();
    for (const s of stroke.segs) onDelta?.({ from: s.from, to: s.to, width: s.width, penType: stroke.penType, color: stroke.color, opacity: stroke.opacity, strokeId: stroke.id, layerId: stroke.layerId });
    if (t !== undefined) onDelta?.({ type: 'stroke_time', strokeId: stroke.id, t }); // 원격에도 시각 전파
    pushUndo({ removed: [], added: [deepStroke(stroke)] });
  };
  const drawGesturePreview = () => {
    composite();
    const ctx = canvasRef.current?.getContext('2d'); const pts = gestureRef.current;
    if (!ctx || !pts || pts.length < 1) return;
    ctx.save();
    ctx.globalAlpha = pen.opacity; ctx.strokeStyle = pen.color; ctx.lineWidth = widthForPressure(pen, 0.5);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (straightLine) {
      const a = pts[0], b = snapLineEnd(a, pts[pts.length - 1]);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    } else {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke(); ctx.restore();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const pt = toCanvasCoords(e);
    if (selectMode) { handleSelectDown(pt); return; }
    drawingRef.current = true;
    if (isGesture()) { gestureRef.current = [pt]; return; }
    if (isStrokeEraser()) {
      eraseStrokesAt(pt);
      return;
    }
    lastRef.current = pt;
    currentStrokeIdRef.current = genId();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (selectMode) { if (dragRef.current) handleSelectMove(toCanvasCoords(e)); return; }
    if (!drawingRef.current) return;
    const to = toCanvasCoords(e);

    if (gestureRef.current) { gestureRef.current.push(to); drawGesturePreview(); return; }

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
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (selectMode) { handleSelectUp(); return; }

    // #4 제스처(자/도형) 확정
    if (gestureRef.current) {
      const pts = gestureRef.current; gestureRef.current = null; drawingRef.current = false;
      if (pts.length < 2) { composite(); return; }
      let stroke: InkStroke | null;
      if (straightLine) {
        stroke = buildStrokeFromPoints([pts[0], snapLineEnd(pts[0], pts[pts.length - 1])]);
      } else {
        const shape = recognizeShape(pts);
        stroke = buildStrokeFromPoints(shape ? shapeToPoints(shape) : pts);
      }
      if (stroke) commitGestureStroke(stroke); else composite();
      return;
    }

    // 획 지우개 드래그 종료 → undo 한 번에 기록
    if (isStrokeEraser() && pendingEraseRef.current.length) {
      pushUndo({ removed: pendingEraseRef.current, added: [] });
      pendingEraseRef.current = [];
    }
    // 일반 필기/영역 지우개 종료: 부드럽게 재렌더 + undo 기록
    const finishedId = drawingRef.current && !isStrokeEraser() ? currentStrokeIdRef.current : null;
    const finishedLayer = finishedId ? activeLayerRef.current : null;
    drawingRef.current = false;
    lastRef.current = null;
    currentStrokeIdRef.current = null;
    if (finishedLayer) { rebuildLayer(finishedLayer); composite(); }
    if (finishedId) {
      const st = strokesRef.current.get(finishedId);
      if (st) {
        const t = strokeTime?.();
        if (t !== undefined) { st.t = t; onDelta?.({ type: 'stroke_time', strokeId: finishedId, t }); } // 원격에도 시각 전파
        pushUndo({ removed: [], added: [deepStroke(st)] });
      }
    }
  };

  // Ctrl/⌘ + 휠 → 확대/축소 (일반 휠은 스크롤 그대로).
  const handleWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoomClamped((z) => z * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-slate-100 ${className ?? ''}`}
    >
      {/* 확대 시 스크롤되는 뷰포트. 페이지가 작으면 가운데 정렬, 크면 스크롤. */}
      <div className="absolute inset-0 overflow-auto" onWheel={handleWheel}>
      <div className="min-w-full min-h-full flex items-center justify-center p-6">
      {/* 고정 비율 페이지: 화면맞춤(100%)에 zoom 배율을 곱해 크기 결정. 찌그러짐 0. */}
      <div
        className="relative bg-white shadow-md shrink-0"
        style={{ width: (page.w * zoom) || '100%', height: (page.h * zoom) || '100%' }}
      >
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
          className="absolute inset-0 w-full h-full touch-none z-10"
          style={{ cursor: selectMode ? 'crosshair' : cursorForPen(pen, dispScale) }}
        />

        {/* P1: 전사 라인 클릭 시 그 시각에 그린 획 영역을 잠깐 하이라이트 */}
        {highlightBox && (
          <div
            className="absolute rounded-lg border-2 border-amber-400 bg-amber-300/20 pointer-events-none animate-pulse z-[14]"
            style={{ left: (highlightBox.x - 8) * dispScale, top: (highlightBox.y - 8) * dispScale, width: (highlightBox.w + 16) * dispScale, height: (highlightBox.h + 16) * dispScale }}
          />
        )}

        {/* 올가미 선택 오버레이 (페이지 박스 내부, 표시 좌표 = 논리좌표 × dispScale) */}
        {selectMode && selection && (
          <>
            <div
              className="absolute border-2 border-blue-500 border-dashed rounded-sm pointer-events-none z-[15]"
              style={{ left: selection.box.x * dispScale, top: selection.box.y * dispScale, width: selection.box.w * dispScale, height: selection.box.h * dispScale }}
            />
            <div
              className="absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-sm pointer-events-none z-[16]"
              style={{ left: (selection.box.x + selection.box.w) * dispScale - 6, top: (selection.box.y + selection.box.h) * dispScale - 6 }}
            />
            <div
              className="absolute flex items-center gap-1 bg-white rounded-xl shadow-lg border border-slate-200 px-2 py-1.5 z-20"
              style={{ left: selection.box.x * dispScale, top: Math.max(selection.box.y * dispScale - 46, 4) }}
            >
              <button onClick={duplicateSelection} title="복제" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><Copy className="w-4 h-4" /></button>
              <button onClick={deleteSelection} title="삭제" className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 className="w-4 h-4" /></button>
              <div className="w-px h-5 bg-slate-200 mx-0.5" />
              {['#334155', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map((c) => (
                <button key={c} onClick={() => recolorSelection(c)} title="색 변경" className="w-5 h-5 rounded-full border border-slate-200 hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
              ))}
            </div>
          </>
        )}
      </div>
      </div>
      </div>

      {/* 확대/축소 컨트롤 (100% = 화면 맞춤). Ctrl/⌘+휠로도 조절. */}
      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-0.5 bg-white/95 backdrop-blur border border-slate-200 rounded-full shadow-md px-1 py-1 select-none">
        <button onClick={() => setZoomClamped((z) => z / 1.25)} title="축소" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 disabled:opacity-40" disabled={zoom <= ZOOM_MIN}><Minus className="w-4 h-4" /></button>
        <button onClick={() => setZoomClamped(1)} title="100%로 맞춤" className="text-xs font-bold text-slate-700 w-12 tabular-nums hover:text-blue-600">{Math.round(zoom * 100)}%</button>
        <button onClick={() => setZoomClamped((z) => z * 1.25)} title="확대" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 disabled:opacity-40" disabled={zoom >= ZOOM_MAX}><Plus className="w-4 h-4" /></button>
      </div>

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
