// src/lib/preferences.ts
// 앱 전역 사용자 환경설정. 사용자 통제권 보장(Nielsen Heuristic #3)을 위해
// '알림 끄기' 영구 토글 상태를 한 곳에서 관리하고 localStorage에 영속화한다.
import { create } from 'zustand';

const STORAGE_KEY = 'omnibridge.preferences';

export type AudioSource = 'mic' | 'system' | 'both';
export type NoteViewMode = 'scroll' | 'flip'; // 연속 스크롤(기본) / 페이지 넘김

interface PersistedPrefs {
  notificationsEnabled: boolean;
  transcriptOpen: boolean; // 전사 패널 펼침/접힘 상태
  audioSource: AudioSource; // 전사/녹음 소스: 마이크 / 시스템(화면공유) / 둘 다
  micDeviceId: string | null; // 선택한 마이크 장치(없으면 기본 마이크)
  favoriteColors: string[]; // 필기 툴바 3색 퀵 팔레트(즐겨찾기). 클릭=적용/우클릭=현재색 저장
  noteViewMode: NoteViewMode; // 필기 페이지 보기: 연속 스크롤 / 페이지 넘김
  recentColors: string[]; // 색상 상세 선택기에서 최근 고른 색(최대 6, 최신순)
  touchDraw: boolean; // 손가락으로 그리기 허용(기본 끔 = 삼성노트식: S펜만 그림, 손가락은 팬/줌 전용)
}

const DEFAULTS: PersistedPrefs = {
  notificationsEnabled: true,
  transcriptOpen: true,
  audioSource: 'mic',
  micDeviceId: null,
  favoriteColors: ['#f59e0b', '#3b82f6', '#334155'], // 주황 / 파랑 / 짙은 회색
  noteViewMode: 'scroll',
  recentColors: [],
  touchDraw: false,
};

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
  setAudioSource: (source: AudioSource) => void;
  setMicDeviceId: (id: string | null) => void;
  setFavoriteColor: (index: number, color: string) => void;
  setNoteViewMode: (mode: NoteViewMode) => void;
  pushRecentColor: (color: string) => void;
  setTouchDraw: (on: boolean) => void;
}

const persist = (prefs: PersistedPrefs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* 영속화 실패는 무시 */
  }
};

// 현재 상태 전체를 persist용 형태로 뽑는다(필드 추가 시 여기만 유지).
const snapshot = (s: PreferencesState): PersistedPrefs => ({
  notificationsEnabled: s.notificationsEnabled,
  transcriptOpen: s.transcriptOpen,
  audioSource: s.audioSource,
  micDeviceId: s.micDeviceId,
  favoriteColors: s.favoriteColors,
  noteViewMode: s.noteViewMode,
  recentColors: s.recentColors,
  touchDraw: s.touchDraw,
});

export const usePreferences = create<PreferencesState>((set, get) => ({
  ...loadPrefs(),
  setNotificationsEnabled: (enabled) => {
    set({ notificationsEnabled: enabled });
    persist(snapshot(get()));
  },
  setTranscriptOpen: (open) => {
    set({ transcriptOpen: open });
    persist(snapshot(get()));
  },
  setAudioSource: (source) => {
    set({ audioSource: source });
    persist(snapshot(get()));
  },
  setMicDeviceId: (id) => {
    set({ micDeviceId: id });
    persist(snapshot(get()));
  },
  setFavoriteColor: (index, color) => {
    const next = [...get().favoriteColors];
    next[index] = color;
    set({ favoriteColors: next });
    persist(snapshot(get()));
  },
  setNoteViewMode: (mode) => {
    set({ noteViewMode: mode });
    persist(snapshot(get()));
  },
  pushRecentColor: (color) => {
    const c = color.toLowerCase();
    const next = [c, ...get().recentColors.filter((x) => x.toLowerCase() !== c)].slice(0, 6);
    set({ recentColors: next });
    persist(snapshot(get()));
  },
  setTouchDraw: (on) => {
    set({ touchDraw: on });
    persist(snapshot(get()));
  },
}));
