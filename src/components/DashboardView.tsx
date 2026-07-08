import React, { useState, useEffect } from 'react';
import { ViewState } from '../types';
import { dummyData } from '../data';
import { Play, Sparkles, Plus, FileText, AlertTriangle, Mic, Trash2, PenLine, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { listNotes, deleteNote, renameNote, type NoteMeta } from '../lib/notesStore';
import { NewNoteModal } from './NewNoteModal';

interface DashboardViewProps {
  onNavigate: (view: ViewState, context?: any) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [isNewNoteModalOpen, setIsNewNoteModalOpen] = useState(false);

  // 실제 저장된 노트 목록 (IndexedDB)
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    listNotes().then(setNotes);
  }, []);

  const startRename = (e: React.MouseEvent, note: NoteMeta) => {
    e.stopPropagation();
    setEditingId(note.id);
    setEditTitle(note.title);
  };

  const commitRename = async () => {
    const id = editingId;
    setEditingId(null);
    if (!id) return;
    const title = editTitle.trim();
    if (title) {
      await renameNote(id, title);
      setNotes(await listNotes());
    }
  };

  const handleDeleteNote = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteNote(id);
    setNotes(await listNotes());
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (isSameDay(d, today)) return '오늘';
    if (isSameDay(d, yesterday)) return '어제';
    return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
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
            onClick={() => setIsNewNoteModalOpen(true)}
            className="bg-gradient-sync text-white flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl shadow-lg shadow-accent-blue/20 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />새 노트
          </button>
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
          <FileText className="w-5 h-5 text-slate-400" />내 노트
        </h3>

        {notes.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl py-14 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <PenLine className="w-6 h-6 text-blue-500" />
            </div>
            <p className="text-sm text-slate-500 font-medium">아직 저장된 노트가 없어요.</p>
            <button
              onClick={() => setIsNewNoteModalOpen(true)}
              className="mt-1 bg-gradient-sync text-white flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> 첫 노트 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {notes.map((note, idx) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.05, 0.3) }}
                key={note.id}
                onClick={() => onNavigate('live_note', { noteId: note.id, style: note.style, title: note.title })}
                className="bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-shadow group flex flex-col relative"
              >
                <div className="absolute top-3 right-3 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => startRename(e, note)}
                    className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200 text-slate-400 hover:text-blue-500 hover:border-blue-200 flex items-center justify-center"
                    title="이름 바꾸기"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteNote(e, note.id)}
                    className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center"
                    title="노트 삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="w-full h-24 bg-slate-50 border border-slate-100 rounded-lg mb-3 flex items-center justify-center group-hover:bg-slate-100 transition-colors overflow-hidden">
                  {note.thumbnail ? (
                    <img src={note.thumbnail} alt={note.title} className="w-full h-full object-contain" draggable={false} />
                  ) : (
                    <PenLine className="w-8 h-8 text-slate-300 group-hover:text-slate-400 transition-colors" />
                  )}
                </div>
                {editingId === note.id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingId(null); }}
                    className="w-full font-medium text-sm mb-1 text-slate-800 border border-blue-300 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                ) : (
                  <h4 className="font-medium text-sm truncate mb-1 text-slate-800">{note.title}</h4>
                )}
                <p className="text-xs text-slate-400">{formatDate(note.updatedAt)}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <NewNoteModal
        open={isNewNoteModalOpen}
        onClose={() => setIsNewNoteModalOpen(false)}
        onNavigate={onNavigate}
      />
    </div>
  );
}
