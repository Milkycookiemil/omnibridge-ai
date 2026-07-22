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
import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Trash2, Minus, Plus, ChevronLeft, ChevronRight, FilePlus2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  renderInkSegment, renderStrokeSmoothed, widthForPressure, distancePointToSegment, cursorForPen,
  pointInPolygon, strokePoints, strokeBounds, translateStroke, scaleStroke,
  snapLineEnd, recognizeShape, shapeToPoints,
  DEFAULT_PENS,
  type InkDelta, type InkSegment, type InkStroke, type InkLayer, type PenModel,
} from '../../lib/inkEngine';
import { LayerPanel } from './LayerPanel';
import { usePreferences } from '../../lib/preferences';

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
  eraserPen?: PenModel; // S펜 사이드 버튼을 누른 동안 쓸 지우개(없으면 기본 지우개)
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
  controlsBottomInset?: number;          // 하단 도킹 패널(전사)이 열렸을 때 페이지·줌 컨트롤을 위로 올리는 px
  onStructureChange?: () => void;        // 페이지 삭제/순서변경 등 저장이 필요한 구조 변경(디바운스 저장 트리거)
}

type SelBox = { x: number; y: number; w: number; h: number };
type Selection = { ids: string[]; box: SelBox };
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'; // 8방향 크기조절 핸들
type DragState =
  | { mode: 'lasso' }
  | { mode: 'move'; start: { x: number; y: number }; baseBox: SelBox }
  | { mode: 'scale'; handle: Handle; baseBox: SelBox };

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(
  { pen, eraserPen, width = 800, height = 800, className, backgroundStyle, backgroundImage, onDelta, showLayers = false, selectMode = false, straightLine = false, shapeMode = false, onHistoryChange, strokeTime, onStrokeTap, controlsBottomInset = 0, onStructureChange },
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
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 1000) / 1000));
    });
  const zoomRef = useRef(1); // 제스처 중 최신 줌을 동기 참조(state 지연 회피)
  zoomRef.current = zoom;
  // 핀치 중 줌 변경(리렌더)로 페이지 박스가 커진 뒤 스크롤을 보정하기 위한 대기값.
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);

  // ── 여러 페이지 (삼성노트 #13) ──────────────────────────────────────────
  // 모델(strokesRef)은 전체 페이지의 획을 들고, 렌더·히트테스트만 현재 페이지로 필터한다.
  // 획/델타에 page를 실어 CRDT append-only·획 삭제·리플레이 구조는 그대로 유지된다.
  // 빈 페이지는 획이 없으면 저장할 게 없어 재방문 시 사라질 수 있다(내용 유실 0 — v1 한계).
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [galleryOpen, setGalleryOpen] = useState(false);         // 삼성노트식 페이지 썸네일 갤러리
  const [pageThumbs, setPageThumbs] = useState<string[]>([]);    // 갤러리용 페이지별 미리보기(data URL)
  const pageIndexRef = useRef(0);
  const pageCountRef = useRef(1);
  const scrollViewRef = useRef<HTMLDivElement>(null); // 확대 스크롤 뷰포트(스크롤 페이지 이동 감지용)
  const flipCooldownRef = useRef(0);                  // 관성 스크롤로 여러 장 넘어가지 않게 쿨다운

  // 보기 방식 (설정에서 선택): 'scroll' = 연속 스크롤(페이지가 세로로 이어짐, 기본) / 'flip' = 페이지 넘김.
  const { noteViewMode, touchDraw } = usePreferences();
  // 손가락 그리기 허용 여부(기본 꺼짐 = 삼성노트식: S펜만 그리고 손가락은 팬/줌 전용).
  // 켜져 있어도 펜이 한 번 감지되면(penMode) 손바닥 방지를 위해 손가락 그리기는 중단한다.
  const touchDrawRef = useRef(touchDraw); touchDrawRef.current = touchDraw;
  const fingerCanDraw = () => touchDrawRef.current && !penModeRef.current;
  const scrollMode = noteViewMode === 'scroll';
  const scrollModeRef = useRef(scrollMode); scrollModeRef.current = scrollMode;
  // 연속 스크롤용: 페이지별 캔버스/박스 엘리먼트. 활성 페이지 캔버스만 레이어 합성 대상이고
  // 나머지는 모델에서 정적 렌더된다(그리기 시작하면 그 페이지가 즉시 활성으로 전환).
  const pageCanvasElsRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageBoxElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const staticTmpRef = useRef<HTMLCanvasElement | null>(null); // 정적 렌더용 레이어 임시 캔버스(재사용)
  const [staticsTick, setStaticsTick] = useState(0);           // 정적 페이지 재렌더 트리거
  const bumpStatics = () => setStaticsTick((t) => t + 1);
  // 활성 캔버스: 스크롤 모드는 활성 페이지의 캔버스, 플립 모드는 단일 canvasRef.
  const getActiveCanvas = (): HTMLCanvasElement | null =>
    scrollModeRef.current
      ? pageCanvasElsRef.current.get(pageIndexRef.current) ?? canvasRef.current
      : canvasRef.current;
  const pageOf = (st: { page?: number }) => st.page ?? 0;
  // 원격/로드 획이 현재 페이지 수 밖을 가리키면 페이지 수를 늘린다(기기 간 페이지 자동 전파).
  const ensurePageCount = (n: number) => {
    if (n > pageCountRef.current) { pageCountRef.current = n; setPageCount(n); }
  };
  const clearInteractions = () => {
    applySelection(null);
    previewRef.current = null; dragRef.current = null; lassoRef.current = null; gestureRef.current = null;
    drawingRef.current = false; lastRef.current = null; currentStrokeIdRef.current = null;
  };
  // 활성(그리기 대상) 페이지 전환 코어 — 레이어를 새 페이지 내용으로 재구성하고,
  // (스크롤 모드) 이전 활성 페이지는 정적 렌더로 되돌린다. 스크롤은 건드리지 않는다.
  const activatePageCore = (i: number) => {
    const clamped = Math.max(0, Math.min(pageCountRef.current - 1, i));
    if (clamped === pageIndexRef.current) return;
    const old = pageIndexRef.current;
    pageIndexRef.current = clamped;
    setPageIndex(clamped);
    clearInteractions();
    layersRef.current.forEach((l) => rebuildLayer(l.id));
    composite();
    if (scrollModeRef.current) renderStaticPage(old);
  };
  const goToPage = (i: number) => {
    const clamped = Math.max(0, Math.min(pageCountRef.current - 1, i));
    activatePageCore(clamped);
    if (scrollModeRef.current) {
      // 연속 스크롤: 해당 페이지 박스로 스크롤(박스가 아직 없으면 다음 프레임에).
      const scrollToBox = () => pageBoxElsRef.current.get(clamped)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (pageBoxElsRef.current.get(clamped)) scrollToBox(); else requestAnimationFrame(scrollToBox);
    } else if (scrollViewRef.current) {
      scrollViewRef.current.scrollTop = 0; // 플립: 새 페이지는 위에서 시작
    }
  };
  const addPage = () => {
    ensurePageCount(pageCountRef.current + 1);
    goToPage(pageCountRef.current - 1);
  };
  // 현재(또는 지정) 페이지 삭제: 그 페이지 획은 erase로 제거(동기화)하고, 뒤 페이지는 한 칸 당긴다.
  const deletePage = (p: number) => {
    if (pageCountRef.current <= 1) return; // 최소 1페이지 유지
    const removeIds: string[] = [];
    for (const st of strokesRef.current.values()) if (pageOf(st) === p) removeIds.push(st.id);
    // 뒤 페이지 인덱스 -1 (구조 재색인)
    for (const st of strokesRef.current.values()) if (pageOf(st) > p) st.page = pageOf(st) - 1;
    removeIds.forEach((id) => strokesRef.current.delete(id));
    pageCountRef.current -= 1; setPageCount(pageCountRef.current);
    let ni = pageIndexRef.current;
    if (ni > p || ni >= pageCountRef.current) ni = Math.max(0, Math.min(ni, pageCountRef.current - 1));
    if (pageIndexRef.current === p) ni = Math.min(p, pageCountRef.current - 1);
    pageIndexRef.current = ni; setPageIndex(ni);
    clearInteractions();
    layersRef.current.forEach((l) => rebuildLayer(l.id)); composite();
    bumpStatics();
    // 삭제 획은 원격에도 전파(+저장 트리거). 획 없는 빈 페이지 삭제여도 재색인 저장 필요.
    if (removeIds.length) onDelta?.({ type: 'erase_strokes', strokeIds: removeIds });
    onStructureChange?.();
  };
  // 페이지 순서 변경: p와 p+dir의 획 page를 맞바꾼다(보고 있던 페이지를 따라간다).
  const movePage = (p: number, dir: -1 | 1) => {
    const q = p + dir;
    if (q < 0 || q >= pageCountRef.current) return;
    for (const st of strokesRef.current.values()) {
      if (pageOf(st) === p) st.page = q;
      else if (pageOf(st) === q) st.page = p;
    }
    let ni = pageIndexRef.current;
    if (ni === p) ni = q; else if (ni === q) ni = p;
    pageIndexRef.current = ni; setPageIndex(ni);
    clearInteractions();
    layersRef.current.forEach((l) => rebuildLayer(l.id)); composite();
    bumpStatics();
    onStructureChange?.(); // 재색인 영속(순서변경은 실시간 델타 없이 노트 저장으로 전파)
  };
  // 갤러리용: 페이지 p의 획을 작은 캔버스에 렌더해 미리보기 data URL 생성.
  const renderPageThumb = (p: number): string => {
    const tw = 150, th = Math.max(1, Math.round((tw * height) / width));
    const tc = document.createElement('canvas'); tc.width = tw; tc.height = th;
    const ctx = tc.getContext('2d'); if (!ctx) return '';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
    ctx.save(); ctx.scale(tw / width, th / height);
    for (const layer of layersRef.current) {
      if (!layer.visible) continue;
      for (const st of strokesRef.current.values()) {
        if (st.layerId !== layer.id || pageOf(st) !== p) continue;
        renderStrokeSmoothed(ctx, st);
      }
    }
    ctx.restore();
    return tc.toDataURL('image/png');
  };
  const openGallery = () => {
    setPageThumbs(Array.from({ length: pageCountRef.current }, (_, i) => renderPageThumb(i)));
    setGalleryOpen(true);
  };

  // P1 전사→획 하이라이트 박스(잠깐 반짝이고 사라짐)
  const [highlightBox, setHighlightBox] = useState<SelBox | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- 올가미 선택 상태 ---
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selCursor, setSelCursor] = useState<string>('crosshair'); // 선택 모드 커서(핸들 위=방향별 리사이즈)
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

  // --- 팜리젝션(스타일러스 우선) + 멀티터치 내비게이션(핀치 줌·팬) ---
  // 캔버스는 touch-action:none이라 손가락 제스처를 직접 처리한다.
  //  · 펜(스타일러스)이 한 번이라도 감지되면(penMode) 손가락은 그리지 않는다 — 손바닥/손가락 오작동 방지.
  //    → 펜 사용자: 1손가락 = 팬, 2손가락 = 핀치 줌 + 팬.
  //  · 펜을 안 쓰는 사용자: 1손가락 = 그리기, 2손가락 = 핀치 줌 + 팬.
  const penModeRef = useRef(false);
  const markPen = () => { penModeRef.current = true; };
  // S펜 사이드 버튼(barrel, buttons&2)이나 펜 뒤집기(eraser tip, buttons&32)를 누른 채 그리면
  // 그 획 동안만 지우개로 동작한다(삼성노트식 빠른 지우기). 떼면 원래 펜으로 자동 복귀.
  const barrelRef = useRef(false);
  // 감지 폭을 넓힘: buttons 비트(2=사이드, 32=지우개촉) + pointerdown의 button(2=보조, 5=지우개).
  const isBarrelPressed = (e: React.PointerEvent) =>
    e.pointerType === 'pen' && ((e.buttons & (2 | 32)) !== 0 || e.button === 2 || e.button === 5);

  // ── 펜 입력 진단 (URL에 ?debug=pen 일 때만) ───────────────────────
  // 실기기에서 S펜 사이드 버튼이 어떤 신호로 오는지(혹은 아예 안 오는지) 화면에서 확인한다.
  const debugPen = typeof window !== 'undefined' && window.location.search.includes('debug=pen');
  const [penLog, setPenLog] = useState<string[]>([]);
  const lastLogRef = useRef('');
  const logPen = (label: string, e: { pointerType?: string; button?: number; buttons?: number; pressure?: number }) => {
    if (!debugPen) return;
    const line = `${label} ${e.pointerType ?? '-'} btn=${e.button ?? '-'} btns=${e.buttons ?? '-'} p=${(e.pressure ?? 0).toFixed(2)}`;
    if (line === lastLogRef.current) return; // 같은 줄 연속 방지(move 폭주 억제)
    lastLogRef.current = line;
    setPenLog((prev) => [line, ...prev].slice(0, 10));
  };
  const getPen = (): PenModel => (barrelRef.current ? (eraserPen ?? DEFAULT_PENS.eraser) : pen);
  // 화면에 닿아있는 손가락(touch) 위치 — 핀치 거리/중점 계산용.
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<null | { startDist: number; startZoom: number; lastMid: { x: number; y: number } }>(null);
  const panRef = useRef<null | { lastX: number; lastY: number }>(null);
  const touchNavRef = useRef(false); // 멀티터치/펜모드 손가락 내비 진행 중 — 손가락 그리기 억제(모두 뗄 때까지)
  const touchList = () => [...activeTouchesRef.current.values()];
  const touchDist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const touchMid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const startPinch = () => {
    const pts = touchList(); if (pts.length < 2) return;
    touchNavRef.current = true; panRef.current = null;
    pinchRef.current = { startDist: touchDist(pts[0], pts[1]) || 1, startZoom: zoomRef.current, lastMid: touchMid(pts[0], pts[1]) };
  };
  // 두 손가락 사이 거리 비율로 줌, 중점 이동으로 팬. 줌은 손가락 중점을 기준으로(그 지점 콘텐츠가 손가락을 따라감).
  const updatePinch = () => {
    const pts = touchList(); const st = pinchRef.current; const el = scrollViewRef.current;
    if (pts.length < 2 || !st || !el) return;
    const nd = touchDist(pts[0], pts[1]); const nm = touchMid(pts[0], pts[1]);
    const rect = el.getBoundingClientRect();
    const cur = zoomRef.current;
    const target = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, st.startZoom * (nd / st.startDist)));
    const f = target / cur;
    const cx = nm.x - rect.left, cy = nm.y - rect.top;         // 뷰포트 내 중점
    const dx = nm.x - st.lastMid.x, dy = nm.y - st.lastMid.y;  // 중점 이동(=팬)
    const left = (el.scrollLeft + cx) * f - cx - dx;
    const top = (el.scrollTop + cy) * f - cy - dy;
    st.lastMid = nm;
    if (Math.abs(f - 1) < 0.0015) {
      // 줌 변화가 미미 → 순수 팬. 리렌더 없이 스크롤만 조정(부드럽게).
      el.scrollLeft = Math.max(0, left); el.scrollTop = Math.max(0, top);
    } else {
      pendingScrollRef.current = { left, top }; // 리렌더로 박스 커진 뒤 useLayoutEffect가 스크롤 적용
      setZoomClamped(target);
    }
  };
  const updatePan = (x: number, y: number) => {
    const el = scrollViewRef.current; const p = panRef.current; if (!el || !p) return;
    el.scrollLeft -= (x - p.lastX); el.scrollTop -= (y - p.lastY);
    p.lastX = x; p.lastY = y;
  };
  // 손가락 그리기 중 두 번째 손가락 등장 → 내비로 전환하며 진행 중이던 획을 취소(모델 제거 + 원격 erase).
  const cancelCurrentStroke = () => {
    gestureRef.current = null;
    const id = currentStrokeIdRef.current;
    drawingRef.current = false; lastRef.current = null; currentStrokeIdRef.current = null;
    if (id) {
      const st = strokesRef.current.get(id);
      if (st) { const layer = st.layerId; strokesRef.current.delete(id); rebuildLayer(layer); composite(); onDelta?.({ type: 'erase_strokes', strokeIds: [id] }); }
    }
  };

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

  // 표시 캔버스(활성 페이지) = 보이는 레이어들을 순서대로 합성
  const composite = () => {
    const main = getActiveCanvas();
    const ctx = main?.getContext('2d');
    if (!main || !ctx) return;
    ctx.clearRect(0, 0, main.width, main.height);
    for (const layer of layersRef.current) {
      if (!layer.visible) continue;
      const lc = layerCanvasesRef.current.get(layer.id);
      if (lc) ctx.drawImage(lc, 0, 0);
    }
  };

  // (연속 스크롤) 비활성 페이지를 모델에서 정적 렌더.
  // 레이어 시맨틱(영역 지우개=해당 레이어만) 보존을 위해 레이어별 임시 캔버스를 거쳐 합성한다.
  const renderStaticPage = (p: number) => {
    if (!scrollModeRef.current) return;
    const el = pageCanvasElsRef.current.get(p);
    if (!el || p === pageIndexRef.current) return;
    const ctx = el.getContext('2d'); if (!ctx) return;
    let tmp = staticTmpRef.current;
    if (!tmp) { tmp = document.createElement('canvas'); staticTmpRef.current = tmp; }
    tmp.width = width; tmp.height = height;
    const tctx = tmp.getContext('2d'); if (!tctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    for (const layer of layersRef.current) {
      if (!layer.visible) continue;
      tctx.clearRect(0, 0, width, height);
      let any = false;
      for (const st of strokesRef.current.values()) {
        if (st.layerId !== layer.id || pageOf(st) !== p) continue;
        renderStrokeSmoothed(tctx, st); any = true;
      }
      if (any) ctx.drawImage(tmp, 0, 0);
    }
  };
  const renderAllStatics = () => {
    if (!scrollModeRef.current) return;
    for (let i = 0; i < pageCountRef.current; i++) if (i !== pageIndexRef.current) renderStaticPage(i);
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
      if (pageOf(stroke) !== pageIndexRef.current) continue; // 현재 페이지 획만 렌더
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
      const page = delta.page ?? 0;
      ensurePageCount(page + 1); // 원격이 새 페이지에 그리면 페이지 수 자동 확장
      let stroke = strokesRef.current.get(strokeId);
      if (!stroke) {
        stroke = { id: strokeId, layerId, penType: delta.penType, color: delta.color, opacity: delta.opacity, segs: [], page };
        strokesRef.current.set(strokeId, stroke);
      }
      stroke.segs.push({ from: delta.from, to: delta.to, width: delta.width });
      if (pageOf(stroke) === pageIndexRef.current) {
        const ctx = getLayerCanvas(stroke.layerId).getContext('2d');
        if (ctx) renderInkSegment(ctx, delta);
        composite();
      } else if (scrollModeRef.current) {
        // 연속 스크롤: 다른 페이지의 원격 획도 그 페이지 정적 캔버스에 바로 보이게.
        // (지우개는 레이어 시맨틱 보존을 위해 전체 정적 재렌더)
        const sctx = pageCanvasElsRef.current.get(pageOf(stroke))?.getContext('2d');
        if (delta.penType !== 'eraser' && sctx) renderInkSegment(sctx, delta);
        else renderStaticPage(pageOf(stroke));
      }
      // (플립 모드) 다른 페이지 획은 모델에만 쌓이고 그 페이지로 넘어갈 때 렌더된다.
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
      bumpStatics(); // 다른 페이지 획이 지워졌을 수 있음(연속 스크롤 정적 갱신)
    } else if (delta.type === 'stroke_time') {
      // 원격/리플레이: 이미 존재하는 획에 녹음 시각을 설정(획↔전사 싱크 전파)
      const st = strokesRef.current.get(delta.strokeId);
      if (st) st.t = delta.t;
    }
  };

  // --- 획 지우개: 히트테스트 → 스트로크 통째 삭제 ---
  const eraseStrokesAt = (p: { x: number; y: number }) => {
    const threshold = Math.max(getPen().baseWidth, 12);
    const hit: string[] = [];
    for (const stroke of strokesRef.current.values()) {
      // 활성 레이어의 실제 잉크만 대상 (영역 지우개 자국은 히트 제외) + 현재 페이지만
      if (stroke.layerId !== activeLayerRef.current || stroke.penType === 'eraser') continue;
      if (pageOf(stroke) !== pageIndexRef.current) continue;
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
    bumpStatics(); // undo/redo가 다른 페이지 획을 바꿨을 수 있음
    if (removeIds.length) onDelta?.({ type: 'erase_strokes', strokeIds: removeIds });
    for (const st of addStrokes) for (const s of st.segs) onDelta?.({ from: s.from, to: s.to, width: s.width, penType: st.penType, color: st.color, opacity: st.opacity, strokeId: st.id, layerId: st.layerId, page: st.page });
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
    // 여러 페이지: 전 페이지에서 찾고, 매칭이 다른 페이지에 있으면 그 페이지로 점프한다.
    highlightByTime: (sec: number, windowSec = 6) => {
      const all = [...strokesRef.current.values()].filter((st) => st.t !== undefined && Math.abs((st.t as number) - sec) <= windowSec);
      if (!all.length) { setHighlightBox(null); return 0; }
      const targetPage = all.some((st) => pageOf(st) === pageIndexRef.current)
        ? pageIndexRef.current
        : pageOf(all[0]);
      if (targetPage !== pageIndexRef.current) goToPage(targetPage);
      const matches = all.filter((st) => pageOf(st) === targetPage);
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
      pageIndexRef.current = 0; pageCountRef.current = 1; setPageIndex(0); setPageCount(1);
      composite();
      bumpStatics();
      if (scrollViewRef.current) scrollViewRef.current.scrollTop = 0;
    },
    exportPng: () => getActiveCanvas()?.toDataURL('image/png') ?? null,
    getCanvas: () => getActiveCanvas(),
    // 스트로크 모델 스냅샷(깊은 복사) — 저장 후 외부 변형이 캔버스에 영향 없게.
    exportStrokes: () =>
      [...strokesRef.current.values()].map((st) => ({
        ...st,
        segs: st.segs.map((s) => ({ from: { ...s.from }, to: { ...s.to }, width: s.width })),
      })),
    // 저장된 스트로크로 캔버스 복원: 초기화 → 레이어 보장 → 모델 주입 → 재렌더.
    // 페이지 수는 저장된 획의 최대 page로 복원한다(빈 트레일링 페이지는 v1에선 비영속).
    loadStrokes: (strokes: InkStroke[]) => {
      strokesRef.current.clear();
      layerCanvasesRef.current.forEach((c) => c.getContext('2d')?.clearRect(0, 0, c.width, c.height));
      let maxPage = 0;
      for (const st of strokes) {
        ensureLayer(st.layerId);
        if (pageOf(st) > maxPage) maxPage = pageOf(st);
        strokesRef.current.set(st.id, {
          ...st,
          segs: st.segs.map((s) => ({ from: { ...s.from }, to: { ...s.to }, width: s.width })),
        });
      }
      pageIndexRef.current = 0; setPageIndex(0);
      pageCountRef.current = maxPage + 1; setPageCount(maxPage + 1);
      layersRef.current.forEach((l) => rebuildLayer(l.id));
      undoStackRef.current = []; redoStackRef.current = []; notifyHistory();
      applySelection(null);
      composite();
      bumpStatics();
      if (scrollViewRef.current) scrollViewRef.current.scrollTop = 0;
    },
  }));

  // 컨테이너에 고정 비율 페이지를 균일 축소로 맞춘다(찌그러짐 0) + 커서 스케일 갱신.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const aspect = width / height;
    const PAD = 24; // 뷰포트 래퍼 p-6(24px)과 일치 — fit에서 스크롤 여지 0(휠=즉시 페이지 플립)
    const measure = () => {
      const cw = el.clientWidth - PAD * 2, ch = el.clientHeight - PAD * 2;
      if (cw <= 0 || ch <= 0) return;
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

  // 핀치 줌으로 페이지 박스가 리사이즈된 직후, 손가락 중점을 고정하도록 스크롤 보정.
  useLayoutEffect(() => {
    const p = pendingScrollRef.current; const el = scrollViewRef.current;
    if (p && el) { el.scrollLeft = Math.max(0, p.left); el.scrollTop = Math.max(0, p.top); pendingScrollRef.current = null; }
  }, [zoom]);

  // (연속 스크롤) 비활성 페이지 정적 렌더 — DOM에 페이지 박스가 생긴 뒤 실행되도록 이펙트로.
  useEffect(() => {
    if (!scrollMode) return;
    renderAllStatics();
    composite(); // 모드 전환/활성 변경 직후 활성 캔버스도 확실히 갱신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticsTick, pageCount, pageIndex, scrollMode]);

  // 보기 방식 전환(scroll↔flip): 새로 마운트된 캔버스에 활성 페이지를 다시 그린다.
  useEffect(() => {
    layersRef.current.forEach((l) => rebuildLayer(l.id));
    composite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollMode]);

  // (연속 스크롤) 스크롤을 따라 "보고 있는 페이지"를 활성으로 — 필기 레이어·페이지 라벨이 시야를 따라간다.
  useEffect(() => {
    if (!scrollMode) return;
    const el = scrollViewRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const mid = el.getBoundingClientRect().top + el.clientHeight / 2;
        let best = -1, bestDist = Infinity;
        for (const [i, box] of pageBoxElsRef.current) {
          const r = box.getBoundingClientRect();
          const d = Math.abs((r.top + r.bottom) / 2 - mid);
          if (d < bestDist) { bestDist = d; best = i; }
        }
        if (best >= 0 && best !== pageIndexRef.current && !drawingRef.current) activatePageCore(best);
      }, 120);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollMode]);

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
  // 좌표는 이벤트를 받은 캔버스 기준(연속 스크롤에선 페이지마다 캔버스가 다르다).
  const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };
  // 고주사율 입력: 브라우저가 한 번의 pointermove에 뭉쳐 보낸(coalesced) 중간 점들을 모두 꺼내
  // 캔버스 좌표+필압으로 반환한다. 빠른 획의 점 유실(각짐)을 없앤다. 미지원이면 현재 이벤트 1개.
  const coalescedCanvasPoints = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const nat = e.nativeEvent;
    const coalesced = typeof nat.getCoalescedEvents === 'function' ? nat.getCoalescedEvents() : [];
    const list: Array<{ clientX: number; clientY: number; pressure: number }> = coalesced.length ? coalesced : [nat];
    return list.map((ev) => ({
      x: ((ev.clientX - rect.left) / rect.width) * canvas.width,
      y: ((ev.clientY - rect.top) / rect.height) * canvas.height,
      pressure: ev.pressure,
    }));
  };

  const isStrokeEraser = () => { const p = getPen(); return p.type === 'eraser' && (p.eraserMode ?? 'area') === 'stroke'; };

  // ===== 올가미 선택/변형 =====
  const emitStrokeSegs = (st: InkStroke) => {
    for (const s of st.segs) {
      onDelta?.({ from: s.from, to: s.to, width: s.width, penType: st.penType, color: st.color, opacity: st.opacity, strokeId: st.id, layerId: st.layerId, page: st.page });
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
  // 8방향 크기조절 헬퍼(캔버스 논리 px). 모서리(nw/ne/sw/se)=비율 유지, 변(n/s/e/w)=한 축만.
  const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']; // 모서리 우선 검사
  const handlePos = (b: SelBox): Record<Handle, { x: number; y: number }> => ({
    nw: { x: b.x, y: b.y }, n: { x: b.x + b.w / 2, y: b.y }, ne: { x: b.x + b.w, y: b.y },
    e: { x: b.x + b.w, y: b.y + b.h / 2 }, se: { x: b.x + b.w, y: b.y + b.h },
    s: { x: b.x + b.w / 2, y: b.y + b.h }, sw: { x: b.x, y: b.y + b.h }, w: { x: b.x, y: b.y + b.h / 2 },
  });
  const cursorForHandle = (h: Handle) =>
    h === 'nw' || h === 'se' ? 'nwse-resize' : h === 'ne' || h === 'sw' ? 'nesw-resize' : h === 'n' || h === 's' ? 'ns-resize' : 'ew-resize';
  const computeScale = (handle: Handle, b: SelBox, pt: { x: number; y: number }) => {
    const minPx = 8 / dispScale; // 최소 크기(논리 px) — 뒤집힘/0 방지
    const right = b.x + b.w, bottom = b.y + b.h;
    const corner = handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se';
    const ax = (handle === 'nw' || handle === 'w' || handle === 'sw') ? right : b.x;
    const ay = (handle === 'nw' || handle === 'n' || handle === 'ne') ? bottom : b.y;
    let sx = 1, sy = 1;
    if (corner) {
      const dxr = Math.max(Math.abs(pt.x - ax), minPx) / (b.w || minPx);
      const dyr = Math.max(Math.abs(pt.y - ay), minPx) / (b.h || minPx);
      const s = Math.max(dxr, dyr); sx = s; sy = s; // 비율 유지
    } else if (handle === 'e' || handle === 'w') {
      sx = Math.max(Math.abs(pt.x - ax), minPx) / (b.w || minPx);
    } else {
      sy = Math.max(Math.abs(pt.y - ay), minPx) / (b.h || minPx);
    }
    return { ax, ay, sx, sy, box: { x: ax + (b.x - ax) * sx, y: ay + (b.y - ay) * sy, w: b.w * sx, h: b.h * sy } };
  };
  const updateHoverCursor = (pt: { x: number; y: number }) => {
    const sel = selectionRef.current;
    let cur = 'crosshair';
    if (sel) {
      const hitR = HANDLE_HIT / dispScale;
      const pos = handlePos(sel.box);
      for (const h of HANDLES) if (Math.abs(pt.x - pos[h].x) <= hitR && Math.abs(pt.y - pos[h].y) <= hitR) { cur = cursorForHandle(h); break; }
      if (cur === 'crosshair' && pt.x >= sel.box.x && pt.x <= sel.box.x + sel.box.w && pt.y >= sel.box.y && pt.y <= sel.box.y + sel.box.h) cur = 'move';
    }
    setSelCursor((prev) => (prev === cur ? prev : cur));
  };
  const drawLasso = () => {
    composite();
    const ctx = getActiveCanvas()?.getContext('2d');
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
      const pos = handlePos(sel.box);
      for (const h of HANDLES) {
        if (Math.abs(pt.x - pos[h].x) <= hitR && Math.abs(pt.y - pos[h].y) <= hitR) {
          dragRef.current = { mode: 'scale', handle: h, baseBox: { ...sel.box } };
          setSelCursor(cursorForHandle(h));
          return;
        }
      }
      if (pt.x >= sel.box.x && pt.x <= sel.box.x + sel.box.w && pt.y >= sel.box.y && pt.y <= sel.box.y + sel.box.h) {
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
    // scale: 반대편 앵커 고정, 잡은 핸들 방향으로. 모서리=비율 유지.
    const r = computeScale(d.handle, d.baseBox, pt);
    previewRef.current = { kind: 'scale', ax: r.ax, ay: r.ay, sx: r.sx, sy: r.sy };
    rebuildLayer(activeLayerRef.current); composite();
    setSelection((s) => s ? { ...s, box: r.box } : s);
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
            if (pageOf(st) !== pageIndexRef.current) continue;
            if (st.segs.some((s) => distancePointToSegment(tap, s.from, s.to) <= thr + s.width / 2)) hitT = st.t; // 위 획 우선
          }
          if (hitT !== undefined) { onStrokeTap(hitT); }
        }
        composite(); return;
      }
      const ids: string[] = [];
      for (const st of strokesRef.current.values()) {
        if (st.layerId !== activeLayerRef.current) continue;
        if (pageOf(st) !== pageIndexRef.current) continue; // 올가미는 현재 페이지 획만
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
  const isGesture = () => (straightLine || shapeMode) && getPen().type !== 'eraser';
  const buildStrokeFromPoints = (pts: { x: number; y: number }[]): InkStroke | null => {
    if (pts.length < 2) return null;
    const p = getPen();
    const w = widthForPressure(p, 0.5);
    const segs = [];
    for (let i = 1; i < pts.length; i++) segs.push({ from: { ...pts[i - 1] }, to: { ...pts[i] }, width: w });
    return { id: genId(), layerId: activeLayerRef.current, penType: p.type, color: p.color, opacity: p.opacity, segs, page: pageIndexRef.current };
  };
  const commitGestureStroke = (stroke: InkStroke) => {
    const t = strokeTime?.(); if (t !== undefined) stroke.t = t;
    strokesRef.current.set(stroke.id, stroke);
    rebuildLayer(stroke.layerId); composite();
    for (const s of stroke.segs) onDelta?.({ from: s.from, to: s.to, width: s.width, penType: stroke.penType, color: stroke.color, opacity: stroke.opacity, strokeId: stroke.id, layerId: stroke.layerId, page: stroke.page });
    if (t !== undefined) onDelta?.({ type: 'stroke_time', strokeId: stroke.id, t }); // 원격에도 시각 전파
    pushUndo({ removed: [], added: [deepStroke(stroke)] });
  };
  const drawGesturePreview = () => {
    composite();
    const ctx = getActiveCanvas()?.getContext('2d'); const pts = gestureRef.current;
    if (!ctx || !pts || pts.length < 1) return;
    ctx.save();
    const gp = getPen();
    ctx.globalAlpha = gp.opacity; ctx.strokeStyle = gp.color; ctx.lineWidth = widthForPressure(gp, 0.5);
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
    logPen('down', e);
    if (e.pointerType === 'pen') { markPen(); barrelRef.current = isBarrelPressed(e); } // 사이드 버튼 = 이 획만 지우개
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
      if (activeTouchesRef.current.size >= 2) { cancelCurrentStroke(); startPinch(); return; } // 2손가락 = 핀치 줌/팬
      if (!fingerCanDraw()) { touchNavRef.current = true; panRef.current = { lastX: e.clientX, lastY: e.clientY }; return; } // 기본: 1손가락 = 팬(그리지 않음)
      // '터치해서 그리기' 켬 + 펜 미사용일 때만 손가락 그리기 → 아래로 진행
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    // 연속 스크롤: 다른 페이지 캔버스에 펜을 대면 그 페이지를 즉시 활성으로(그대로 그리기 시작).
    if (scrollModeRef.current) {
      const p = Number(e.currentTarget.dataset.page ?? pageIndexRef.current);
      if (!Number.isNaN(p) && p !== pageIndexRef.current) activatePageCore(p);
    }
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
    if (e.pointerType === 'pen') logPen('move', e);
    if (e.pointerType === 'touch') {
      if (activeTouchesRef.current.has(e.pointerId)) activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current && activeTouchesRef.current.size >= 2) { updatePinch(); return; }
      if (panRef.current && !fingerCanDraw()) { updatePan(e.clientX, e.clientY); return; }
      if (!fingerCanDraw() || touchNavRef.current) return; // 손가락 팬/내비 중 → 그리기 안 함
      // 손가락 사용자 1손가락 그리기 → 아래로 진행
    }
    if (selectMode) { const cp = toCanvasCoords(e); if (dragRef.current) handleSelectMove(cp); else if (e.pointerType !== 'touch') updateHoverCursor(cp); return; }
    if (!drawingRef.current) return;
    const pts = coalescedCanvasPoints(e); // 고주사율: 중간 점들까지 전부

    if (gestureRef.current) { for (const p of pts) gestureRef.current.push({ x: p.x, y: p.y }); drawGesturePreview(); return; }

    if (isStrokeEraser()) {
      for (const p of pts) eraseStrokesAt(p);
      return;
    }

    // 마우스는 pressure=0 → inkEngine에서 0.5로 폴백. 펜은 각 coalesced 점의 실제 필압 사용.
    const dp = getPen(); // 사이드 버튼 눌림이면 지우개
    for (const p of pts) {
      const from = lastRef.current;
      if (!from) { lastRef.current = { x: p.x, y: p.y }; continue; }
      const seg: InkSegment = {
        from, to: { x: p.x, y: p.y },
        penType: dp.type,
        color: dp.color,
        width: widthForPressure(dp, p.pressure),
        opacity: dp.opacity,
        strokeId: currentStrokeIdRef.current ?? genId(),
        layerId: activeLayerRef.current,
        page: pageIndexRef.current,
      };
      applyDelta(seg);      // 로컬도 원격과 같은 경로로 모델에 반영
      lastRef.current = { x: p.x, y: p.y };
      onDelta?.(seg);       // 실시간 릴레이(strokeId/layerId 포함)
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    logPen('up/cancel', e);
    if (e.pointerType === 'touch') {
      const wasNav = !fingerCanDraw() || pinchRef.current !== null || panRef.current !== null || touchNavRef.current;
      activeTouchesRef.current.delete(e.pointerId);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      if (activeTouchesRef.current.size < 2) pinchRef.current = null;
      if (activeTouchesRef.current.size === 0) { panRef.current = null; touchNavRef.current = false; }
      else if (!fingerCanDraw() && activeTouchesRef.current.size === 1) {
        const rem = touchList()[0]; panRef.current = { lastX: rem.x, lastY: rem.y }; // 핀치→1손가락 팬 이어가기(펜모드)
      }
      if (wasNav) return; // 내비 제스처였으면 그리기 종료 처리 불필요
      // 손가락 사용자 그리기 종료 → 아래로 진행
    }
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (selectMode) { barrelRef.current = false; handleSelectUp(); return; }

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
      barrelRef.current = false;
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
    barrelRef.current = false; // 획이 끝나면 원래 펜으로 복귀
    if (finishedId) {
      const st = strokesRef.current.get(finishedId);
      if (st) {
        const t = strokeTime?.();
        if (t !== undefined) { st.t = t; onDelta?.({ type: 'stroke_time', strokeId: finishedId, t }); } // 원격에도 시각 전파
        pushUndo({ removed: [], added: [deepStroke(st)] });
      }
    }
  };

  // 휠: Ctrl/⌘=확대축소. (플립 모드) 경계 도달 시 이전·다음 페이지로 이동.
  // (연속 스크롤 모드) 일반 휠은 네이티브 스크롤 그대로 — 페이지가 이어져 보인다.
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoomClamped((z) => z * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      return;
    }
    if (scrollModeRef.current) return;
    const el = scrollViewRef.current;
    if (!el) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    // 확대해서 아직 스크롤 여지가 있으면 페이지 내부 스크롤을 그대로 둔다.
    if ((dir > 0 && !atBottom) || (dir < 0 && !atTop)) return;
    const now = Date.now();
    if (now < flipCooldownRef.current) { e.preventDefault(); return; } // 관성 다중 플립 방지
    if (dir > 0 && pageIndexRef.current < pageCountRef.current - 1) {
      flipCooldownRef.current = now + 450; goToPage(pageIndexRef.current + 1); e.preventDefault();
    } else if (dir < 0 && pageIndexRef.current > 0) {
      flipCooldownRef.current = now + 450; goToPage(pageIndexRef.current - 1); e.preventDefault();
    }
  };

  // 페이지 배경(종이 무늬·슬라이드 이미지)과 활성 페이지 오버레이(하이라이트·올가미) — 두 모드 공용 조각.
  const pageDecor = (
    <>
      {backgroundImage && (
        <img
          src={backgroundImage}
          alt="필기 배경"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
      )}
      {backgroundStyle && <div className="absolute inset-0 pointer-events-none" style={backgroundStyle} />}
    </>
  );
  const canvasHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp, // 브라우저가 제스처를 취소(멀티터치 등)할 때 상태 정리
    // S펜 사이드 버튼은 안드로이드에서 '우클릭'으로 처리돼 컨텍스트 메뉴가 뜨며 펜 입력이
    // 취소될 수 있다(→ 아무것도 안 그려짐). 캔버스 위에서는 메뉴를 막는다.
    onContextMenu: (e: React.MouseEvent) => { logPen('contextmenu', { button: e.button, buttons: e.buttons }); e.preventDefault(); },
    onPointerLeave: handlePointerUp,
  };
  const canvasCursor = { cursor: selectMode ? selCursor : cursorForPen(pen, dispScale) };
  const pageOverlays = (
    <>
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
          {/* 8방향 크기조절 핸들(시각 단서 — 실제 드래그는 캔버스가 좌표로 감지) */}
          {Object.entries(handlePos(selection.box)).map(([h, p]) => (
            <div
              key={h}
              className="absolute w-2.5 h-2.5 bg-white border-2 border-blue-500 rounded-sm pointer-events-none z-[16]"
              style={{ left: p.x * dispScale - 5, top: p.y * dispScale - 5 }}
            />
          ))}
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
    </>
  );

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-slate-100 ${className ?? ''}`}
    >
      {/* 뷰포트: (연속 스크롤) 페이지들이 세로로 이어짐 / (플립) 단일 페이지 + 경계 휠 넘김. */}
      <div ref={scrollViewRef} className="absolute inset-0 overflow-auto" onWheel={handleWheel}>
        {scrollMode ? (
          <div className="min-w-full flex flex-col items-center gap-6 p-6">
            {Array.from({ length: pageCount }, (_, i) => (
              <div
                key={i}
                ref={(el) => { if (el) pageBoxElsRef.current.set(i, el); else pageBoxElsRef.current.delete(i); }}
                className="relative bg-white shadow-md shrink-0"
                style={{ width: (page.w * zoom) || '100%', height: (page.h * zoom) || 400 }}
              >
                {pageDecor}
                <canvas
                  data-page={i}
                  ref={(el) => { if (el) pageCanvasElsRef.current.set(i, el); else pageCanvasElsRef.current.delete(i); }}
                  width={width}
                  height={height}
                  {...canvasHandlers}
                  className="absolute inset-0 w-full h-full touch-none z-10"
                  style={canvasCursor}
                />
                {/* 페이지 번호 칩 */}
                <span className={cn('absolute top-1.5 right-1.5 z-[12] text-[10px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none',
                  i === pageIndex ? 'bg-blue-500 text-white' : 'bg-slate-200/80 text-slate-500')}>{i + 1}</span>
                {i === pageIndex && pageOverlays}
              </div>
            ))}
          </div>
        ) : (
          <div className="min-w-full min-h-full flex items-center justify-center p-6">
            {/* 고정 비율 페이지: 화면맞춤(100%)에 zoom 배율을 곱해 크기 결정. 찌그러짐 0. */}
            <div
              className="relative bg-white shadow-md shrink-0"
              style={{ width: (page.w * zoom) || '100%', height: (page.h * zoom) || '100%' }}
            >
              {pageDecor}
              <canvas
                ref={canvasRef}
                width={width}
                height={height}
                {...canvasHandlers}
                className="absolute inset-0 w-full h-full touch-none z-10"
                style={canvasCursor}
              />
              {pageOverlays}
            </div>
          </div>
        )}
      </div>

      {/* 페이지 네비 (삼성노트 #13): ◀ n/N ▶ + 새 페이지 + 페이지 메뉴(삭제·순서변경). 좌하단.
          전사 패널이 열리면 controlsBottomInset만큼 위로 올라와 가려지지 않는다.
          휠을 페이지 경계에서 굴리면 이전/다음 페이지로도 이동한다. */}
      <div style={{ bottom: 12 + controlsBottomInset }} className="absolute left-3 z-40 flex items-center gap-0.5 bg-white/95 backdrop-blur border border-slate-200 rounded-full shadow-md px-1 py-1 select-none transition-[bottom]">
        <button onClick={() => goToPage(pageIndex - 1)} title="이전 페이지" disabled={pageIndex <= 0}
          className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={openGallery} title="페이지 갤러리(미리보기·이동·삭제·순서변경)"
          className="text-xs font-bold text-slate-700 tabular-nums px-1 rounded hover:bg-slate-100">{pageIndex + 1}/{pageCount}</button>
        <button onClick={() => goToPage(pageIndex + 1)} title="다음 페이지" disabled={pageIndex >= pageCount - 1}
          className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
        <div className="w-px h-4 bg-slate-200 mx-0.5" />
        <button onClick={addPage} title="새 페이지 추가"
          className="p-1.5 rounded-full hover:bg-blue-50 text-blue-600"><FilePlus2 className="w-4 h-4" /></button>
      </div>

      {/* 페이지 갤러리 (삼성노트식): 썸네일 그리드 — 클릭 이동, +추가, 카드별 순서변경·삭제 */}
      {galleryOpen && (
        <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setGalleryOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-full flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 text-sm">페이지 <span className="text-slate-400 font-medium">({pageCount})</span></h3>
              <button onClick={() => setGalleryOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
              {pageThumbs.map((src, i) => (
                <div key={i} className="group relative flex flex-col items-center gap-1.5">
                  <button
                    onClick={() => { goToPage(i); setGalleryOpen(false); }}
                    className={cn('relative w-full rounded-lg overflow-hidden border-2 bg-white shadow-sm transition-all hover:shadow-md',
                      i === pageIndex ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300')}
                    style={{ aspectRatio: `${width} / ${height}` }}
                  >
                    {src ? <img src={src} alt={`페이지 ${i + 1}`} className="w-full h-full object-cover" draggable={false} /> : <span className="text-slate-300 text-xs">빈 페이지</span>}
                  </button>
                  <span className={cn('text-xs font-bold', i === pageIndex ? 'text-blue-600' : 'text-slate-500')}>{i + 1}</span>
                  {/* 카드 hover 시 순서변경·삭제 */}
                  <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { movePage(i, -1); openGallery(); }} disabled={i <= 0}
                      title="앞으로" className="p-1 rounded bg-white/90 border border-slate-200 shadow text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft className="w-3 h-3" /></button>
                    <button onClick={() => { movePage(i, 1); openGallery(); }} disabled={i >= pageCount - 1}
                      title="뒤로" className="p-1 rounded bg-white/90 border border-slate-200 shadow text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronRight className="w-3 h-3" /></button>
                    <button onClick={() => { deletePage(i); openGallery(); }} disabled={pageCount <= 1}
                      title="삭제" className="p-1 rounded bg-white/90 border border-slate-200 shadow text-rose-500 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
              {/* + 새 페이지 */}
              <button onClick={() => { addPage(); openGallery(); }} title="새 페이지"
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                style={{ aspectRatio: `${width} / ${height}` }}>
                <FilePlus2 className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 확대/축소 컨트롤 (100% = 화면 맞춤). Ctrl/⌘+휠로도 조절. 전사 패널 열림 시 위로. */}
      <div style={{ bottom: 12 + controlsBottomInset }} className="absolute right-3 z-30 flex items-center gap-0.5 bg-white/95 backdrop-blur border border-slate-200 rounded-full shadow-md px-1 py-1 select-none transition-[bottom]">
        <button onClick={() => setZoomClamped((z) => z / 1.25)} title="축소" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 disabled:opacity-40" disabled={zoom <= ZOOM_MIN}><Minus className="w-4 h-4" /></button>
        <button onClick={() => setZoomClamped(1)} title="100%로 맞춤" className="text-xs font-bold text-slate-700 w-12 tabular-nums hover:text-blue-600">{Math.round(zoom * 100)}%</button>
        <button onClick={() => setZoomClamped((z) => z * 1.25)} title="확대" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 disabled:opacity-40" disabled={zoom >= ZOOM_MAX}><Plus className="w-4 h-4" /></button>
      </div>

      {/* 펜 입력 진단 오버레이 (?debug=pen 일 때만) — 실기기 S펜 버튼 신호 확인용 */}
      {debugPen && (
        <div className="absolute top-2 left-2 z-[60] bg-slate-900/85 text-emerald-300 font-mono text-[11px] leading-tight rounded-lg px-2 py-1.5 max-w-[92%] pointer-events-none">
          <div className="text-white font-bold mb-0.5">pen debug (btns: 1=촉 2=사이드 32=지우개촉)</div>
          {penLog.length === 0 ? <div className="text-rose-300">이벤트 없음 — 펜을 대보세요</div>
            : penLog.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

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
