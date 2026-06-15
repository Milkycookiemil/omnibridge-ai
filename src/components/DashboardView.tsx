import React, { useState, useRef } from 'react';
import { ViewState } from '../types';
import { dummyData } from '../data';
import { Play, Sparkles, Plus, RefreshCw, FileText, AlertTriangle, Mic, FilePlus, File, ChevronLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface DashboardViewProps {
  onNavigate: (view: ViewState, context?: any) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [isNewNoteModalOpen, setIsNewNoteModalOpen] = useState(false);
  const [selectedNoteType, setSelectedNoteType] = useState<'blank' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onNavigate('live_note', { style: 'pdf', fileName: file.name, file: file });
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-32">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 text-slate-900">안녕하세요, 크리스님</h1>
          <p className="text-slate-500">모든 기기의 학습 기록이 동기화되었습니다.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => onNavigate('live_note', { quickRecord: true, style: 'blank' })}
            className="border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
          >
            <Mic className="w-4 h-4" /> 빠른 녹음 시작
          </button>
          <button 
            onClick={() => { setIsNewNoteModalOpen(true); setSelectedNoteType(null); }}
            className="bg-gradient-sync text-white flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl shadow-lg shadow-accent-blue/20 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />새 노트
          </button>
          <input type="file" ref={fileInputRef} hidden accept=".pdf" onChange={handlePdfUpload} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {/* Smart Replay Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 relative overflow-hidden group border border-slate-200 rounded-2xl shadow-sm"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
          <div className="flex items-start justify-between mb-4 relative z-10">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
              <Play className="w-3 h-3 fill-current" /> 진행 중인 강의
            </div>
            <span className="text-slate-400 text-xs">{dummyData.currentNote.lastOpened}</span>
          </div>
          
          <h2 className="text-xl font-bold mb-6 text-slate-800 relative z-10">{dummyData.currentNote.title}</h2>
          
          <div className="mb-6 relative z-10">
            <div className="flex justify-between text-xs mb-2 font-mono text-slate-500">
              <span>{dummyData.currentNote.progress.split(' / ')[0]}</span>
              <span>{dummyData.currentNote.progress.split(' / ')[1]}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-sync rounded-full w-[70%]" />
            </div>
          </div>

          <button 
            onClick={() => onNavigate('replay')}
            className="w-full relative z-10 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors text-sm font-bold text-slate-700"
          >
            계속 공부하기
          </button>
        </motion.div>

        {/* AI Safety Insights */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 flex flex-col border border-slate-200 rounded-2xl shadow-sm"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-violet-600 mb-4">
            <Sparkles className="w-4 h-4" /> AI 세이프티 인사이트
          </div>
          
          <div className="flex-1">
            <div className="flex flex-wrap gap-2 mb-6">
              {dummyData.aiInsights.tags.map(tag => (
                <button 
                  key={tag} 
                  onClick={() => onNavigate('search')}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-amber-600 mb-1">복습 권장 구간</div>
                <div className="text-sm text-slate-700">{dummyData.aiInsights.warning}</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
          <FileText className="w-5 h-5 text-slate-400" />최근 노트
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {dummyData.recentNotes.map((note, idx) => {
            const maskPII = (text: string) => {
              if (!text) return text;
              let masked = text.replace(/01[016789]-?\d{3,4}-?\d{4}/g, "[개인정보 보호 마스킹]");
              masked = masked.replace(/\d{2}[0-1]\d[0-3]\d-?[1-4]\d{6}/g, "[개인정보 보호 마스킹]");
              return masked;
            };
            return (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + idx * 0.1 }}
                key={idx} 
                className="bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-shadow group flex flex-col"
              >
                <div className="w-full h-20 bg-slate-50 border border-slate-100 rounded-lg mb-3 flex items-center justify-center group-hover:bg-slate-100 transition-colors p-2 overflow-hidden text-xs text-slate-500">
                  {note.snippet ? maskPII(note.snippet) : <FileText className="w-8 h-8 text-slate-300 group-hover:text-slate-400 transition-colors" />}
                </div>
                <h4 className="font-medium text-sm truncate mb-1 text-slate-800">{note.title}</h4>
                <p className="text-xs text-slate-400">{note.date}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isNewNoteModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} 
              animate={{ scale: 1 }} 
              exit={{ scale: 0.95 }} 
              className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-slate-800"
            >
              <button 
                onClick={() => setIsNewNoteModalOpen(false)} 
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5"/>
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
                    onClick={() => { onNavigate('live_note', { style: 'capture' }); setIsNewNoteModalOpen(false); }} 
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
                    <ChevronLeft className="w-4 h-4"/> 뒤로 가기
                  </button>
                  <div className="grid grid-cols-3 gap-3">
                    <button 
                      onClick={() => { onNavigate('live_note', { style: 'blank' }); setIsNewNoteModalOpen(false); }} 
                      className="aspect-square rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden group shadow-sm"
                    >
                      <span className="font-medium text-sm relative z-10 text-slate-600 group-hover:text-slate-900 transition-colors">무선</span>
                    </button>
                    <button 
                      onClick={() => { onNavigate('live_note', { style: 'ruled' }); setIsNewNoteModalOpen(false); }} 
                      className="aspect-square rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden group shadow-sm"
                    >
                      <div className="absolute inset-0 opacity-[0.05] pointer-events-none group-hover:opacity-10 transition-opacity" style={{ backgroundImage: 'linear-gradient(transparent 85%, black 85%)', backgroundSize: '100% 20%' }}></div>
                      <span className="font-medium text-sm relative z-10 bg-white/90 px-2 py-0.5 rounded text-slate-600 group-hover:text-slate-900 transition-colors shadow-sm border border-slate-100">유선</span>
                    </button>
                    <button 
                      onClick={() => { onNavigate('live_note', { style: 'oxford' }); setIsNewNoteModalOpen(false); }} 
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
    </div>
  );
}
