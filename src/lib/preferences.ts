// src/lib/preferences.ts
// 앱 전역 사용자 환경설정. 사용자 통제권 보장(Nielsen Heuristic #3)을 위해
// '알림 끄기' 영구 토글 상태를 한 곳에서 관리하고 localStorage에 영속화한다.
import { create } from 'zustand';

const STORAGE_KEY = 'omnibridge.preferences';

interface PersistedPrefs {
  notificationsEnabled: boolean;
  transcriptOpen: boolean; // 전사 패널 펼침/접힘 상태
}

const DEFAULTS: PersistedPrefs = { notificationsEnabled: true, transcriptOpen: true };

const loadPrefs = (): PersistedPrefs => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* localStorage 접근 불가 시 기본값 */
  }
  return { ...DEFAULTS };
};

interface PreferencesState extends PersistedPrefs {
  setNotificationsEnabled: (enabled: boolean) => void;
  setTranscriptOpen: (open: boolean) => void;
}

const persist = (prefs: PersistedPrefs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* 영속화 실패는 무시 */
  }
};

export const usePreferences = create<PreferencesState>((set, get) => ({
  ...loadPrefs(),
  setNotificationsEnabled: (enabled) => {
    set({ notificationsEnabled: enabled });
    persist({ notificationsEnabled: enabled, transcriptOpen: get().transcriptOpen });
  },
  setTranscriptOpen: (open) => {
    set({ transcriptOpen: open });
    persist({ notificationsEnabled: get().notificationsEnabled, transcriptOpen: open });
  },
}));
