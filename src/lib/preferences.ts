// src/lib/preferences.ts
// 앱 전역 사용자 환경설정. 사용자 통제권 보장(Nielsen Heuristic #3)을 위해
// '알림 끄기' 영구 토글 상태를 한 곳에서 관리하고 localStorage에 영속화한다.
import { create } from 'zustand';

const STORAGE_KEY = 'omnibridge.preferences';

export type AudioSource = 'mic' | 'system' | 'both';

interface PersistedPrefs {
  notificationsEnabled: boolean;
  transcriptOpen: boolean; // 전사 패널 펼침/접힘 상태
  audioSource: AudioSource; // 전사/녹음 소스: 마이크 / 시스템(화면공유) / 둘 다
  micDeviceId: string | null; // 선택한 마이크 장치(없으면 기본 마이크)
}

const DEFAULTS: PersistedPrefs = {
  notificationsEnabled: true,
  transcriptOpen: true,
  audioSource: 'mic',
  micDeviceId: null,
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
}));
