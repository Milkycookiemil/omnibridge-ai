// src/components/NewNoteModal.tsx
// '새 노트 생성' 모달 (공용) — 홈 대시보드와 워크스페이스 + 버튼에서 동일하게 사용.
//  1단계: 빈 페이지 / PDF 추가 / 강의 판서 캡쳐
//  2단계(빈 페이지): 무선 / 유선 / 옥스포드
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, File, FilePlus, Sparkles, ChevronLeft } from 'lucide-react';
import { ViewState } from '../types';
import { createNote, deleteNote, type PaperStyle } from '../lib/notesStore';
import { uploadPdf, isFileStoreReady, QuotaError, stashPdfFile } from '../lib/pdfStore';
import { PAGE_RATIOS, makeSizeId, isSquare, pageDims, type Orientation } from '../lib/pageSizes';
import { cn } from '../lib/utils';

interface NewNoteModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: ViewState, context?: any) => void;
}

export function NewNoteModal({ open, onClose, onNavigate }: NewNoteModalProps) {
  const [selectedNoteType, setSelectedNoteType] = useState<'blank' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ratioId, setRatioId] = useState('a4');       // 페이지 비율(기본 A4)
  const [orient, setOrient] = useState<Orientation>('p'); // 방향(기본 세로)
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 열릴 때마다 1단계로 초기화
  useEffect(() => {
    if (open) {
      setSelectedNoteType(null);
      setError(null);
      setRatioId('a4');
      setOrient('p');
    }
  }, [open]);

  // PDF 선택 → PDF 노트 생성 + 원본을 Storage에 업로드(로그인 시) → 편집 화면으로.
  // 업로드하면 다른 기기·재방문에서 파일을 다시 고를 필요 없이 자동 복원된다.
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 가능하도록
    if (!file) return;
    setError(null);
    setBusy(true);
    const title = file.name.replace(/\.pdf$/i, '');
    const note = await createNote('pdf', title);
    // 방금 고른 원본을 메모리에 잠시 보관 → WorkspaceView 라우팅이 navContext.file을
    // 떨어뜨려도 LiveNoteView가 최초 렌더에서 바로 쓴다(게스트도 PDF 표시됨).
    stashPdfFile(note.id, file);
    if (isFileStoreReady()) {
      try {
        await uploadPdf(note.id, file);
      } catch (err) {
        setBusy(false);
        if (err instanceof QuotaError) {
          await deleteNote(note.id); // 저장 못 한 빈 노트 정리
          setError(err.message);
          return;
        }
        // 업로드 실패(오프라인 등): 로컬 세션은 계속 쓰되 클라우드 복원은 다음 기회에.
        console.warn('PDF 업로드 실패(로컬은 계속 사용):', err);
      }
    }
    setBusy(false);
    onClose();
    onNavigate('live_note', { noteId: note.id, style: 'pdf', fileName: file.name, file });
  };

  // 새 손필기 노트 생성 후 열기 (선택한 페이지 크기 포함)
  const handleCreateNote = async (style: PaperStyle) => {
    const pageSize = makeSizeId(ratioId, isSquare(ratioId) ? 'p' : orient);
    const note = await createNote(style, undefined, pageSize);
    onClose();
    onNavigate('live_note', { noteId: note.id, style, title: note.title, pageSize });
  };

  return (
    <>
      <input type="file" ref={fileInputRef} hidden accept=".pdf" onChange={handlePdfUpload} />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-slate-800"
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold mb-6">새 노트 생성</h2>

              {error && (
                <div className="mb-4 text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              {busy && (
                <div className="mb-4 text-sm font-medium text-slate-500">PDF 업로드 중…</div>
              )}

              {!selectedNoteType ? (
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSelectedNoteType('blank')}
                    className="p-6 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center gap-3 transition-colors text-slate-700 hover:border-slate-300 shadow-sm"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                      <File className="w-6 h-6 text-blue-500" />
                    </div>
                    <span className="font-medium text-sm">빈 페이지</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-6 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center gap-3 transition-colors text-slate-700 hover:border-slate-300 shadow-sm"
                  >
                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                      <FilePlus className="w-6 h-6 text-amber-500" />
                    </div>
                    <span className="font-medium text-sm">PDF 추가</span>
                  </button>
                  <button
                    onClick={async () => {
                      // 캡쳐 노트도 noteId를 부여해 슬라이드를 영속화한다.
                      const note = await createNote('capture');
                      onClose();
                      onNavigate('live_note', { noteId: note.id, style: 'capture', title: note.title });
                    }}
                    className="p-6 col-span-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center gap-3 transition-colors text-slate-700 hover:border-slate-300 shadow-sm"
                  >
                    <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-teal-500" />
                    </div>
                    <span className="font-medium text-sm">강의 판서 캡쳐</span>
                  </button>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                  <button
                    onClick={() => setSelectedNoteType(null)}
                    className="mb-4 text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> 뒤로 가기
                  </button>

                  {/* 페이지 크기: 방향(세로/가로) + 비율 + 미리보기 */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-400">페이지 크기</span>
                      {/* 방향 토글 (정사각은 방향 무의미 → 숨김) */}
                      {!isSquare(ratioId) && (
                        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                          {(['p', 'l'] as Orientation[]).map((o) => (
                            <button key={o} onClick={() => setOrient(o)}
                              className={cn('px-2.5 py-1 text-xs font-bold rounded-md transition-colors',
                                orient === o ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                              {o === 'p' ? '세로' : '가로'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {/* 선택 비율 미리보기(축소) */}
                      {(() => {
                        const d = pageDims(makeSizeId(ratioId, isSquare(ratioId) ? 'p' : orient));
                        const box = 44; const w = d.w >= d.h ? box : Math.round(box * d.w / d.h); const h = d.h >= d.w ? box : Math.round(box * d.h / d.w);
                        return <div className="shrink-0 w-12 h-12 flex items-center justify-center"><div className="border-2 border-slate-300 rounded bg-slate-50" style={{ width: w, height: h }} /></div>;
                      })()}
                      <div className="flex flex-wrap gap-1.5">
                        {PAGE_RATIOS.map((r) => (
                          <button key={r.id} onClick={() => setRatioId(r.id)}
                            className={cn('px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors',
                              ratioId === r.id ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs font-bold text-slate-400 mb-2">용지</div>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => handleCreateNote('blank')}
                      className="aspect-square rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden group shadow-sm"
                    >
                      <span className="font-medium text-sm relative z-10 text-slate-600 group-hover:text-slate-900 transition-colors">무선</span>
                    </button>
                    <button
                      onClick={() => handleCreateNote('ruled')}
                      className="aspect-square rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden group shadow-sm"
                    >
                      <div className="absolute inset-0 opacity-[0.05] pointer-events-none group-hover:opacity-10 transition-opacity" style={{ backgroundImage: 'linear-gradient(transparent 85%, black 85%)', backgroundSize: '100% 20%' }}></div>
                      <span className="font-medium text-sm relative z-10 bg-white/90 px-2 py-0.5 rounded text-slate-600 group-hover:text-slate-900 transition-colors shadow-sm border border-slate-100">유선</span>
                    </button>
                    <button
                      onClick={() => handleCreateNote('oxford')}
                      className="aspect-square rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden group shadow-sm"
                    >
                      <div className="absolute inset-0 opacity-[0.05] pointer-events-none group-hover:opacity-10 transition-opacity" style={{ backgroundImage: 'linear-gradient(transparent 85%, black 85%), linear-gradient(90deg, transparent 15%, #ef4444 15%, #ef4444 18%, transparent 18%)', backgroundSize: '100% 20%, 100% 100%' }}></div>
                      <span className="font-medium text-sm relative z-10 bg-white/90 px-2 py-0.5 rounded text-slate-600 group-hover:text-slate-900 transition-colors shadow-sm border border-slate-100">옥스포드</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
