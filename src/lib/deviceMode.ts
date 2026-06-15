// src/lib/deviceMode.ts
// 이기종 크로스 시뮬레이션: 태블릿(S펜 손필기) ↔ 노트북(고속 타이핑·복습) 모드를
// 전역에서 전환한다. 같은 노트가 두 기기 폼팩터에서 일관되게 보임을 시연하기 위함.
import { create } from 'zustand';

export type DeviceMode = 'tablet' | 'laptop';
const STORAGE_KEY = 'omnibridge.deviceMode';

const load = (): DeviceMode => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'laptop' || v === 'tablet') return v;
  } catch {
    /* ignore */
  }
  return 'tablet';
};

interface DeviceModeState {
  deviceMode: DeviceMode;
  setDeviceMode: (mode: DeviceMode) => void;
}

export const useDeviceMode = create<DeviceModeState>((set) => ({
  deviceMode: load(),
  setDeviceMode: (mode) => {
    set({ deviceMode: mode });
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  },
}));
