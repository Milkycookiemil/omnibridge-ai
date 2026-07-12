import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PenToolbar } from '../ink/PenToolbar';
import {
  renderInkSegment, renderStrokeSmoothed, widthForPressure, cursorForPen,
  snapLineEnd, recognizeShape, shapeToPoints,
  type InkSegment, type PenModel, type PenType,
} from '../../lib/inkEngine';
// 페이지별 비율좌표(0~1) 저장 구조 — 노트 영속화를 위해 공용 모듈에서 가져온다.
import type { InkPoint, PageInkSeg, PageStroke, PdfPageStrokes } from '../../lib/pdfInk';

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
}

const PdfPage: React.FC<PdfPageProps> = ({
  pageNumber, pdfDocument, pen, scale, searchText,
  highlightedIndexes, currentMatchIndex, onPageMatchCalculated, onVisible,
  initialStrokes, onStrokesChange, straightLine = false, shapeMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  // 드로잉 진행 여부는 ref로 관리 — 합성/연속 pointer 이벤트에서 state 지연 없이 즉시 반영
  const isDrawingRef = useRef(false);
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
      strokes.forEach(stroke => {
         if (!stroke || !stroke.segs || stroke.segs.length === 0) return;
         // 비율좌표(0~1) → 픽셀 변환 후 공용 스무딩 렌더(각짐 제거). 빈 노트와 동일.
         renderStrokeSmoothed(ctx, {
           penType: stroke.penType, color: stroke.color, opacity: stroke.opacity,
           segs: stroke.segs.map(s => ({ from: { x: s.from.x * W, y: s.from.y * H }, to: { x: s.to.x * W, y: s.to.y * H }, width: s.width })),
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

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    isDrawingRef.current = true;
    const ratio = getCoordinatesRatio(e);
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
    if (!isDrawingRef.current) return;
    if (gestureRef.current) { gestureRef.current.push(getCoordinatesRatio(e)); drawGesturePreviewPdf(); return; }
    if (!currentStrokeRef.current) return;
    const from = lastRatioRef.current;
    const to = getCoordinatesRatio(e);
    if (!from) { lastRatioRef.current = to; return; }

    // 마우스는 pressure=0 → inkEngine에서 0.5로 폴백. S펜/애플펜슬은 실제 필압.
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    // 표시 px 굵기를 내부 해상도 px로 환산해 저장 (CSS 축소 보정)
    const sf = dCanvas.width / (dCanvas.getBoundingClientRect().width || dCanvas.width);
    const width = widthForPressure(pen, e.pressure) * sf;
    const seg: PageInkSeg = { from, to, width };
    currentStrokeRef.current.segs.push(seg);

    // 성능을 위해 전체 재렌더 대신 델타 한 조각만 그린다.
    const ctx = dCanvas.getContext('2d');
    if (ctx && dimensions.width) paintSeg(ctx, currentStrokeRef.current, seg);
    lastRatioRef.current = to;
  };

  const stopDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
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
      const next = [...strokesRef.current, stroke];
      strokesRef.current = next; setStrokes(next); onStrokesChange?.(pageNumber, next);
      return;
    }
    // 스트로크를 지역변수로 먼저 캡처. (업데이터 안에서 ref를 읽으면 아래 null 대입 후
    //  실행돼 null이 저장되는 버그가 있어 redrawStrokes가 복원하지 못했음)
    const finishedStroke = currentStrokeRef.current;
    if (isDrawingRef.current && finishedStroke && finishedStroke.segs.length > 0) {
        const next = [...strokesRef.current, finishedStroke];
        strokesRef.current = next;
        setStrokes(next);
        onStrokesChange?.(pageNumber, next); // 저장 트리거 (부모가 디바운스 저장)
    }
    currentStrokeRef.current = null;
    lastRatioRef.current = null;
    isDrawingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  return (
    <div
      ref={containerRef}
      className="pdf-page relative mb-6 shadow-sm border border-slate-200 bg-white mx-auto w-full"
      style={{ maxWidth: 820, aspectRatio: dimensions.width ? `${dimensions.width} / ${dimensions.height}` : '612 / 792' }}
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
        onPointerLeave={stopDraw}
        className="absolute inset-0 w-full h-full z-20 touch-none"
        style={{ cursor: cursorForPen(pen) }}
      />
      
      {hasText === false && searchText && (
        <div className="absolute top-2 left-2 right-2 bg-slate-800/80 text-white text-xs px-3 py-2 rounded-lg text-center backdrop-blur-sm z-30">
          이 PDF는 텍스트 검색을 지원하지 않습니다(이미지 기반).
        </div>
      )}
    </div>
  );
};

export const PdfAdvancedRenderer = ({
  fileUrl,
  pen,
  activeType,
  setActiveType,
  updateActivePen,
  fileName,
  initialPageStrokes,
  onStrokesChange,
  straightLine = false,
  shapeMode = false,
}: {
  fileUrl: string | null;
  pen: PenModel;
  activeType: PenType;
  setActiveType: (t: PenType) => void;
  updateActivePen: (patch: Partial<PenModel>) => void;
  fileName: string;
  initialPageStrokes?: PdfPageStrokes; // 저장된 페이지별 필기 복원용
  onStrokesChange?: (pages: PdfPageStrokes) => void; // 전체 페이지 필기 변경 알림(저장용)
  straightLine?: boolean; // #4 자(직선)
  shapeMode?: boolean;    // #4 도형 보정
}) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  // 고정 렌더 해상도. 표시 크기는 CSS(w-full + aspect-ratio)가 컨테이너 너비에 맞춰 축소한다.
  const [scale] = useState(2);
  
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
      </div>

      {/* 공용 펜 툴바 (빈 노트·슬라이드와 동일한 5종·필압·색/굵기 팝오버) */}
      <div className="absolute top-[4.5rem] left-4 z-40 bg-white rounded-xl border border-slate-200 shadow-lg px-3 py-2">
         <PenToolbar
           activeType={activeType}
           activePen={pen}
           setActiveType={setActiveType}
           updateActivePen={updateActivePen}
         />
      </div>

      {/* Scrollable Document Area */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center bg-slate-100 custom-scrollbar" ref={containerRef}>
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
             />
         ))}
      </div>
    </div>
  );
};
