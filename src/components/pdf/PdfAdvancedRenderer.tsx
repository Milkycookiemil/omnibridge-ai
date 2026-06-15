import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PenToolbar } from '../ink/PenToolbar';
import {
  renderInkSegment, widthForPressure,
  type InkSegment, type PenModel, type PenType,
} from '../../lib/inkEngine';

// Initialize worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// 페이지별 비율좌표(0~1) 저장 구조. 줌/스크롤로 캔버스 픽셀 크기가 바뀌어도
// 비율로 보관했다가 렌더 시 픽셀로 환산하므로 위치가 보존된다.
// 굵기는 필압이 반영된 최종 CSS px 값을 세그먼트마다 저장해 재현한다.
interface InkPoint { x: number; y: number; } // ratio 0~1
interface PageInkSeg { from: InkPoint; to: InkPoint; width: number; } // width: CSS px
interface PageStroke {
  penType: PenType;
  color: string;
  opacity: number;
  segs: PageInkSeg[];
}

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
}

const PdfPage: React.FC<PdfPageProps> = ({
  pageNumber, pdfDocument, pen, scale, searchText,
  highlightedIndexes, currentMatchIndex, onPageMatchCalculated, onVisible
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

  const [strokes, setStrokes] = useState<PageStroke[]>([]);
  const currentStrokeRef = useRef<PageStroke | null>(null);
  const lastRatioRef = useRef<InkPoint | null>(null);

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
      ctx.clearRect(0, 0, dCanvas.width, dCanvas.height);
      strokes.forEach(stroke => {
         if (!stroke || !stroke.segs || stroke.segs.length === 0) return;
         stroke.segs.forEach(seg => paintSeg(ctx, stroke, seg));
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

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    isDrawingRef.current = true;
    lastRatioRef.current = getCoordinatesRatio(e);
    currentStrokeRef.current = {
      penType: pen.type,
      color: pen.color,
      opacity: pen.opacity,
      segs: [],
    };
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
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
    // 스트로크를 지역변수로 먼저 캡처. (업데이터 안에서 ref를 읽으면 아래 null 대입 후
    //  실행돼 null이 저장되는 버그가 있어 redrawStrokes가 복원하지 못했음)
    const finishedStroke = currentStrokeRef.current;
    if (isDrawingRef.current && finishedStroke && finishedStroke.segs.length > 0) {
        setStrokes(prev => [...prev, finishedStroke]);
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
        className="absolute inset-0 w-full h-full z-20 cursor-crosshair touch-none"
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
  fileName
}: {
  fileUrl: string | null;
  pen: PenModel;
  activeType: PenType;
  setActiveType: (t: PenType) => void;
  updateActivePen: (patch: Partial<PenModel>) => void;
  fileName: string;
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
             />
         ))}
      </div>
    </div>
  );
};
