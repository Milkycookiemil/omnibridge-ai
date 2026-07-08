// src/lib/workspace.ts
// 다중 노트 작업공간(포토샵식 MDI) 상태.
//  - tabs: 열린 노트 목록(탭)
//  - leftId: 주 페인에 표시되는 노트 / rightId: 분할 시 오른쪽 페인(없으면 null = 단일)
import { create } from 'zustand';
import type { PaperStyle } from './notesStore';

export interface WsTab {
  id: string;
  style: PaperStyle;
  title: string;
}

interface WorkspaceState {
  tabs: WsTab[];
  leftId: string | null;
  rightId: string | null; // null = 단일 페인

  openNote: (tab: WsTab) => void;   // 탭 열기(없으면 추가) + 주 페인 활성
  closeTab: (id: string) => void;   // 탭 닫기 + 페인 정리
  activate: (id: string) => void;   // 주(왼쪽) 페인에 로드
  setRight: (id: string | null) => void; // 오른쪽 페인 지정(=분할) / null=분할 해제
  setTitle: (id: string, title: string) => void;
  reset: () => void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  tabs: [],
  leftId: null,
  rightId: null,

  openNote: (tab) => {
    const { tabs } = get();
    const exists = tabs.some((t) => t.id === tab.id);
    set({
      tabs: exists ? tabs : [...tabs, tab],
      leftId: tab.id,
    });
  },

  closeTab: (id) => {
    const { tabs, leftId, rightId } = get();
    const remaining = tabs.filter((t) => t.id !== id);
    set({
      tabs: remaining,
      leftId: leftId === id ? remaining[0]?.id ?? null : leftId,
      rightId: rightId === id ? null : rightId,
    });
  },

  activate: (id) => set({ leftId: id }),

  setRight: (id) => set({ rightId: id }),

  setTitle: (id, title) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) })),

  reset: () => set({ tabs: [], leftId: null, rightId: null }),
}));
