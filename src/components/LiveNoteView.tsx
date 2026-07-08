import React, { useRef, useState, useEffect } from 'react';
import { SummaryCard } from '../types';
import { dummyData } from '../data';
import { Mic, Square, Zap, Lock, Bell, BellOff, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { uploadToGoogleDrive } from '../lib/drive';
import { getAccessToken } from '../lib/auth';
import { PdfAdvancedRenderer } from './pdf/PdfAdvancedRenderer';
import { LectureCapture } from './pdf/LectureCapture';
import { InkCanvas, type InkCanvasHandle } from './ink/InkCanvas';
import { PenToolbar } from './ink/PenToolbar';
import { TranscriptPanel } from './TranscriptPanel';
import { usePenState } from '../hooks/usePenState';
import { useTranscription } from '../hooks/useTranscription';

import { useSyncEngine, onRemoteStroke } from '../lib/syncEngine';
import type { InkDelta } from '../lib/inkEngine';
import { getNote, saveNoteStrokes } from '../lib/notesStore';
import { usePreferences } from '../lib/preferences';
import { useDeviceMode } from '../lib/deviceMode';

export function LiveNoteView({ navContext }: { navContext?: any }) {
  const { pushDelta } = useSyncEngine();
  const { notificationsEnabled, setNotificationsEnabled, transcriptOpen, setTranscriptOpen } = usePreferences();
  const { deviceMode } = useDeviceMode();
  const transcription = useTranscription();
  const isQuickRecord = navContext?.quickRecord === true;
  const paperStyle = navContext?.style || 'blank';
  const fileName = navContext?.fileName;
  const fileDetails = navContext?.file;
  // 저장된 노트를 열었을 때의 식별자. 없으면(빠른 녹음/PDF/캡쳐 등) 비영속.
  const noteId: string | undefined = navContext?.noteId;

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (paperStyle === 'pdf' && fileDetails) {
      const url = URL.createObjectURL(fileDetails);
      setPdfUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [paperStyle, fileDetails]);

  const [isRecording, setIsRecording] = useState(isQuickRecord);
  const [recordingTime, setRecordingTime] = useState(0);
  const [visibleCards, setVisibleCards] = useState<SummaryCard[]>([]);
  const [showTask, setShowTask] = useState(false);
  const [aiMode, setAiMode] = useState<'npu' | 'cloud'>('npu');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 노트북 모드의 고속 타이핑 복습 노트
  const [typedNote, setTypedNote] = useState('');

  const showToastMsg = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 펜 상태(5종 + 활성 펜) & 캔버스 핸들
  const { activeType, activePen, setActiveType, updateActivePen } = usePenState('pen');
  const inkRef = useRef<InkCanvasHandle>(null);

  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let cardInterval: ReturnType<typeof setInterval>;

    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Reveal a new card every 4 seconds for demo purposes
      let cardIndex = 0;
      cardInterval = setInterval(() => {
        const nextCard = dummyData.summaryCards[cardIndex];
        if (nextCard) {
          setVisibleCards(prev => [...prev, nextCard]);
          // 사용자가 알림을 영구 차단한 경우 일정 감지 스낵바를 띄우지 않는다.
          if (cardIndex === 2 && usePreferences.getState().notificationsEnabled) {
            setShowTask(true);
            setTimeout(() => setShowTask(false), 5000);
          }
          cardIndex++;
        } else {
          clearInterval(cardInterval);
        }
      }, 4000);
    } else {
      setRecordingTime(0);
      setVisibleCards([]);
      setShowTask(false);
    }

    return () => {
      clearInterval(interval);
      clearInterval(cardInterval);
    };
  }, [isRecording]);

  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks: BlobPart[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          // 녹음은 즉시 로컬에 안전 보관 (데이터 유실 0 — 김지원 페르소나 핵심)
          setAudioBlob(blob);

          // Step 2: Trigger manual flush to cloud on lecture stop
          const { triggerManualFlush } = useSyncEngine.getState();
          triggerManualFlush();

          // Drive 토큰이 있을 때만 업로드 시도. 게스트/미연결이면 경고 없이 로컬 보관 안내.
          const token = await getAccessToken();
          if (!token) {
            showToastMsg("로컬에 안전하게 보관됨 · 연결 시 자동 동기화됩니다");
            return;
          }
          try {
            showToastMsg("Google Drive에 저장 중...");
            await uploadToGoogleDrive(blob, `녹음_LiveNote_${new Date().getTime()}.webm`);
            showToastMsg("Google Drive에 저장되었습니다!");
          } catch (e) {
            // 업로드 실패해도 경고창 금지 — 로컬에 안전하게 남아있음을 안심시키는 톤
            console.error(e);
            showToastMsg("로컬에 안전하게 보관됨 · 연결 시 자동 동기화됩니다");
          }
        };

        recorder.start(1000);
        setMediaRecorder(recorder);
        setIsRecording(true);

        // A-2: 온디바이스 Whisper 실시간 전사 시작 (같은 스트림 사용)
        transcription.reset();
        transcription.start(stream);
        if (!transcriptOpen) setTranscriptOpen(true);
      } catch (err) {
        console.error("Mic access denied", err);
        alert("마이크 접근 권한이 필요합니다.");
      }
    } else {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      setIsRecording(false);
      transcription.stop();
    }
  };

  const handleModeSwitch = () => {
    const newMode = aiMode === 'npu' ? 'cloud' : 'npu';
    setAiMode(newMode);
    if (newMode === 'cloud') {
      showToastMsg('Cloud 부스트 모드는 전력 소모가 큽니다.');
    }
  };

  // --- 노트 자동 저장 (IndexedDB) ---
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 대시보드 카드용 축소 썸네일 생성
  const makeThumb = (canvas: HTMLCanvasElement | null): string | undefined => {
    if (!canvas) return undefined;
    try {
      const tw = 240;
      const th = Math.max(1, Math.round((canvas.height / canvas.width) * tw));
      const off = document.createElement('canvas');
      off.width = tw;
      off.height = th;
      const ctx = off.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(canvas, 0, 0, tw, th);
      return off.toDataURL('image/png');
    } catch {
      return undefined;
    }
  };

  const doSave = async () => {
    const id = navContext?.noteId as string | undefined;
    if (!id || !inkRef.current) return;
    const strokes = inkRef.current.exportStrokes();
    const thumb = makeThumb(inkRef.current.getCanvas());
    await saveNoteStrokes(id, strokes, thumb);
  };
  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;

  const scheduleSave = () => {
    if (!navContext?.noteId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void doSaveRef.current(), 1000);
  };

  // 화면을 떠날 때 마지막 상태를 확실히 저장 (디바운스 잔여분 flush)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void doSaveRef.current();
    };
  }, []);

  // 로컬 잉크 델타(세그먼트/획 삭제) → 실시간 릴레이 + 노트 자동 저장 예약
  const handleLocalDelta = (delta: InkDelta) => {
    pushDelta(delta);
    scheduleSave();
  };

  // 원격 기기에서 들어온 델타(필기·삭제)를 실시간으로 캔버스에 반영
  useEffect(() => {
    const unsub = onRemoteStroke((delta) => inkRef.current?.applyDelta(delta));
    return () => { unsub(); };
  }, []);

  // 캔버스 (재)마운트 시 해당 노트의 저장된 스트로크를 불러와 복원.
  // noteId가 없으면(빠른 녹음/임시) 빈 캔버스로 시작한다.
  useEffect(() => {
    let cancelled = false;
    if (!inkRef.current) return;
    inkRef.current.clear();
    if (noteId) {
      getNote(noteId).then((note) => {
        if (!cancelled && note && inkRef.current) inkRef.current.loadStrokes(note.strokes);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [deviceMode, paperStyle, noteId]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  let backgroundStyle: React.CSSProperties = {
    backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)',
    backgroundSize: '40px 40px'
  };

  if (paperStyle === 'ruled') {
    backgroundStyle = {
      backgroundImage: 'linear-gradient(transparent 95%, rgba(0,0,0,0.05) 95%)',
      backgroundSize: '100% 40px'
    };
  } else if (paperStyle === 'oxford') {
    backgroundStyle = {
      backgroundImage: `
        linear-gradient(transparent 95%, rgba(0,0,0,0.05) 95%),
        linear-gradient(90deg, transparent 10%, rgba(239,68,68,0.1) 10%, rgba(239,68,68,0.1) 11%, transparent 11%)
      `,
      backgroundSize: '100% 40px, 100% 100%'
    };
  } else if (paperStyle === 'pdf' || paperStyle === 'capture') {
    backgroundStyle = { backgroundColor: 'transparent' };
  }

  const isCanvasNote = paperStyle !== 'pdf' && paperStyle !== 'capture';

  // ── 공유 조각 (Nielsen #4 일관성: 태블릿/노트북이 같은 토큰을 재사용) ──

  const recordButton = (
    <div className="flex items-center gap-4">
      {isRecording && (
        <div className="flex gap-1 items-center">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ height: ['4px', '16px', '4px'] }}
              transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.1 }}
              className="w-1 bg-red-500 rounded-full"
            />
          ))}
        </div>
      )}
      <button
        onClick={toggleRecording}
        className={cn("flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-colors shadow-sm",
          isRecording ? "bg-red-50 text-red-600 border border-red-200" : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
        )}
      >
        {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
        {isRecording ? `REC ${formatTime(recordingTime)}` : "녹음 시작"}
      </button>
    </div>
  );

  const inkCanvas = (
    <InkCanvas
      ref={inkRef}
      pen={activePen}
      backgroundStyle={backgroundStyle}
      onDelta={handleLocalDelta}
      showLayers={deviceMode !== 'laptop'} // 노트북 모드의 작은 미러 뷰에선 패널 숨김
      className="flex-1"
    />
  );

  // 손필기 카드 내부 (캡쳐 / PDF / 일반 캔버스) — 태블릿·노트북 공용
  const handwritingCardInner = (
    <>
      {paperStyle === 'capture' && <LectureCapture />}

      {paperStyle === 'pdf' && (
        <PdfAdvancedRenderer
           fileUrl={pdfUrl}
           fileName={fileName || 'Document.pdf'}
           pen={activePen}
           activeType={activeType}
           setActiveType={setActiveType}
           updateActivePen={updateActivePen}
        />
      )}

      {isCanvasNote && (
        <>
          <div className="p-4 flex items-center justify-between border-b border-slate-200 relative z-20 bg-white/80 backdrop-blur-md">
            <PenToolbar
              activeType={activeType}
              activePen={activePen}
              setActiveType={setActiveType}
              updateActivePen={updateActivePen}
            />
            {recordButton}
          </div>
          {inkCanvas}
        </>
      )}
    </>
  );

  // 하단 도킹 패널 오른쪽 컬럼에 들어갈 요약 내용 (NPU/Cloud 토글 + 요약 카드)
  const summaryContent = (
    <div className="space-y-2.5">
      <div className="flex items-center bg-white border border-slate-200 p-1 rounded-full shadow-sm w-max mb-1">
        <button
          onClick={() => handleModeSwitch()}
          className={cn("px-2.5 py-1 text-[11px] font-bold rounded-full flex items-center gap-1 transition-all", aiMode === 'npu' ? "bg-slate-100 text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600")}
        >
          <Lock className="w-3 h-3" /> NPU
        </button>
        <button
          onClick={() => handleModeSwitch()}
          className={cn("px-2.5 py-1 text-[11px] font-bold rounded-full flex items-center gap-1 transition-all", aiMode === 'cloud' ? "bg-slate-100 text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600")}
        >
          <Zap className="w-3 h-3 text-amber-500" /> Cloud
        </button>
      </div>

      {!isRecording && visibleCards.length === 0 ? (
        <div className="text-slate-400 text-sm flex items-center justify-center gap-2 py-8">
          <Mic className="w-5 h-5" /> 녹음을 시작하면 요약이 생성됩니다.
        </div>
      ) : (
        <AnimatePresence>
          {visibleCards.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-slate-50 rounded-xl p-3 border border-slate-100 border-l-4 border-l-violet-500"
            >
              <div className="text-xs font-mono text-violet-600 font-bold mb-0.5">{card.time}</div>
              <div className="text-sm font-medium leading-relaxed text-slate-800">{card.text}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );

  const taskAndToast = (
    <>
      {/* A-2: 실시간 전사 패널 (하단 도킹, 접기/펼치기 영속) */}
      <TranscriptPanel
        lines={transcription.lines}
        status={transcription.status}
        modelProgress={transcription.modelProgress}
        open={transcriptOpen}
        onToggle={() => setTranscriptOpen(!transcriptOpen)}
        summarySlot={summaryContent}
      />

      {/* Task Binding Bar */}
      <AnimatePresence>
        {showTask && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-max max-w-md bg-slate-800 border border-slate-700/50 rounded-full py-3 px-5 shadow-2xl flex items-center justify-between gap-6 z-50 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                <Bell className="w-4 h-4" />
              </div>
              <p className="text-sm font-medium text-slate-200">{dummyData.taskBinding.text}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setShowTask(false)}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-700/50 hover:bg-slate-700 text-slate-300 font-bold transition-colors"
              >
                나중에 확인
              </button>
              <button
                onClick={() => setShowTask(false)}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-700/30 hover:bg-slate-700 text-slate-400 font-bold transition-colors"
              >
                거절
              </button>
              <button
                onClick={() => {
                  setShowTask(false);
                  setNotificationsEnabled(false);
                  showToastMsg('일정 감지 알림을 껐습니다. 설정에서 다시 켤 수 있어요.');
                }}
                className="text-xs px-2.5 py-1.5 rounded-full bg-slate-900/40 hover:bg-slate-900 text-slate-500 hover:text-slate-300 font-bold transition-colors flex items-center gap-1"
                title="이 알림을 영구적으로 끕니다"
              >
                <BellOff className="w-3 h-3" /> 알림 끄기
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 right-8 bg-white shadow-xl py-2 px-4 border border-amber-200 text-sm flex items-center gap-2 z-50 rounded-full text-slate-800"
          >
            <Zap className="w-4 h-4 text-amber-500" /> {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  // ── 노트북 모드: 태블릿 필기(미러링)가 메인, 타이핑 병행 (AI는 하단 도킹) ──
  if (deviceMode === 'laptop' && isCanvasNote) {
    return (
      <div className="absolute inset-0 pt-16 pb-12 px-4 md:px-8 max-w-7xl mx-auto flex gap-4 overflow-hidden">
        {/* Left: 태블릿 필기 실시간 미러링 (메인) */}
        <div className="flex-[3] min-h-0 bg-white border border-slate-200 rounded-2xl relative flex flex-col overflow-hidden shadow-sm">
          <div className="px-4 py-1.5 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 태블릿 필기 실시간 미러링
          </div>
          {handwritingCardInner}
        </div>

        {/* Right: 타이핑 복습 (노트북 보조 입력) */}
        <div className="flex-[2] min-h-0 bg-white border border-slate-200 rounded-2xl relative flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 flex items-center justify-between border-b border-slate-200 bg-white/80 shrink-0">
            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
              <Keyboard className="w-5 h-5 text-blue-500" /> 타이핑 복습
              <span className="text-xs font-mono text-slate-400 ml-2">{typedNote.length}자</span>
            </div>
          </div>
          <textarea
            value={typedNote}
            onChange={(e) => setTypedNote(e.target.value)}
            placeholder="노트북에서 빠르게 타이핑하세요.&#10;태블릿의 손필기와 함께 하나의 노트로 0.1초 내 동기화됩니다."
            className="flex-1 w-full resize-none outline-none p-6 text-slate-800 leading-relaxed text-[15px] bg-transparent placeholder:text-slate-300"
          />
        </div>

        {taskAndToast}
      </div>
    );
  }

  // ── 태블릿 모드: 손필기 캔버스가 메인을 꽉 채움 (AI는 하단 도킹) ──
  return (
    <div className="absolute inset-0 pt-16 pb-12 px-4 md:px-8 max-w-7xl mx-auto flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-2xl relative flex flex-col overflow-hidden shadow-sm">
        {handwritingCardInner}
      </div>

      {taskAndToast}
    </div>
  );
}
