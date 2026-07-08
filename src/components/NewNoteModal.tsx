// src/components/NewNoteModal.tsx
// '새 노트 생성' 모달 (공용) — 홈 대시보드와 워크스페이스 + 버튼에서 동일하게 사용.
//  1단계: 빈 페이지 / PDF 추가 / 강의 판서 캡쳐
//  2단계(빈 페이지): 무선 / 유선 / 옥스포드
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, File, FilePlus, Sparkles, ChevronLeft } from 'lucide-react';
import { ViewState } from '../types';
import { createNote, type PaperStyle } from '../lib/notesStore';

interface NewNoteModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: ViewState, context?: any) => void;
}

export function NewNoteModal({ open, onClose, onNavigate }: NewNoteModalProps) {
  const [selectedNoteType, setSelectedNoteType] = useState<'blank' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 열릴 때마다 1단계로 초기화
  useEffect(() => {
    if (open) setSelectedNoteType(null);
  }, [open]);

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onClose();
      onNavigate('live_note', { style: 'pdf', fileName: file.name, file });
    }
  };

  // 새 손필기 노트 생성 후 열기
  const handleCreateNote = async (style: PaperStyle) => {
    const note = await createNote(style);
    onClose();
    onNavigate('live_note', { noteId: note.id, style, title: note.title });
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
                    onClick={() => {
                      onClose();
                      onNavigate('live_note', { style: 'capture' });
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
