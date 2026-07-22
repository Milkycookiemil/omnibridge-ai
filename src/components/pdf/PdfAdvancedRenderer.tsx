import React, { useEffect, useLayoutEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search, X, Copy, Trash2, Undo2, Redo2, Lasso, Ruler, Shapes, Minus, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PenToolbar } from '../ink/PenToolbar';
import { QuickColorPalette } from '../ink/QuickColorPalette';
import {
  renderInkSegment, renderStrokeSmoothed, widthForPressure, cursorForPen,
  snapLineEnd, recognizeShape, shapeToPoints, pointInPolygon, distancePointToSegment,
  type InkSegment, type PenModel, type PenType,
} from '../../lib/inkEngine';
// 페이지별 비율좌표(0~1) 저장 구조 — 노트 영속화를 위해 공용 모듈에서 가져온다.
import type { InkPoint, PageInkSeg, PageStroke, PdfPageStrokes } from '../../lib/pdfInk';

// PDF 줌/팬 내비게이션 — 부모(스크롤 컨테이너 + pdfZoom state)가 실제 동작을 담당하고,
// 각 페이지의 드로잉 캔버스는 손가락 제스처를 감지해 이 핸들로 위임한다.
interface PdfNav {
  getZoom: () => number;
  // 손가락 중점(midX,midY, client좌표)을 고정한 채 target 배율로 줌 + 중점 이동만큼 팬.
  setZoomAt: (target: number, midX: number, midY: number, panDx: number, panDy: number) => void;
  panBy: (dx: number, dy: number) => void;
  ZOOM_MIN: number;
  ZOOM_MAX: number;
}

// Initialize worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfPageProps {
  pageNumber: number;
  pdfDocument: pdfjsLib.PDFDocumentProxy;
  pen: PenModel;
  scale: number;
  searchText: string;
  highlightedIndexes: { pageIndex: number, matchIndex: number, textIndex: number }[];
  currentMatchIndex: number | null;
  onPageMatchCalculated: (pageIndex: number, matches: { textIndex: number, rect: any }[]) => void;
  onVisible: (pageNumber: number) => void;
  initialStrokes?: PageStroke[]; // 저장된 필기 복원용
  onStrokesChange?: (pageNumber: number, strokes: PageStroke[]) => void; // 필기 변경 알림(저장용)
  straightLine?: boolean; // #4 자(직선)
  shapeMode?: boolean;    // #4 도형 보정
  selectMode?: boolean;   // 올가미 선택 모드
  registerHandle?: (page: number, h: { undo: () => void; redo: () => void; highlightByTime: (sec: number, win: number) => number } | null) => void;
  onHistoryChange?: (page: number, s: { canUndo: boolean; canRedo: boolean }) => void;
  strokeTime?: () => number | undefined;   // P1 녹음 중이면 획에 찍을 경과 초
  onStrokeTap?: (t: number) => void;       // P1 역방향: 시각 있는 획 탭 → 전사 점프
  displayWidth?: number;                    // 줌 반영 표시 폭(px). 0/undefined면 w-full+maxWidth 폴백.
  nav?: PdfNav;                             // 핀치 줌/팬 위임 핸들
}

