import React, { useRef, useState, useEffect } from 'react';
import { SummaryCard } from '../types';
import { dummyData } from '../data';
import { Mic, Square, Zap, Lock, Bell, BellOff, Keyboard, Lasso, Ruler, Shapes, Undo2, Redo2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { uploadToGoogleDrive } from '../lib/drive';
import { getAccessToken } from '../lib/auth';
import { PdfAdvancedRenderer, type PdfRendererHandle } from './pdf/PdfAdvancedRenderer';
import { LectureCapture } from './pdf/LectureCapture';
import { InkCanvas, type InkCanvasHandle } from './ink/InkCanvas';
import { PenToolbar } from './ink/PenToolbar';
import { QuickColorPalette } from './ink/QuickColorPalette';
import { TranscriptPanel } from './TranscriptPanel';
import { usePenState } from '../hooks/usePenState';
import { useTranscription } from '../hooks/useTranscription';

import { useSyncEngine, onRemoteStroke } from '../lib/syncEngine';
import type { InkDelta } from '../lib/inkEngine';
import { getNote, saveNoteStrokes, saveNotePdfPages, saveNoteTypedText, saveNoteTranscript } from '../lib/notesStore';
import { downloadPdf, takePdfFile } from '../lib/pdfStore';
import { buildRecordingStream, NO_SYSTEM_AUDIO } from '../lib/audioCapture';
import { RecordSourcePopover } from './RecordSourcePopover';
import type { PdfPageStrokes } from '../lib/pdfInk';
import { usePreferences } from '../lib/preferences';
import { useDeviceMode } from '../lib/deviceMode';
import { summarizeTranscript, isAiSummaryConfigured } from '../lib/aiSummary';

export function LiveNoteView({ navContext }: { navContext?: any }) {
  const { pushDelta } = useSyncEngine();
  const { notificationsEnabled, setNotificationsEnabled, transcriptOpen, setTranscriptOpen, audioSource, micDeviceId } = usePreferences();
  const { deviceMode } = useDeviceMode();
  const transcription = useTranscription();
  const isQuickRecord = navContext?.quickRecord === true;
  const paperStyle = navContext?.style || 'blank';
  const fileName = navContext?.fileName;
  const fileDetails = navContext?.file;
  // 저장된 노트를 열었을 때의 식별자. 없으면(빠른 녹음/PDF/캡쳐 등) 비영속.
  const noteId: string | undefined = navContext?.noteId;

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  // PDF 노트: 저장된 페이지별 필기(복원용) + 최신값 ref(언마운트 flush용) + 디바운스 타이머
  const [pdfInitialPages, setPdfInitialPages] = useState<PdfPageStrokes | undefined>(undefined);
  const pdfPagesRef = useRef<PdfPageStrokes | null>(null);
  const pdfSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PDF 소스 준비: (1) 방금 고른 파일이 있으면 그걸, (2) 저장된 노트면 Storage에서 다운로드.
  // 저장된 페이지별 필기도 함께 불러와 복원한다.
  useEffect(() => {
    if (paperStyle !== 'pdf') return;
    let revoked = false;
    let objUrl: string | null = null;
    const setup = async () => {
      if (fileDetails) {
        // 새로 만든 PDF 노트: 방금 고른 파일 사용 (업로드는 NewNoteModal이 이미 수행)
        objUrl = URL.createObjectURL(fileDetails);
        if (!revoked) setPdfUrl(objUrl);
      }
      if (noteId) {
        const note = await getNote(noteId);
        if (!revoked && note?.pdfPages) setPdfInitialPages(note.pdfPages);
        // navContext.file이 없을 때(WorkspaceView 라우팅으로 떨어졌거나 대시보드 재열기):
        // ① 방금 고른 파일이 메모리 캐시에 있으면 그걸 즉시 사용(게스트 포함) →
        // ② 없으면 Storage에서 원본 다운로드(로그인 사용자의 재방문)
        if (!fileDetails) {
          const stashed = takePdfFile(noteId);
          if (stashed) {
            objUrl = URL.createObjectURL(stashed);
            if (!revoked) setPdfUrl(objUrl);
          } else {
            const blob = await downloadPdf(noteId);
            if (blob && !revoked) {
              objUrl = URL.createObjectURL(blob);
              setPdfUrl(objUrl);
            }
          }
        }
      }
    };
    void setup();
    return () => {
      revoked = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [paperStyle, fileDetails, noteId]);

  // PDF 첫 페이지(배경 + 필기)를 합성해 대시보드 카드용 썸네일 생성.
  const makePdfThumb = (): string | undefined => {
    const page = document.querySelector('.pdf-page');
    if (!page) return undefined;
    const canvases = page.querySelectorAll('canvas');
    const bg = canvases[0] as HTMLCanvasElement | undefined; // 배경(렌더된 PDF 페이지)
    const ink = canvases[canvases.length - 1] as HTMLCanvasElement | undefined; // 필기 레이어
    if (!bg || !bg.width) return undefined;
    try {
      const tw = 240;
      const th = Math.max(1, Math.round((bg.height / bg.width) * tw));
      const off = document.createElement('canvas');
      off.width = tw;
      off.height = th;
      const ctx = off.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(bg, 0, 0, tw, th);
      if (ink && ink.width) ctx.drawImage(ink, 0, 0, tw, th);
      return off.toDataURL('image/jpeg', 0.7);
    } catch {
      return undefined;
    }
  };

  // PDF 필기 변경 → 디바운스 저장(+썸네일) + 최신값 보관(언마운트 시 flush)
  const handlePdfStrokesChange = (pages: PdfPageStrokes) => {
    pdfPagesRef.current = pages;
    if (!noteId) return;
    if (pdfSaveTimer.current) clearTimeout(pdfSaveTimer.current);
    pdfSaveTimer.current = setTimeout(() => void saveNotePdfPages(noteId, pages, makePdfThumb()), 1000);
  };

  // 화면을 떠날 때 PDF 필기 마지막 상태 flush
  useEffect(() => {
    return () => {
      if (pdfSaveTimer.current) clearTimeout(pdfSaveTimer.current);
      if (noteId && pdfPagesRef.current) void saveNotePdfPages(noteId, pdfPagesRef.current);
    };
  }, [noteId]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [visibleCards, setVisibleCards] = useState<SummaryCard[]>([]);
  const [showTask, setShowTask] = useState(false);
  const [aiMode, setAiMode] = useState<'npu' | 'cloud'>('npu');
  const [selectMode, setSelectMode] = useState(false); // 올가미 선택 모드
  const [straightLine, setStraightLine] = useState(false); // #4 자(직선)
  const [shapeMode, setShapeMode] = useState(false); // #4 도형 보정
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // 필기 도구는 상호 배타(하나 켜면 나머지 끔). 펜 그리기로 돌아가려면 전부 off.
  const pickTool = (tool: 'pen' | 'select' | 'straight' | 'shape') => {
    setSelectMode(tool === 'select');
    setStraightLine(tool === 'straight');
    setShapeMode(tool === 'shape');
  };
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 노트북 모드의 고속 타이핑 복습 노트 (노트에 저장·클라우드 동기화)
  const [typedNote, setTypedNote] = useState('');
  const typedSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 저장된 타이핑 텍스트 + 전사 복원 (노트 열 때) — 전사 복원으로 재방문/다른 기기에서도 획↔전사 싱크 동작
  useEffect(() => {
    if (!noteId) {
      setTypedNote('');
      transcription.restore([]);
      return;
    }
    let cancelled = false;
    getNote(noteId).then((note) => {
      if (cancelled) return;
      setTypedNote(note?.typedText ?? '');
      const saved = note?.transcript ?? [];
      restoredTranscriptRef.current = saved; // 복원분은 재저장 안 함
      transcription.restore(saved);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // 전사 변경 → 디바운스 저장(복원한 그대로면 skip). 재방문/크로스디바이스 싱크의 핵심.
  const restoredTranscriptRef = useRef<any>(null);
  const transcriptSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!noteId || transcription.lines === restoredTranscriptRef.current) return;
    if (transcriptSaveTimer.current) clearTimeout(transcriptSaveTimer.current);
    const snapshot = transcription.lines;
    transcriptSaveTimer.current = setTimeout(() => void saveNoteTranscript(noteId, snapshot), 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcription.lines, noteId]);

  // 타이핑 변경 → 디바운스 저장(손필기와 한 노트로 동기화)
  const handleTypedChange = (text: string) => {
    setTypedNote(text);
    if (!noteId) return;
    if (typedSaveTimer.current) clearTimeout(typedSaveTimer.current);
    typedSaveTimer.current = setTimeout(() => void saveNoteTypedText(noteId, text), 800);
  };

  // 화면 이탈 시 타이핑 마지막 상태 flush
  useEffect(() => {
    return () => {
      if (typedSaveTimer.current) clearTimeout(typedSaveTimer.current);
    };
  }, []);


  const showToastMsg = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 펜 상태(5종 + 활성 펜) & 캔버스 핸들
  const { activeType, activePen, setActiveType, updateActivePen } = usePenState('pen');
  const inkRef = useRef<InkCanvasHandle>(null);
  const pdfRef = useRef<PdfRendererHandle>(null);

  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null); // 녹음 스트림 원본 정리 함수

  // 녹음 경과 시간 타이머 + 정지 시 요약 초기화
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
    } else {
      setRecordingTime(0);
      setVisibleCards([]);
      setShowTask(false);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // 최신 전사/시간을 interval 콜백에서 읽기 위한 ref
  const linesRef = useRef(transcription.lines);
  linesRef.current = transcription.lines;
  const recordingTimeRef = useRef(recordingTime);
  recordingTimeRef.current = recordingTime;
  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;
  // 전사 라인 클릭 → 그 시각 근처에 그린 획을 하이라이트("이 설명 = 이 필기")
  const handleTranscriptLineClick = (line: { sec: number }) => {
    const n = inkRef.current?.highlightByTime(line.sec, 6) ?? pdfRef.current?.highlightByTime(line.sec, 6) ?? 0;
    showToastMsg(n > 0 ? `이 시점에 그린 필기 ${n}획을 표시했어요` : '이 시점에 그린 필기가 없어요');
  };
  // 역방향: 획 탭 → 그릴 때의 전사 라인으로 점프·하이라이트
  const [transcriptHighlightIdx, setTranscriptHighlightIdx] = useState<number | null>(null);
  const handleStrokeTap = (t: number) => {
    const ls = linesRef.current;
    if (!ls.length) { showToastMsg('아직 전사된 내용이 없어요'); return; }
    let idx = -1, best = Infinity;
    ls.forEach((l, i) => { const d = Math.abs(l.sec - t); if (l.sec <= t + 1 && d < best) { best = d; idx = i; } });
    if (idx < 0) ls.forEach((l, i) => { const d = Math.abs(l.sec - t); if (d < best) { best = d; idx = i; } });
    if (idx < 0) return;
    setTranscriptOpen(true);
    setTranscriptHighlightIdx(idx);
    setTimeout(() => setTranscriptHighlightIdx(null), 2000);
    showToastMsg('이 필기를 그릴 때의 설명으로 이동했어요');
  };

  // 실시간 AI 요약 (BYOK). 녹음 중이고 키가 설정돼 있으면 전사 텍스트를 주기적으로 Claude로
  // 요약해 카드로 표시. 키가 없으면 안내 카드, 실패 시 오류 카드.
  useEffect(() => {
    if (!isRecording) return;
    if (!isAiSummaryConfigured()) {
      setVisibleCards([
        { time: '설정 필요', text: 'AI 요약을 켜려면 설정 → AI 엔진에서 Claude API 키를 입력하세요.', inkGroupId: '', timestamp: 0 },
      ]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      const text = linesRef.current.map((l) => l.text).join(' ').trim();
      if (text.length < 20) return; // 전사가 너무 짧으면 아직 요약하지 않음
      try {
        const points = await summarizeTranscript(text, { signal: controller.signal });
        if (cancelled || points.length === 0) return;
        const t = recordingTimeRef.current;
        const label = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
        setVisibleCards(points.map((p) => ({ time: label, text: p, inkGroupId: '', timestamp: t })));
      } catch (e) {
        if (cancelled || (e as any)?.name === 'AbortError') return;
        console.warn('AI 요약 실패:', e);
        setVisibleCards([{ time: '오류', text: (e as Error).message || 'AI 요약에 실패했어요.', inkGroupId: '', timestamp: 0 }]);
      }
    };

    const first = setTimeout(run, 6000); // 첫 요약은 6초 후
    const id = setInterval(run, 20000); // 이후 20초마다 갱신
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(first);
      clearInterval(id);
    };
  }, [isRecording]);

  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        // 소스 선택(마이크/시스템/둘 다)에 따라 스트림 구성. cleanup은 정지 시 호출.
        const { stream, cleanup } = await buildRecordingStream(audioSource, micDeviceId);
        streamCleanupRef.current = cleanup;
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
        console.error("녹음 시작 실패", err);
        const msg = (err as Error)?.message === NO_SYSTEM_AUDIO
          ? '시스템 소리를 캡처하려면 화면 공유 창에서 "오디오 공유"를 체크해 주세요.'
          : audioSource === 'mic'
            ? '마이크 접근 권한이 필요합니다.'
            : '녹음 소스를 시작하지 못했습니다. 권한·화면 공유 선택을 확인해 주세요.';
        showToastMsg(msg);
      }
    } else {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      streamCleanupRef.current?.(); // 원본 마이크/시스템 트랙 + 믹싱 컨텍스트 정리
      streamCleanupRef.current = null;
      setIsRecording(false);
      transcription.stop();
    }
  };

  // 빠른 녹음: 진입 시 실제 녹음+전사를 자동 시작한다.
  // (예전엔 isRecording만 true로 두어 UI만 REC이고 getUserMedia/transcription.start가
  //  안 불려 전사가 시작되지 않았음 — "대기"에서 멈추던 버그)
  const quickStartedRef = useRef(false);
  useEffect(() => {
    if (isQuickRecord && !quickStartedRef.current) {
      quickStartedRef.current = true;
      void toggleRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuickRecord]);

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
        if (cancelled || !note) return;
        if (inkRef.current) inkRef.current.loadStrokes(note.strokes);
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
      <RecordSourcePopover disabled={isRecording} />
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
      selectMode={selectMode}
      straightLine={straightLine}
      shapeMode={shapeMode}
      strokeTime={() => (isRecordingRef.current ? recordingTimeRef.current : undefined)}
      onStrokeTap={handleStrokeTap}
      onHistoryChange={({ canUndo, canRedo }) => { setCanUndo(canUndo); setCanRedo(canRedo); }}
      backgroundStyle={backgroundStyle}
      onDelta={handleLocalDelta}
      onStructureChange={scheduleSave} // 페이지 삭제·순서변경 시 저장(순서변경은 실시간 델타 없음)
      showLayers={deviceMode !== 'laptop'} // 노트북 모드의 작은 미러 뷰에선 패널 숨김
      controlsBottomInset={transcriptOpen ? 248 : 0} // 전사 패널(248px)이 페이지·줌 컨트롤을 가리지 않게
      className="flex-1"
    />
  );

  // 손필기 카드 내부 (캡쳐 / PDF / 일반 캔버스) — 태블릿·노트북 공용
  const handwritingCardInner = (
    <>
      {paperStyle === 'capture' && <LectureCapture noteId={noteId} />}

      {paperStyle === 'pdf' && (
        <PdfAdvancedRenderer
           ref={pdfRef}
           fileUrl={pdfUrl}
           fileName={fileName || 'Document.pdf'}
           pen={activePen}
           activeType={activeType}
           setActiveType={setActiveType}
           updateActivePen={updateActivePen}
           strokeTime={() => (isRecordingRef.current ? recordingTimeRef.current : undefined)}
           onStrokeTap={handleStrokeTap}
           recordSlot={recordButton}
           initialPageStrokes={pdfInitialPages}
           onStrokesChange={handlePdfStrokesChange}
        />
      )}

      {isCanvasNote && (
        <>
          <div className="p-4 flex items-center justify-between border-b border-slate-200 relative z-20 bg-white/80 backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              {/* #3 실행취소/다시실행 */}
              <button onClick={() => inkRef.current?.undo()} disabled={!canUndo} title="실행취소 (Undo)"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"><Undo2 className="w-5 h-5" /></button>
              <button onClick={() => inkRef.current?.redo()} disabled={!canRedo} title="다시실행 (Redo)"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"><Redo2 className="w-5 h-5" /></button>
              <div className="w-px h-6 bg-slate-200 mx-0.5" />
              <PenToolbar
                activeType={activeType}
                activePen={activePen}
                setActiveType={(t) => { pickTool('pen'); setActiveType(t); }}
                updateActivePen={updateActivePen}
              />
              <div className="w-px h-6 bg-slate-200 mx-0.5" />
              {/* 3색 퀵 팔레트(즐겨찾기) — 올가미 바로 왼쪽. 클릭=적용/우클릭=현재색 저장 */}
              <QuickColorPalette
                activeColor={activePen.color}
                onPick={(c) => { pickTool('pen'); updateActivePen({ color: c }); }}
              />
              <div className="w-px h-6 bg-slate-200 mx-0.5" />
              {/* 올가미 / 자(직선) / 도형 보정 — 상호 배타, 재탭 시 펜으로 복귀 */}
              <button onClick={() => pickTool(selectMode ? 'pen' : 'select')} title="올가미 선택 (획을 감싸 → 이동·크기·색·복제·삭제)"
                className={cn("p-2 rounded-lg transition-colors", selectMode ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")}><Lasso className="w-5 h-5" /></button>
              <button onClick={() => pickTool(straightLine ? 'pen' : 'straight')} title="자 (반듯한 직선, 각도 스냅)"
                className={cn("p-2 rounded-lg transition-colors", straightLine ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")}><Ruler className="w-5 h-5" /></button>
              <button onClick={() => pickTool(shapeMode ? 'pen' : 'shape')} title="도형 보정 (자유곡선 → 직선·원·사각형)"
                className={cn("p-2 rounded-lg transition-colors", shapeMode ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")}><Shapes className="w-5 h-5" /></button>
            </div>
            {recordButton}
          </div>
          {inkCanvas}
        </>
      )}
    </>
  );

  // 하단 도킹 패널 오른쪽 컬럼에 들어갈 요약 내용 (온디바이스/Cloud 토글 + 요약 카드)
  const summaryContent = (
    <div className="space-y-2.5">
      <div className="flex items-center bg-white border border-slate-200 p-1 rounded-full shadow-sm w-max mb-1">
        <button
          onClick={() => handleModeSwitch()}
          className={cn("px-2.5 py-1 text-[11px] font-bold rounded-full flex items-center gap-1 transition-all", aiMode === 'npu' ? "bg-slate-100 text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600")}
        >
          <Lock className="w-3 h-3" /> 온디바이스
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
        errorMsg={transcription.errorMsg}
        modelProgress={transcription.modelProgress}
        open={transcriptOpen}
        onToggle={() => setTranscriptOpen(!transcriptOpen)}
        onLineClick={handleTranscriptLineClick}
        highlightIndex={transcriptHighlightIdx}
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
      <div className="absolute inset-0 flex overflow-hidden">
        {/* Left: 태블릿 필기 실시간 미러링 (메인) */}
        <div className="flex-[3] min-h-0 bg-white border-r border-slate-200 relative flex flex-col overflow-hidden">
          <div className="px-4 py-1.5 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 태블릿 필기 실시간 미러링
          </div>
          {handwritingCardInner}
        </div>

        {/* Right: 타이핑 복습 (노트북 보조 입력) */}
        <div className="flex-[2] min-h-0 bg-white relative flex flex-col overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-slate-200 bg-white/80 shrink-0">
            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
              <Keyboard className="w-5 h-5 text-blue-500" /> 타이핑 복습
              <span className="text-xs font-mono text-slate-400 ml-2">{typedNote.length}자</span>
            </div>
          </div>
          <textarea
            value={typedNote}
            onChange={(e) => handleTypedChange(e.target.value)}
            placeholder="노트북에서 빠르게 타이핑하세요.&#10;태블릿의 손필기와 함께 하나의 노트로 동기화됩니다."
            className="flex-1 w-full resize-none outline-none p-6 text-slate-800 leading-relaxed text-[15px] bg-transparent placeholder:text-slate-300"
          />
        </div>

        {taskAndToast}
      </div>
    );
  }

  // ── 태블릿 모드: 손필기 캔버스가 페인을 꽉 채움 (AI는 하단 도킹) ──
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 bg-white relative flex flex-col overflow-hidden">
        {handwritingCardInner}
      </div>

      {taskAndToast}
    </div>
  );
}
