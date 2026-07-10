import React, { useRef, useState, useEffect } from 'react';
import { Camera, StopCircle, Video, ListVideo, Trash2, Pencil } from 'lucide-react';
import { SlideAnnotator } from '../ink/SlideAnnotator';
import {
  uploadCaptureSlides, downloadCaptureSlides, isFileStoreReady, QuotaError,
  type CaptureSlide,
} from '../../lib/pdfStore';
import { saveNoteThumbnail } from '../../lib/notesStore';

// 첫 슬라이드 이미지(data URL)를 240px JPEG 썸네일로 축소.
const makeCaptureThumb = (dataUrl: string): Promise<string | undefined> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const tw = 240;
        const th = Math.max(1, Math.round((img.height / img.width) * tw));
        const c = document.createElement('canvas');
        c.width = tw;
        c.height = th;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(undefined);
        ctx.drawImage(img, 0, 0, tw, th);
        resolve(c.toDataURL('image/jpeg', 0.7));
      } catch {
        resolve(undefined);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });

type CapturedSlide = CaptureSlide; // { id, imgData, timestamp }

export const LectureCapture = ({ noteId }: { noteId?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [slides, setSlides] = useState<CapturedSlide[]>([]);
  const [sensitivity, setSensitivity] = useState(35);

  // 영속화: 저장된 캡쳐 복원 + 변경 시 Storage에 디바운스 저장
  const slidesRef = useRef<CapturedSlide[]>([]);
  slidesRef.current = slides;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    downloadCaptureSlides(noteId).then((loaded) => {
      if (!cancelled && loaded && loaded.length) setSlides(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const scheduleSave = (next: CapturedSlide[]) => {
    if (!noteId || !isFileStoreReady()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await uploadCaptureSlides(noteId, next);
        setSaveMsg(null);
        // 첫 슬라이드를 대시보드 카드 썸네일로
        if (next.length > 0) {
          const thumb = await makeCaptureThumb(next[0].imgData);
          if (thumb) await saveNoteThumbnail(noteId, thumb);
        }
      } catch (e) {
        if (e instanceof QuotaError) setSaveMsg(e.message);
        else console.warn('캡쳐 저장 실패:', e);
      }
    }, 1200);
  };

  // 화면 이탈 시 마지막 상태 flush
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (noteId && isFileStoreReady() && slidesRef.current.length)
        void uploadCaptureSlides(noteId, slidesRef.current).catch(() => {});
    };
  }, [noteId]);

  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const prevFullImgRef = useRef<string | null>(null);
  const lastCaptureTimeRef = useRef<number>(0);

  const startScreenCapture = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false
      });
      setStream(displayStream);
      if (videoRef.current) {
        videoRef.current.srcObject = displayStream;
      }
      setIsCapturing(true);

      displayStream.getVideoTracks()[0].onended = () => {
        stopCapture();
      };
    } catch (err) {
      console.error("Screen capture failed", err);
    }
  };

  const stopCapture = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
    setIsCapturing(false);
    prevPixelsRef.current = null;
    prevFullImgRef.current = null;
  };

  const manualCapture = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    addSlide(imgData);
  };

  const addSlide = (imgData: string) => {
    const next = [...slidesRef.current, {
      id: Math.random().toString(36).substr(2, 9),
      imgData,
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false })
    }];
    setSlides(next);
    scheduleSave(next);
  };

  const removeSlide = (id: string) => {
    const next = slidesRef.current.filter(s => s.id !== id);
    setSlides(next);
    scheduleSave(next);
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingSlide = slides.find(s => s.id === editingId) || null;

  // 합성(배경+잉크) 이미지로 해당 슬라이드를 갱신
  const saveAnnotated = (merged: string) => {
    if (!editingId) return;
    const next = slidesRef.current.map(s => s.id === editingId ? { ...s, imgData: merged } : s);
    setSlides(next);
    scheduleSave(next);
    setEditingId(null);
  };

  // Auto-capture magic loop
  useEffect(() => {
    if (!isCapturing || !videoRef.current || !hiddenCanvasRef.current) return;

    const canvas = hiddenCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let rafId: number;
    let lastTick = performance.now();

    const loop = (time: number) => {
      rafId = requestAnimationFrame(loop);
      
      if (time - lastTick < 700) return; // run roughly every 700ms
      lastTick = time;

      const video = videoRef.current;
      if (!video || video.readyState !== 4) return;

      // Draw small 64x36 for diffing
      ctx.drawImage(video, 0, 0, 64, 36);
      const imageData = ctx.getImageData(0, 0, 64, 36);
      const data = imageData.data;

      // Convert to grayscale simple array
      const currentPixels = new Uint8ClampedArray(64 * 36);
      for (let i = 0; i < data.length; i += 4) {
        currentPixels[i / 4] = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      }

      // Capture full res for potential save
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = video.videoWidth;
      fullCanvas.height = video.videoHeight;
      const fullCtx = fullCanvas.getContext('2d');
      if (fullCtx) {
         fullCtx.drawImage(video, 0, 0);
      }
      const currentFullImg = fullCanvas.toDataURL('image/jpeg', 0.85);

      if (prevPixelsRef.current && prevFullImgRef.current) {
        let diffCount = 0;
        for (let i = 0; i < currentPixels.length; i++) {
          if (Math.abs(currentPixels[i] - prevPixelsRef.current[i]) > 20) {
            diffCount++;
          }
        }
        const diffRatio = (diffCount / currentPixels.length) * 100;

        if (diffRatio > sensitivity && (time - lastCaptureTimeRef.current > 2000)) {
           // Significant change found -> slide changed!
           // Save the *previous* frame because it had the most annotations before the wipe
           addSlide(prevFullImgRef.current);
           lastCaptureTimeRef.current = time;
        }
      }

      prevPixelsRef.current = currentPixels;
      prevFullImgRef.current = currentFullImg;
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isCapturing, sensitivity]);

  return (
    <div className="absolute inset-0 pt-16 flex rounded-2xl overflow-hidden bg-slate-50 border border-slate-200 z-0">
      <div className="flex-1 flex flex-col p-4 border-r border-slate-200 h-full overflow-hidden">
         <div className="flex justify-between items-center mb-4 shrink-0">
            <div>
               <h2 className="font-bold text-slate-800 flex items-center gap-2"><Video className="w-5 h-5 text-indigo-500"/> 강의 화면 미리보기</h2>
               <p className="text-xs text-slate-500 mt-1">픽셀 변화를 감지해 필기가 꽉 찬 슬라이드를 자동 캡쳐합니다.</p>
            </div>
            
            <div className="flex items-center gap-3 bg-white p-2 border border-slate-200 rounded-xl shadow-sm">
                <div className="flex flex-col items-center">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">감지 민감도</label>
                   <input type="range" min="10" max="60" value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} className="w-24 accent-indigo-500" />
                </div>
                <div className="w-px h-8 bg-slate-200 mx-1" />
                <button 
                  disabled={!isCapturing}
                  onClick={manualCapture}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg transition-colors"
                >강제 캡쳐</button>
                {isCapturing ? (
                  <button onClick={stopCapture} className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors">
                     <StopCircle className="w-4 h-4"/> 캡쳐 중지
                  </button>
                ) : (
                  <button onClick={startScreenCapture} className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors">
                     <Camera className="w-4 h-4"/> 화면 선택
                  </button>
                )}
            </div>
         </div>
         
         <div className="flex-1 bg-black/5 rounded-xl border border-slate-200 overflow-hidden relative shadow-inner">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
            {!isCapturing && (
               <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-medium">
                  우측 상단 '화면 선택'을 눌러 강의 창을 고르세요
               </div>
            )}
            <canvas ref={hiddenCanvasRef} width={64} height={36} className="hidden" />
         </div>
      </div>
      
      <div className="w-72 bg-white flex flex-col h-full overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 text-slate-700 font-bold">
             <ListVideo className="w-5 h-5 text-emerald-500" />
             캡쳐된 슬라이드 <span className="ml-auto bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs">{slides.length}</span>
          </div>

          {saveMsg && (
            <div className="mx-4 mt-3 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {saveMsg}
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
             {slides.length === 0 ? (
                <div className="text-center text-slate-400 text-sm mt-10">자동 또는 수동으로<br/>캡쳐된 이미지가 여기에 쌓입니다.</div>
             ) : (
                 slides.map((s) => (
                    <div key={s.id} className="group relative border border-slate-200 rounded-lg overflow-hidden shadow-sm bg-slate-50">
                       <button onClick={() => setEditingId(s.id)} className="block w-full relative" title="클릭해서 필기하기">
                          <img src={s.imgData} alt="slide" className="w-full h-28 object-cover" />
                          {/* 호버 시 필기 안내 오버레이 */}
                          <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                             <span className="flex items-center gap-1.5 text-white text-xs font-bold bg-black/50 px-3 py-1.5 rounded-full">
                                <Pencil className="w-3.5 h-3.5" /> 필기하기
                             </span>
                          </div>
                       </button>
                       <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6 flex justify-between items-end pointer-events-none">
                          <span className="text-white text-xs font-mono font-medium drop-shadow-md">{s.timestamp}</span>
                          <button onClick={() => removeSlide(s.id)} className="text-white/80 hover:text-red-400 transition-colors pointer-events-auto">
                             <Trash2 className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                 ))
             )}
          </div>
      </div>

      {editingSlide && (
        <SlideAnnotator
          image={editingSlide.imgData}
          onSave={saveAnnotated}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
};