const PdfPage: React.FC<PdfPageProps> = ({
  pageNumber, pdfDocument, pen, scale, searchText,
  highlightedIndexes, currentMatchIndex, onPageMatchCalculated, onVisible,
  initialStrokes, onStrokesChange, straightLine = false, shapeMode = false,
  selectMode = false, registerHandle, onHistoryChange, strokeTime, onStrokeTap,
  displayWidth, nav,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  // 드로잉 진행 여부는 ref로 관리 — 합성/연속 pointer 이벤트에서 state 지연 없이 즉시 반영
  const isDrawingRef = useRef(false);
  // 팜리젝션(스타일러스 우선) + 멀티터치 내비(핀치 줌·팬). 캔버스는 touch-action:none로 손가락 제스처를 직접 처리.
  //  · 펜 사용자(penMode): 1손가락=팬, 2손가락=핀치 줌+팬 (손가락은 그리지 않음).
  //  · 손가락 사용자: 1손가락=그리기, 2손가락=핀치 줌+팬.
  const penModeRef = useRef(false);
  const markPen = () => { penModeRef.current = true; };
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<null | { startDist: number; startZoom: number; lastMid: { x: number; y: number } }>(null);
  const panRef = useRef<null | { lastX: number; lastY: number }>(null);
  const touchNavRef = useRef(false);
  const touchList = () => [...activeTouchesRef.current.values()];
  const tDist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const tMid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const startPinch = () => {
    const pts = touchList(); if (pts.length < 2 || !nav) return;
    touchNavRef.current = true; panRef.current = null;
    pinchRef.current = { startDist: tDist(pts[0], pts[1]) || 1, startZoom: nav.getZoom(), lastMid: tMid(pts[0], pts[1]) };
  };
  const updatePinch = () => {
    const pts = touchList(); const st = pinchRef.current; if (pts.length < 2 || !st || !nav) return;
    const nd = tDist(pts[0], pts[1]); const nm = tMid(pts[0], pts[1]);
    const target = Math.min(nav.ZOOM_MAX, Math.max(nav.ZOOM_MIN, st.startZoom * (nd / st.startDist)));
    nav.setZoomAt(target, nm.x, nm.y, nm.x - st.lastMid.x, nm.y - st.lastMid.y);
    st.lastMid = nm;
  };
  // 손가락 그리기 중 두 번째 손가락 → 내비로 전환하며 진행 중이던(미커밋) 획을 폐기.
  const cancelCurrentStroke = () => {
    gestureRef.current = null; currentStrokeRef.current = null; lastRatioRef.current = null; isDrawingRef.current = false;
    redrawStrokes();
  };
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [matches, setMatches] = useState<{textIndex: number, rect: any}[]>([]);
  const [hasText, setHasText] = useState<boolean | null>(null);

  const [strokes, setStrokes] = useState<PageStroke[]>(() => initialStrokes ?? []);
  const strokesRef = useRef<PageStroke[]>(strokes); // 최신 스트로크(변경 알림 계산용)
  strokesRef.current = strokes;
  const currentStrokeRef = useRef<PageStroke | null>(null);
  const lastRatioRef = useRef<InkPoint | null>(null);
  const gestureRef = useRef<InkPoint[] | null>(null); // #4 자/도형 제스처(비율좌표)
  const isGestureMode = () => (straightLine || shapeMode) && pen.type !== 'eraser';

  // ===== undo/redo (스냅샷 기반) =====
  const undoStackRef = useRef<PageStroke[][]>([]);
  const redoStackRef = useRef<PageStroke[][]>([]);
  const notifyHist = () => onHistoryChange?.(pageNumber, { canUndo: undoStackRef.current.length > 0, canRedo: redoStackRef.current.length > 0 });
  // 모든 사용자 변경은 commit을 통해 → 직전 상태를 undo 스택에 스냅샷.
  const commit = (next: PageStroke[]) => {
    undoStackRef.current.push(strokesRef.current);
    redoStackRef.current = [];
    strokesRef.current = next; setStrokes(next); onStrokesChange?.(pageNumber, next);
    notifyHist();
  };
  const undo = () => {
    if (!undoStackRef.current.length) return;
    redoStackRef.current.push(strokesRef.current);
    const prev = undoStackRef.current.pop()!;
    strokesRef.current = prev; setStrokes(prev); onStrokesChange?.(pageNumber, prev);
    setSelection(null); selectionRef.current = null;
    notifyHist();
  };
  const redo = () => {
    if (!redoStackRef.current.length) return;
    undoStackRef.current.push(strokesRef.current);
    const nxt = redoStackRef.current.pop()!;
    strokesRef.current = nxt; setStrokes(nxt); onStrokesChange?.(pageNumber, nxt);
    setSelection(null); selectionRef.current = null;
    notifyHist();
  };
  // 최신 클로저를 참조하는 안정 핸들 등록.
  const undoFnRef = useRef(undo); undoFnRef.current = undo;
  const redoFnRef = useRef(redo); redoFnRef.current = redo;
  const hlFnRef = useRef<(s: number, w: number) => number>(() => 0);
  useEffect(() => {
    registerHandle?.(pageNumber, { undo: () => undoFnRef.current(), redo: () => redoFnRef.current(), highlightByTime: (s, w) => hlFnRef.current(s, w) });
    return () => registerHandle?.(pageNumber, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  // ===== 올가미 선택 (비율좌표, 참조 기반) =====
  type PBox = { x: number; y: number; w: number; h: number };
  const [selection, setSelection] = useState<{ strokes: PageStroke[]; box: PBox } | null>(null);
  const selectionRef = useRef<{ strokes: PageStroke[]; box: PBox } | null>(null);
  const selDragRef = useRef<null | { mode: 'lasso' } | { mode: 'move'; start: InkPoint; baseBox: PBox }>(null);
  const selLassoRef = useRef<InkPoint[] | null>(null);
  const selPreviewRef = useRef<null | { dx: number; dy: number }>(null);
  const applySel = (s: { strokes: PageStroke[]; box: PBox } | null) => { selectionRef.current = s; setSelection(s); };

  const pgPoints = (st: PageStroke) => (st.segs.length ? [st.segs[0].from, ...st.segs.map((s) => s.to)] : []);
  const pgBox = (list: PageStroke[]): PBox | null => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const st of list) for (const p of pgPoints(st)) { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); }
    return isFinite(a) ? { x: a, y: b, w: c - a, h: d - b } : null;
  };
  const pgTranslate = (st: PageStroke, dx: number, dy: number): PageStroke => ({
    ...st, segs: st.segs.map((s) => ({ from: { x: s.from.x + dx, y: s.from.y + dy }, to: { x: s.to.x + dx, y: s.to.y + dy }, width: s.width })),
  });

  // P1: 전사→획 하이라이트(이 페이지에서 sec 근처에 그린 획 영역 반짝). 맞은 획 수 반환.
  const [pdfHighlight, setPdfHighlight] = useState<PBox | null>(null);
  const pdfHlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightByTime = (sec: number, win: number): number => {
    const m = strokesRef.current.filter((st) => st.t !== undefined && Math.abs((st.t as number) - sec) <= win);
    if (!m.length) return 0;
    const box = pgBox(m);
    if (box) {
      setPdfHighlight(box);
      if (pdfHlTimerRef.current) clearTimeout(pdfHlTimerRef.current);
      pdfHlTimerRef.current = setTimeout(() => setPdfHighlight(null), 1800);
    }
    return m.length;
  };
  hlFnRef.current = highlightByTime;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio > 0.5) {
            onVisible(pageNumber);
          }
        });
      },
      { threshold: [0.1, 0.5, 0.9] }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pageNumber, onVisible]);

  useEffect(() => {
    let renderTask: any;
    let isMounted = true;
    
    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (!isMounted) return;
        
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        // 내부 해상도만 렌더 스케일로 설정. 표시 크기는 CSS(w-full)가 컨테이너에 맞춤.
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setDimensions({ width: viewport.width, height: viewport.height });

        renderTask = page.render({
          canvas: canvas,
          canvasContext: ctx,
          viewport: viewport
        });
        await renderTask.promise;

        // Text content
        const textContent = await page.getTextContent();
        if (!isMounted) return;

        let pageMatches: {textIndex: number, rect: any}[] = [];
        if (textContent.items.length === 0) {
            setHasText(false);
        } else {
            setHasText(true);
            if (searchText) {
               const query = searchText.toLowerCase();
               textContent.items.forEach((item: any, i) => {
                  if (item.str && item.str.toLowerCase().includes(query)) {
                     const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
                     const fontHeight = Math.sqrt((tx[2]*tx[2]) + (tx[3]*tx[3]));
                     const fontAscent = item.fontAscent ? item.fontAscent : 0.8;
                     const textWidth = item.width * scale;
                     // 비율(0~1)로 저장 → CSS 표시 크기와 무관하게 정확히 정렬
                     pageMatches.push({
                        textIndex: i,
                        rect: {
                            left: tx[4] / viewport.width,
                            top: (tx[5] - fontAscent * fontHeight) / viewport.height,
                            width: textWidth / viewport.width,
                            height: fontHeight / viewport.height
                        }
                     });
                  }
               });
            }
        }
        setMatches(pageMatches);
        onPageMatchCalculated(pageNumber - 1, pageMatches);

      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error("PDF Render Error:", err);
        }
      }
    };
    renderPage();
    return () => {
      isMounted = false;
      if (renderTask) {
         try {
           renderTask.cancel();
         } catch (e) {}
      }
    }
  }, [pageNumber, pdfDocument, scale, searchText]);

  // Adjust drawing canvas and redraw strokes
  useEffect(() => {
    const dCanvas = drawingCanvasRef.current;
    if (dCanvas && dimensions.width && dimensions.height) {
        dCanvas.width = dimensions.width;   // 내부 해상도 = 렌더 페이지와 동일
        dCanvas.height = dimensions.height;
        redrawStrokes();
    }
  }, [dimensions, strokes]);

  // 선택 모드를 끄면 선택·프리뷰·올가미 정리
  useEffect(() => {
    if (!selectMode) {
      selPreviewRef.current = null; selDragRef.current = null; selLassoRef.current = null;
      if (selectionRef.current) { selectionRef.current = null; setSelection(null); }
      redrawStrokes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode]);

  // 비율좌표(0~1) → 내부 픽셀 InkSegment 환산 후 공용 엔진으로 렌더.
  // seg.width는 이미 내부 해상도 px로 저장돼 있다(draw에서 CSS 축소 보정).
  const paintSeg = (ctx: CanvasRenderingContext2D, stroke: PageStroke, seg: PageInkSeg) => {
    const W = dimensions.width, H = dimensions.height;
    const inkSeg: InkSegment = {
      from: { x: seg.from.x * W, y: seg.from.y * H },
      to:   { x: seg.to.x * W,   y: seg.to.y * H },
      penType: stroke.penType,
      color: stroke.color,
      width: seg.width,
      opacity: stroke.opacity,
    };
    renderInkSegment(ctx, inkSeg);
  };

  const redrawStrokes = () => {
      const dCanvas = drawingCanvasRef.current;
      const ctx = dCanvas?.getContext('2d');
      if (!ctx || !dCanvas || dimensions.width === 0) return;
      const W = dimensions.width, H = dimensions.height;
      ctx.clearRect(0, 0, dCanvas.width, dCanvas.height);
      const pv = selPreviewRef.current, selSet = pv && selectionRef.current ? new Set(selectionRef.current.strokes) : null;
      strokesRef.current.forEach(stroke => {
         if (!stroke || !stroke.segs || stroke.segs.length === 0) return;
         // 이동 중인 선택 획은 변형본으로 미리보기(저장 데이터 불변)
         const st = (selSet && pv && selSet.has(stroke)) ? pgTranslate(stroke, pv.dx, pv.dy) : stroke;
         renderStrokeSmoothed(ctx, {
           penType: st.penType, color: st.color, opacity: st.opacity,
           segs: st.segs.map(s => ({ from: { x: s.from.x * W, y: s.from.y * H }, to: { x: s.to.x * W, y: s.to.y * H }, width: s.width })),
         });
      });
  };

  const getCoordinatesRatio = (e: React.PointerEvent<HTMLCanvasElement>): InkPoint => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    };
  };
  // 고주사율 입력: coalesced 중간 점들을 비율좌표+필압으로 모두 반환(빠른 획 각짐 제거).
  const coalescedRatioPoints = (e: React.PointerEvent<HTMLCanvasElement>): Array<InkPoint & { pressure: number }> => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return [];
    const rect = canvas.getBoundingClientRect();
    const nat = e.nativeEvent;
    const coalesced = typeof nat.getCoalescedEvents === 'function' ? nat.getCoalescedEvents() : [];
    const list: Array<{ clientX: number; clientY: number; pressure: number }> = coalesced.length ? coalesced : [nat];
    return list.map((ev) => ({ x: (ev.clientX - rect.left) / rect.width, y: (ev.clientY - rect.top) / rect.height, pressure: ev.pressure }));
  };

  // #4 제스처 미리보기(직선 스냅 / 자유곡선) — 픽셀로 그린다.
  const drawGesturePreviewPdf = () => {
    const dCanvas = drawingCanvasRef.current; const ctx = dCanvas?.getContext('2d');
    const pts = gestureRef.current;
    if (!ctx || !dCanvas || !pts || pts.length < 1 || !dimensions.width) return;
    const W = dimensions.width, H = dimensions.height;
    const sf = dCanvas.width / (dCanvas.getBoundingClientRect().width || dCanvas.width);
    redrawStrokes();
    ctx.save();
    ctx.globalAlpha = pen.opacity; ctx.strokeStyle = pen.color; ctx.lineWidth = widthForPressure(pen, 0.5) * sf;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (straightLine) {
      const a = pts[0], b = snapLineEnd(a, pts[pts.length - 1]);
      ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H);
    } else {
      ctx.moveTo(pts[0].x * W, pts[0].y * H);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * W, pts[i].y * H);
    }
    ctx.stroke(); ctx.restore();
  };

  // ===== 올가미 포인터 =====
  const drawLassoPdf = () => {
    const dCanvas = drawingCanvasRef.current; const ctx = dCanvas?.getContext('2d');
    const pts = selLassoRef.current;
    if (!ctx || !dCanvas || !pts || pts.length < 2 || !dimensions.width) return;
    const W = dimensions.width, H = dimensions.height;
    const sf = dCanvas.width / (dCanvas.getBoundingClientRect().width || dCanvas.width);
    redrawStrokes();
    ctx.save(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5 * sf; ctx.setLineDash([6 * sf, 4 * sf]);
    ctx.beginPath(); ctx.moveTo(pts[0].x * W, pts[0].y * H);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * W, pts[i].y * H);
    ctx.stroke(); ctx.restore();
  };
  const selectDown = (pt: InkPoint) => {
    const sel = selectionRef.current;
    if (sel && pt.x >= sel.box.x && pt.x <= sel.box.x + sel.box.w && pt.y >= sel.box.y && pt.y <= sel.box.y + sel.box.h) {
      selDragRef.current = { mode: 'move', start: pt, baseBox: { ...sel.box } }; return;
    }
    selDragRef.current = { mode: 'lasso' }; selLassoRef.current = [pt]; applySel(null);
  };
  const selectMove = (pt: InkPoint) => {
    const d = selDragRef.current; if (!d) return;
    if (d.mode === 'lasso') { selLassoRef.current?.push(pt); drawLassoPdf(); return; }
    const dx = pt.x - d.start.x, dy = pt.y - d.start.y;
    selPreviewRef.current = { dx, dy }; redrawStrokes();
    setSelection((s) => s ? { ...s, box: { x: d.baseBox.x + dx, y: d.baseBox.y + dy, w: d.baseBox.w, h: d.baseBox.h } } : s);
  };
  const selectUp = () => {
    const d = selDragRef.current; selDragRef.current = null; if (!d) return;
    if (d.mode === 'lasso') {
      const poly = selLassoRef.current ?? []; selLassoRef.current = null;
      if (poly.length < 3) {
        // 탭: 시각(t) 있는 획을 짚으면 전사로 점프
        const tap = poly[0];
        if (tap && onStrokeTap) {
          const W = dimensions.width || 1, thr = 14 / W;
          let hitT: number | undefined;
          for (const st of strokesRef.current) {
            if (st.t === undefined || st.penType === 'eraser') continue;
            if (st.segs.some((s) => distancePointToSegment(tap, s.from, s.to) <= thr + (s.width / 2) / W)) hitT = st.t;
          }
          if (hitT !== undefined) onStrokeTap(hitT);
        }
        redrawStrokes(); return;
      }
      const picked = strokesRef.current.filter((st) => { const pts = pgPoints(st); if (!pts.length) return false; let ins = 0; for (const p of pts) if (pointInPolygon(p, poly)) ins++; return ins >= pts.length / 2; });
      const box = picked.length ? pgBox(picked) : null;
      applySel(box ? { strokes: picked, box } : null); redrawStrokes(); return;
    }
    const pv = selPreviewRef.current; selPreviewRef.current = null;
    const sel = selectionRef.current;
    if (!pv || !sel) { redrawStrokes(); return; }
    const m = new Map<PageStroke, PageStroke>();
    sel.strokes.forEach((st) => m.set(st, pgTranslate(st, pv.dx, pv.dy)));
    commit(strokesRef.current.map((st) => m.get(st) ?? st));
    const moved = [...m.values()], box = pgBox(moved);
    applySel(box ? { strokes: moved, box } : null);
  };
  const deleteSel = () => { const sel = selectionRef.current; if (!sel) return; const set = new Set(sel.strokes); commit(strokesRef.current.filter((st) => !set.has(st))); applySel(null); };
  const duplicateSel = () => { const sel = selectionRef.current; if (!sel) return; const copies = sel.strokes.map((st) => pgTranslate(st, 0.03, 0.03)); commit([...strokesRef.current, ...copies]); const box = pgBox(copies); applySel(box ? { strokes: copies, box } : null); };
  const recolorSel = (color: string) => {
    const sel = selectionRef.current; if (!sel) return;
    const m = new Map<PageStroke, PageStroke>();
    sel.strokes.forEach((st) => m.set(st, { ...st, color, segs: st.segs.map((s) => ({ from: { ...s.from }, to: { ...s.to }, width: s.width })) }));
    commit(strokesRef.current.map((st) => m.get(st) ?? st));
    const news = [...m.values()], box = pgBox(news);
    applySel(box ? { strokes: news, box } : null);
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen') markPen();
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
      if (activeTouchesRef.current.size >= 2) { cancelCurrentStroke(); startPinch(); return; } // 2손가락 = 핀치 줌/팬
      if (penModeRef.current) { touchNavRef.current = true; panRef.current = { lastX: e.clientX, lastY: e.clientY }; return; } // 펜모드 1손가락 = 팬
      // 손가락 사용자 1손가락 = 그리기 → 아래로 진행
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const ratio = getCoordinatesRatio(e);
    if (selectMode) { selectDown(ratio); return; }
    isDrawingRef.current = true;
    if (isGestureMode()) { gestureRef.current = [ratio]; return; }
    lastRatioRef.current = ratio;
    currentStrokeRef.current = {
      penType: pen.type,
      color: pen.color,
      opacity: pen.opacity,
      segs: [],
    };
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      if (activeTouchesRef.current.has(e.pointerId)) activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current && activeTouchesRef.current.size >= 2) { updatePinch(); return; }
      if (panRef.current && penModeRef.current && nav) { nav.panBy(e.clientX - panRef.current.lastX, e.clientY - panRef.current.lastY); panRef.current = { lastX: e.clientX, lastY: e.clientY }; return; }
      if (penModeRef.current || touchNavRef.current) return; // 펜모드 손가락/내비 중 → 그리기 안 함
      // 손가락 사용자 1손가락 그리기 → 아래로 진행
    }
    if (selectMode) { if (selDragRef.current) selectMove(getCoordinatesRatio(e)); return; }
    if (!isDrawingRef.current) return;
    const pts = coalescedRatioPoints(e); // 고주사율: 중간 점들까지 전부
    if (gestureRef.current) { for (const p of pts) gestureRef.current.push({ x: p.x, y: p.y }); drawGesturePreviewPdf(); return; }
    if (!currentStrokeRef.current) return;

    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    // 표시 px 굵기를 내부 해상도 px로 환산해 저장 (CSS 축소 보정)
    const sf = dCanvas.width / (dCanvas.getBoundingClientRect().width || dCanvas.width);
    const ctx = dCanvas.getContext('2d');
    // 마우스는 pressure=0 → inkEngine에서 0.5로 폴백. S펜/애플펜슬은 각 점의 실제 필압.
    for (const p of pts) {
      const from = lastRatioRef.current;
      const to = { x: p.x, y: p.y };
      if (!from) { lastRatioRef.current = to; continue; }
      const width = widthForPressure(pen, p.pressure) * sf;
      const seg: PageInkSeg = { from, to, width };
      currentStrokeRef.current.segs.push(seg);
      // 성능을 위해 전체 재렌더 대신 델타 한 조각만 그린다.
      if (ctx && dimensions.width) paintSeg(ctx, currentStrokeRef.current, seg);
      lastRatioRef.current = to;
    }
  };

  const stopDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      const wasNav = penModeRef.current || pinchRef.current !== null || panRef.current !== null || touchNavRef.current;
      activeTouchesRef.current.delete(e.pointerId);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      if (activeTouchesRef.current.size < 2) pinchRef.current = null;
      if (activeTouchesRef.current.size === 0) { panRef.current = null; touchNavRef.current = false; }
      else if (penModeRef.current && activeTouchesRef.current.size === 1) { const rem = touchList()[0]; panRef.current = { lastX: rem.x, lastY: rem.y }; }
      if (wasNav) return;
      // 손가락 사용자 그리기 종료 → 아래로 진행
    }
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (selectMode) { selectUp(); return; }
    // #4 자/도형 제스처 확정
    if (gestureRef.current) {
      const pts = gestureRef.current; gestureRef.current = null; isDrawingRef.current = false;
      const dCanvas = drawingCanvasRef.current;
      if (pts.length < 2 || !dCanvas || !dimensions.width) { redrawStrokes(); return; }
      const sf = dCanvas.width / (dCanvas.getBoundingClientRect().width || dCanvas.width);
      const width = widthForPressure(pen, 0.5) * sf;
      const W = dimensions.width, H = dimensions.height;
      let ratioPts: InkPoint[];
      if (straightLine) {
        ratioPts = [pts[0], snapLineEnd(pts[0], pts[pts.length - 1])];
      } else {
        const pxPts = pts.map(p => ({ x: p.x * W, y: p.y * H }));
        const shape = recognizeShape(pxPts);
        ratioPts = shape ? shapeToPoints(shape).map(p => ({ x: p.x / W, y: p.y / H })) : pts;
      }
      const segs: PageInkSeg[] = [];
      for (let i = 1; i < ratioPts.length; i++) segs.push({ from: ratioPts[i - 1], to: ratioPts[i], width });
      const stroke: PageStroke = { penType: pen.type, color: pen.color, opacity: pen.opacity, segs };
      const gt = strokeTime?.(); if (gt !== undefined) stroke.t = gt;
      commit([...strokesRef.current, stroke]);
      return;
    }
    // 스트로크를 지역변수로 먼저 캡처. (업데이터 안에서 ref를 읽으면 아래 null 대입 후
    //  실행돼 null이 저장되는 버그가 있어 redrawStrokes가 복원하지 못했음)
    const finishedStroke = currentStrokeRef.current;
    if (isDrawingRef.current && finishedStroke && finishedStroke.segs.length > 0) {
        const ft = strokeTime?.(); if (ft !== undefined) finishedStroke.t = ft;
        commit([...strokesRef.current, finishedStroke]); // undo 기록 + 저장 트리거
    }
    currentStrokeRef.current = null;
    lastRatioRef.current = null;
    isDrawingRef.current = false;
  };

  return (
    <div
      ref={containerRef}
      className={cn('pdf-page relative mb-6 shadow-sm border border-slate-200 bg-white mx-auto shrink-0', !displayWidth && 'w-full')}
      style={{ width: displayWidth || undefined, maxWidth: displayWidth ? undefined : 820, aspectRatio: dimensions.width ? `${dimensions.width} / ${dimensions.height}` : '612 / 792' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0 bg-white" />

      {/* Target Highlights (비율 → %, CSS 표시 크기와 무관하게 정렬) */}
      <div className="absolute inset-0 z-10 pointer-events-none" ref={textLayerRef}>
         {matches.map((m, i) => {
             const isCurrent = highlightedIndexes.findIndex(hi => hi.pageIndex === pageNumber - 1 && hi.matchIndex === i) === currentMatchIndex;
             return (
                 <div
                    key={i}
                    className={cn("absolute rounded-sm transition-colors", isCurrent ? "bg-amber-500/50 outline outline-2 outline-amber-600" : "bg-amber-400/30")}
                    style={{ left: `${m.rect.left * 100}%`, top: `${m.rect.top * 100}%`, width: `${m.rect.width * 100}%`, height: `${m.rect.height * 100}%` }}
                 />
             );
         })}
      </div>

      <canvas
        ref={drawingCanvasRef}
        onPointerDown={startDraw}
        onPointerMove={draw}
        onPointerUp={stopDraw}
        onPointerCancel={stopDraw}
        onPointerLeave={stopDraw}
        className="absolute inset-0 w-full h-full touch-none z-20"
        style={{ cursor: selectMode ? 'crosshair' : cursorForPen(pen) }}
      />

      {/* 올가미 선택 오버레이 (비율 → %) */}
      {selectMode && selection && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          <div className="absolute border-2 border-blue-500 border-dashed rounded-sm"
            style={{ left: `${selection.box.x * 100}%`, top: `${selection.box.y * 100}%`, width: `${selection.box.w * 100}%`, height: `${selection.box.h * 100}%` }} />
          <div className="absolute flex items-center gap-1 bg-white rounded-lg shadow-lg border border-slate-200 px-1.5 py-1 pointer-events-auto"
            style={{ left: `${selection.box.x * 100}%`, top: `calc(${selection.box.y * 100}% - 42px)` }}>
            <button onClick={duplicateSel} title="복제" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><Copy className="w-4 h-4" /></button>
            <button onClick={deleteSel} title="삭제" className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-slate-200 mx-0.5" />
            {['#334155', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map((c) => (
              <button key={c} onClick={() => recolorSel(c)} title="색 변경" className="w-5 h-5 rounded-full border border-slate-200 hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
      )}

      {/* P1: 전사 라인 클릭 시 그 시각에 그린 획 하이라이트 */}
      {pdfHighlight && (
        <div className="absolute z-30 rounded-lg border-2 border-amber-400 bg-amber-300/20 pointer-events-none animate-pulse"
          style={{ left: `${pdfHighlight.x * 100}%`, top: `${pdfHighlight.y * 100}%`, width: `${pdfHighlight.w * 100}%`, height: `${pdfHighlight.h * 100}%` }} />
      )}
      
      {hasText === false && searchText && (
        <div className="absolute top-2 left-2 right-2 bg-slate-800/80 text-white text-xs px-3 py-2 rounded-lg text-center backdrop-blur-sm z-30">
          이 PDF는 텍스트 검색을 지원하지 않습니다(이미지 기반).
        </div>
      )}
    </div>
  );
};

export interface PdfRendererHandle { highlightByTime: (sec: number, win?: number) => number; }

export const PdfAdvancedRenderer = forwardRef<PdfRendererHandle, {
  fileUrl: string | null;
  pen: PenModel;
  activeType: PenType;
  setActiveType: (t: PenType) => void;
  updateActivePen: (patch: Partial<PenModel>) => void;
  fileName: string;
  initialPageStrokes?: PdfPageStrokes; // 저장된 페이지별 필기 복원용
  onStrokesChange?: (pages: PdfPageStrokes) => void; // 전체 페이지 필기 변경 알림(저장용)
  strokeTime?: () => number | undefined; // P1 녹음 시각 스탬프
  onStrokeTap?: (t: number) => void;     // P1 역방향: 획 탭 → 전사 점프
  recordSlot?: React.ReactNode;          // PDF 헤더에 넣을 녹음 버튼
}>(({
  fileUrl,
  pen,
  activeType,
  setActiveType,
  updateActivePen,
  fileName,
  initialPageStrokes,
  onStrokesChange,
  strokeTime,
  onStrokeTap,
  recordSlot,
}, ref) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  // PDF 자체 도구 상태(캔버스 노트 툴바가 PDF엔 안 보이므로 여기서 관리)
  const [selectMode, setSelectMode] = useState(false);
  const [straightLine, setStraightLine] = useState(false);
  const [shapeMode, setShapeMode] = useState(false);
  const pickTool = (tool: 'pen' | 'select' | 'straight' | 'shape') => {
    setSelectMode(tool === 'select'); setStraightLine(tool === 'straight'); setShapeMode(tool === 'shape');
  };
  // 페이지별 undo/redo 핸들 + 현재 페이지 히스토리 상태
  const pageHandlesRef = useRef<Map<number, { undo: () => void; redo: () => void; highlightByTime: (sec: number, win: number) => number }>>(new Map());
  const [pageHist, setPageHist] = useState<Record<number, { canUndo: boolean; canRedo: boolean }>>({});
  const registerPageHandle = (page: number, h: { undo: () => void; redo: () => void; highlightByTime: (sec: number, win: number) => number } | null) => {
    if (h) pageHandlesRef.current.set(page, h); else pageHandlesRef.current.delete(page);
  };
  const onPageHistory = (page: number, s: { canUndo: boolean; canRedo: boolean }) => setPageHist((prev) => ({ ...prev, [page]: s }));
  // 고정 렌더 해상도. 표시 크기는 displayWidth(줌 반영)로 조절한다.
  const [scale] = useState(2);

  // ── PDF 줌 (버튼·Ctrl+휠·2손가락 핀치) ─────────────────────────────
  const PDF_ZOOM_MIN = 0.5, PDF_ZOOM_MAX = 4;
  const [pdfZoom, setPdfZoom] = useState(1);
  const pdfZoomRef = useRef(1); pdfZoomRef.current = pdfZoom;
  const [baseWidth, setBaseWidth] = useState(0); // 줌 100% 기준 표시 폭(px) = min(컨테이너폭-패딩, 820)
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);
  const clampPdfZoom = (z: number) => Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, Math.round(z * 1000) / 1000));
  const setPdfZoomClamped = (z: number | ((p: number) => number)) =>
    setPdfZoom((prev) => clampPdfZoom(typeof z === 'function' ? z(prev) : z));
  // 손가락 중점/커서를 고정한 채 줌 + 팬. 줌 변화가 미미하면 순수 팬(리렌더 없이 스크롤만).
  const setZoomAt = (target: number, midX: number, midY: number, panDx: number, panDy: number) => {
    const el = containerRef.current; if (!el) return;
    const cur = pdfZoomRef.current;
    const t = clampPdfZoom(target);
    const f = t / cur;
    const rect = el.getBoundingClientRect();
    const cx = midX - rect.left, cy = midY - rect.top;
    const left = (el.scrollLeft + cx) * f - cx - panDx;
    const top = (el.scrollTop + cy) * f - cy - panDy;
    if (Math.abs(f - 1) < 0.0015) { el.scrollLeft = Math.max(0, left); el.scrollTop = Math.max(0, top); }
    else { pendingScrollRef.current = { left, top }; setPdfZoom(t); }
  };
  const navRef = useRef<PdfNav>({ getZoom: () => 1, setZoomAt, panBy: () => {}, ZOOM_MIN: PDF_ZOOM_MIN, ZOOM_MAX: PDF_ZOOM_MAX });
  navRef.current = {
    getZoom: () => pdfZoomRef.current,
    setZoomAt,
    panBy: (dx, dy) => { const el = containerRef.current; if (el) { el.scrollLeft -= dx; el.scrollTop -= dy; } },
    ZOOM_MIN: PDF_ZOOM_MIN, ZOOM_MAX: PDF_ZOOM_MAX,
  };
  const displayWidth = baseWidth ? baseWidth * pdfZoom : 0;

  const [searchText, setSearchText] = useState("");
  const [allMatches, setAllMatches] = useState<{pageIndex: number, matches: any[]}[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fileUrl) return;
    const loadPdf = async () => {
      try {
        const doc = await pdfjsLib.getDocument({ url: fileUrl.toString() }).promise;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        console.error("Failed to load PDF:", err);
      }
    };
    loadPdf();
  }, [fileUrl]);

  // 특정 페이지로 스크롤 (이전/다음 화살표용)
  const scrollToPage = (n: number) => {
    const clamped = Math.max(1, Math.min(numPages, n));
    const pages = containerRef.current?.querySelectorAll('.pdf-page');
    pages?.[clamped - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // P1: 전사 라인 클릭 → 모든 페이지에서 그 시각의 획 하이라이트 + 첫 매칭 페이지로 스크롤.
  useImperativeHandle(ref, () => ({
    highlightByTime: (sec: number, win = 6) => {
      let total = 0, firstPage = -1;
      for (const [page, h] of pageHandlesRef.current) {
        const c = h.highlightByTime(sec, win);
        if (c > 0) { total += c; if (firstPage < 0 || page < firstPage) firstPage = page; }
      }
      if (firstPage > 0) scrollToPage(firstPage);
      return total;
    },
  }));

  // 페이지별 필기를 모아 두었다가 변경 시 상위(LiveNoteView)로 통지 → 노트에 저장.
  const pagesRef = useRef<PdfPageStrokes>(initialPageStrokes ?? {});
  const handlePageStrokesChange = (pageNumber: number, pageStrokes: PageStroke[]) => {
    pagesRef.current = { ...pagesRef.current, [pageNumber]: pageStrokes };
    onStrokesChange?.(pagesRef.current);
  };

  const handlePageMatchCalculated = (pageIndex: number, matches: any[]) => {
      setAllMatches(prev => {
          const newArr = [...prev];
          const existing = newArr.findIndex(x => x.pageIndex === pageIndex);
          if (existing >= 0) {
              newArr[existing].matches = matches;
          } else {
              newArr.push({ pageIndex, matches });
          }
          return newArr.sort((a,b) => a.pageIndex - b.pageIndex);
      });
  };

  const totalMatchesCount = allMatches.reduce((acc, curr) => acc + curr.matches.length, 0);
  
  // Calculate flattened match index list
  const flatMatches = allMatches.flatMap(pm => pm.matches.map((m, i) => ({ pageIndex: pm.pageIndex, matchIndex: i })));

  const handleNextMatch = () => {
      if (totalMatchesCount === 0) return;
      const nextIdx = (currentMatchIndex + 1) % totalMatchesCount;
      setCurrentMatchIndex(nextIdx);
      scrollToMatch(nextIdx);
  };
  
  const handlePrevMatch = () => {
      if (totalMatchesCount === 0) return;
      const prevIdx = (currentMatchIndex - 1 + totalMatchesCount) % totalMatchesCount;
      setCurrentMatchIndex(prevIdx);
      scrollToMatch(prevIdx);
  };

  const scrollToMatch = (idx: number) => {
      const match = flatMatches[idx];
      if (!match || !containerRef.current) return;
      const pages = containerRef.current.querySelectorAll('.relative.mb-6');
      if (pages[match.pageIndex]) {
          pages[match.pageIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
  };

  useEffect(() => {
     if (searchText === "") {
         setAllMatches([]);
         setCurrentMatchIndex(-1);
     }
  }, [searchText]);

  // 줌 100% 기준 표시 폭 측정(컨테이너 폭 - 좌우 패딩 48px, 최대 820).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setBaseWidth(Math.max(0, Math.min(el.clientWidth - 48, 820)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfDoc]);

  // 핀치/휠 줌으로 페이지가 리사이즈된 직후, 중점을 고정하도록 스크롤 보정.
  useLayoutEffect(() => {
    const p = pendingScrollRef.current; const el = containerRef.current;
    if (p && el) { el.scrollLeft = Math.max(0, p.left); el.scrollTop = Math.max(0, p.top); pendingScrollRef.current = null; }
  }, [pdfZoom]);

  // Ctrl/⌘ + 휠 = 커서 기준 줌. React onWheel은 passive라 preventDefault가 안 되므로 네이티브(비패시브)로 등록.
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoomAt(pdfZoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY, 0, 0);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pdfDoc]);

  if (!pdfDoc) {
     return (
         <div className="absolute inset-0 flex items-center justify-center bg-slate-50 opacity-80 backdrop-blur z-0 rounded-md border border-slate-200">
            <div className="flex flex-col items-center gap-3">
               <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
               <p className="text-sm font-medium text-slate-500">PDF 로딩 중...</p>
            </div>
         </div>
     )
  }

  return (
    <div className="absolute inset-0 flex flex-col pt-16 z-0 bg-slate-200 rounded-md overflow-hidden border border-slate-200 shadow-inner">
      {/* Search Bar */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between shadow-sm z-30">
         <h2 className="text-slate-600 font-bold max-w-[200px] truncate text-sm">{fileName}</h2>
         
         <div className="flex items-center gap-1 font-mono text-sm text-slate-500 font-bold bg-slate-50 px-1.5 py-1 rounded-lg border border-slate-200">
             <button onClick={() => scrollToPage(currentPageNum - 1)} disabled={currentPageNum <= 1} className="p-1 rounded hover:bg-white disabled:opacity-30 transition-colors" title="이전 페이지"><ChevronLeft className="w-4 h-4" /></button>
             <span className="px-1.5">{currentPageNum} / {numPages}</span>
             <button onClick={() => scrollToPage(currentPageNum + 1)} disabled={currentPageNum >= numPages} className="p-1 rounded hover:bg-white disabled:opacity-30 transition-colors" title="다음 페이지"><ChevronRight className="w-4 h-4" /></button>
         </div>

         <div className="flex items-center gap-2 flex-1 max-w-[320px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500 transition-all">
            <Search className="w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="단어 검색..." 
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full font-medium placeholder:text-slate-400"
            />
            {searchText && (
                <button onClick={() => setSearchText("")} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
            )}
         </div>
         <div className="flex items-center gap-3 text-sm text-slate-500 font-medium">
             {searchText && (
                 <span>{totalMatchesCount > 0 ? `${currentMatchIndex + 1} / ${totalMatchesCount}` : "결과 없음"}</span>
             )}
             <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                 <button onClick={handlePrevMatch} className="p-1 hover:bg-white rounded transition-colors" disabled={totalMatchesCount === 0}><ChevronUp className="w-4 h-4" /></button>
                 <button onClick={handleNextMatch} className="p-1 hover:bg-white rounded transition-colors" disabled={totalMatchesCount === 0}><ChevronDown className="w-4 h-4" /></button>
             </div>
         </div>
         {recordSlot && <div className="shrink-0">{recordSlot}</div>}
      </div>

      {/* 공용 펜 툴바 + 도구(빈 노트와 동일: 5종 펜 · undo/redo · 올가미 · 자 · 도형) */}
      <div className="absolute top-[4.5rem] left-4 z-40 bg-white rounded-xl border border-slate-200 shadow-lg px-3 py-2 flex items-center gap-1.5">
         <button onClick={() => pageHandlesRef.current.get(currentPageNum)?.undo()} disabled={!pageHist[currentPageNum]?.canUndo} title="실행취소"
           className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"><Undo2 className="w-5 h-5" /></button>
         <button onClick={() => pageHandlesRef.current.get(currentPageNum)?.redo()} disabled={!pageHist[currentPageNum]?.canRedo} title="다시실행"
           className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"><Redo2 className="w-5 h-5" /></button>
         <div className="w-px h-6 bg-slate-200 mx-0.5" />
         <PenToolbar
           activeType={activeType}
           activePen={pen}
           setActiveType={(t) => { pickTool('pen'); setActiveType(t); }}
           updateActivePen={updateActivePen}
         />
         <div className="w-px h-6 bg-slate-200 mx-0.5" />
         {/* 3색 퀵 팔레트(즐겨찾기) — 캔버스 노트와 동일하게 올가미 바로 왼쪽 */}
         <QuickColorPalette
           activeColor={pen.color}
           onPick={(c) => { pickTool('pen'); updateActivePen({ color: c }); }}
         />
         <div className="w-px h-6 bg-slate-200 mx-0.5" />
         <button onClick={() => pickTool(selectMode ? 'pen' : 'select')} title="올가미 선택"
           className={cn("p-2 rounded-lg transition-colors", selectMode ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")}><Lasso className="w-5 h-5" /></button>
         <button onClick={() => pickTool(straightLine ? 'pen' : 'straight')} title="자 (반듯한 직선)"
           className={cn("p-2 rounded-lg transition-colors", straightLine ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")}><Ruler className="w-5 h-5" /></button>
         <button onClick={() => pickTool(shapeMode ? 'pen' : 'shape')} title="도형 보정"
           className={cn("p-2 rounded-lg transition-colors", shapeMode ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")}><Shapes className="w-5 h-5" /></button>
      </div>

      {/* Scrollable Document Area — 줌 시 가로 스크롤(overflow-auto) + w-max 래퍼로 좌우 대칭 스크롤 보장 */}
      <div className="flex-1 overflow-auto p-6 bg-slate-100 custom-scrollbar" ref={containerRef}>
        <div className="min-w-full w-max mx-auto flex flex-col items-center">
         {Array.from({ length: numPages }, (_, i) => (
             <PdfPage
               key={i}
               pageNumber={i + 1}
               pdfDocument={pdfDoc}
               pen={pen}
               scale={scale}
               searchText={searchText}
               highlightedIndexes={flatMatches}
               currentMatchIndex={currentMatchIndex}
               onPageMatchCalculated={handlePageMatchCalculated}
               onVisible={setCurrentPageNum}
               initialStrokes={initialPageStrokes?.[i + 1]}
               onStrokesChange={handlePageStrokesChange}
               straightLine={straightLine}
               shapeMode={shapeMode}
               selectMode={selectMode}
               registerHandle={registerPageHandle}
               onHistoryChange={onPageHistory}
               strokeTime={strokeTime}
               onStrokeTap={onStrokeTap}
               displayWidth={displayWidth}
               nav={navRef.current}
             />
         ))}
        </div>
      </div>

      {/* 확대/축소 컨트롤 (100% = 화면 맞춤). Ctrl/⌘+휠·2손가락 핀치로도 조절. 우하단. */}
      <div className="absolute bottom-4 right-4 z-40 flex items-center gap-0.5 bg-white/95 backdrop-blur border border-slate-200 rounded-full shadow-md px-1 py-1 select-none">
        <button onClick={() => setPdfZoomClamped((z) => z / 1.25)} title="축소" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 disabled:opacity-40" disabled={pdfZoom <= PDF_ZOOM_MIN}><Minus className="w-4 h-4" /></button>
        <button onClick={() => setPdfZoom(1)} title="100%로 맞춤" className="text-xs font-bold text-slate-700 w-12 tabular-nums hover:text-violet-600">{Math.round(pdfZoom * 100)}%</button>
        <button onClick={() => setPdfZoomClamped((z) => z * 1.25)} title="확대" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 disabled:opacity-40" disabled={pdfZoom >= PDF_ZOOM_MAX}><Plus className="w-4 h-4" /></button>
      </div>
    </div>
  );
});
