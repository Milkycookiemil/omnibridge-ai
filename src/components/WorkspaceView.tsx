// src/components/WorkspaceView.tsx
// 다중 노트 작업공간 — 포토샵식 탭 + 좌우 2분할.
//  - 상단 탭 바: 열린 노트 전환/닫기, 분할 토글, 크롬식 + 버튼(노트 열기/새 노트 팝업)
//  - 본문: 단일 페인(왼쪽) 또는 좌/우 2분할. 각 페인은 독립 LiveNoteView 인스턴스.
import React, { useEffect, useState } from 'react';
import { X, Columns2, Plus, PenLine } from 'lucide-react';
import { cn } from '../lib/utils';
import { useWorkspace } from '../lib/workspace';
import { listNotes, createNote, type NoteMeta } from '../lib/notesStore';
import { LiveNoteView } from './LiveNoteView';

interface WorkspaceViewProps {
  onEmpty: () => void; // 모든 탭이 닫히면 대시보드로
}

export function WorkspaceView({ onEmpty }: WorkspaceViewProps) {
  const { tabs, leftId, rightId, openNote, activate, closeTab, setRight } = useWorkspace();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerNotes, setPickerNotes] = useState<NoteMeta[]>([]);

  // 탭이 모두 닫히면 대시보드로 복귀
  useEffect(() => {
    if (tabs.length === 0) onEmpty();
  }, [tabs.length, onEmpty]);

  // 피커 열 때 최신 노트 목록 로드
  useEffect(() => {
    if (pickerOpen) listNotes().then(setPickerNotes);
  }, [pickerOpen]);

  const leftTab = tabs.find((t) => t.id === leftId);
  const rightTab = tabs.find((t) => t.id === rightId);
  const showRight = !!rightTab && rightTab.id !== leftTab?.id;
  const openIds = new Set(tabs.map((t) => t.id));

  const handleTabClick = (id: string) => {
    if (rightId && id === rightId) {
      const prevLeft = leftId;
      activate(id);
      setRight(prevLeft);
    } else {
      activate(id);
    }
  };

  const toggleSplit = () => {
    if (showRight) {
      setRight(null);
      return;
    }
    const other = tabs.find((t) => t.id !== leftId);
    if (other) setRight(other.id);
  };

  // 피커에서 기존 노트 열기
  const openFromPicker = (n: NoteMeta) => {
    openNote({ id: n.id, style: n.style, title: n.title });
    setPickerOpen(false);
  };

  // 피커에서 새 노트 생성 후 열기 (무선 노트 기본)
  const createNewNote = async () => {
    const note = await createNote('blank');
    openNote({ id: note.id, style: note.style, title: note.title });
    setPickerOpen(false);
  };

  if (!leftTab) return null;

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-slate-100">
      {/* 탭 바 */}
      <div className="flex items-stretch shrink-0 bg-slate-200/50 border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === leftId || tab.id === rightId;
          return (
            <div
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                'group flex items-center gap-2 pl-3 pr-1.5 py-2 max-w-[220px] border-r border-slate-200 cursor-pointer select-none transition-colors',
                active ? 'bg-white text-slate-800' : 'bg-slate-50/70 text-slate-500 hover:bg-white/70'
              )}
              title={tab.title}
            >
              <span className={cn('truncate text-sm', active && 'font-semibold')}>{tab.title}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="탭 닫기"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            </div>
          );
        })}

        {/* 크롬식 + 버튼 (노트 열기 / 새 노트) */}
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className={cn(
            'shrink-0 w-8 h-8 my-1 ml-1.5 rounded-full flex items-center justify-center transition-colors',
            pickerOpen ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-white hover:text-slate-800'
          )}
          title="노트 열기 / 새 노트"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-4" />

        <button
          onClick={toggleSplit}
          disabled={tabs.length < 2 && !showRight}
          className={cn(
            'px-3 flex items-center gap-1.5 text-sm font-medium border-l border-slate-200 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed',
            showRight ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-white/70'
          )}
          title={showRight ? '분할 닫기' : '2분할로 보기'}
        >
          <Columns2 className="w-4 h-4" /> {showRight ? '분할 해제' : '분할'}
        </button>
      </div>

      {/* 페인 영역 */}
      <div className="flex-1 min-h-0 flex">
        {/* 왼쪽(주) 페인 */}
        <div key={leftTab.id} className="relative flex-1 min-w-0">
          <LiveNoteView navContext={{ noteId: leftTab.id, style: leftTab.style }} />
        </div>

        {/* 오른쪽 페인 (분할) */}
        {showRight && rightTab && (
          <>
            <div className="w-px bg-slate-300 shrink-0" />
            <div className="relative flex-1 min-w-0 flex flex-col">
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 shrink-0 z-30">
                <span className="text-xs text-slate-400 shrink-0">오른쪽</span>
                <select
                  value={rightTab.id}
                  onChange={(e) => setRight(e.target.value)}
                  className="text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-blue-400 max-w-[220px] truncate"
                >
                  {tabs
                    .filter((t) => t.id !== leftId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
                <div className="flex-1" />
                <button
                  onClick={() => setRight(null)}
                  className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                  title="분할 닫기"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div key={rightTab.id} className="relative flex-1 min-h-0">
                <LiveNoteView navContext={{ noteId: rightTab.id, style: rightTab.style }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* 노트 열기 / 새 노트 팝업 (크롬 탭 + 버튼) */}
      {pickerOpen && (
        <div className="absolute inset-0 z-40" onClick={() => setPickerOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-11 left-3 w-80 max-h-[70%] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-bold text-slate-700 shrink-0">
              노트 열기
            </div>

            <div className="flex-1 overflow-y-auto p-1.5">
              {pickerNotes.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-8">저장된 노트가 없어요.</div>
              ) : (
                pickerNotes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openFromPicker(n)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
                  >
                    <div className="w-10 h-10 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {n.thumbnail ? (
                        <img src={n.thumbnail} alt={n.title} className="w-full h-full object-contain" draggable={false} />
                      ) : (
                        <PenLine className="w-4 h-4 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{n.title}</div>
                      <div className="text-xs text-slate-400">
                        {openIds.has(n.id) ? '열려 있음' : new Date(n.updatedAt).toLocaleDateString('ko-KR')}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* 맨 아래: 새 노트 (홈의 '새 노트'와 동일 스타일) */}
            <div className="p-2 border-t border-slate-100 shrink-0">
              <button
                onClick={createNewNote}
                className="w-full bg-gradient-sync text-white flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" /> 새 노트
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
