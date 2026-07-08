// src/components/WorkspaceView.tsx
// 다중 노트 작업공간 — 포토샵식 탭 + 좌우 2분할.
//  - 상단 탭 바: 열린 노트 전환/닫기, 분할 토글
//  - 본문: 단일 페인(왼쪽) 또는 좌/우 2분할. 각 페인은 독립 LiveNoteView 인스턴스.
import React, { useEffect } from 'react';
import { X, Columns2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useWorkspace } from '../lib/workspace';
import { LiveNoteView } from './LiveNoteView';

interface WorkspaceViewProps {
  onEmpty: () => void; // 모든 탭이 닫히면 대시보드로
}

export function WorkspaceView({ onEmpty }: WorkspaceViewProps) {
  const { tabs, leftId, rightId, activate, closeTab, setRight } = useWorkspace();

  // 탭이 모두 닫히면 대시보드로 복귀
  useEffect(() => {
    if (tabs.length === 0) onEmpty();
  }, [tabs.length, onEmpty]);

  const leftTab = tabs.find((t) => t.id === leftId);
  const rightTab = tabs.find((t) => t.id === rightId);
  // 좌/우가 같은 노트면 분할 무효(동일 노트 동시편집 충돌 방지)
  const showRight = !!rightTab && rightTab.id !== leftTab?.id;

  const handleTabClick = (id: string) => {
    // 오른쪽 페인에 있던 노트를 탭에서 누르면 좌우 스왑
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

  if (!leftTab) return null; // 빈 상태(위 effect가 대시보드로 보냄)

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
              {/* 오른쪽 페인 헤더: 표시할 노트 선택 + 분할 닫기 */}
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
    </div>
  );
}
