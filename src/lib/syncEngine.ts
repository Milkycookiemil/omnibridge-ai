// src/lib/syncEngine.ts
// 2단계 하이브리드 동기화 엔진.
//  1단계 (실시간 릴레이): Supabase Realtime broadcast 채널로 잉크 델타를 0.1초 내 타 기기 중계.
//  2단계 (영속 저장): Debounce 데드타임/강의 종료 시 CRDT 병합 결과를 .ob 파일로 Google Drive Flush.
// Supabase 환경변수가 없으면 타이머 기반 시뮬레이션으로 자동 폴백한다.
import { uploadToGoogleDrive } from './drive';
import { create } from 'zustand';
import * as Y from 'yjs';
import { supabase, isSupabaseConfigured, CLIENT_ID } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { InkDelta, InkSegment } from './inkEngine';

// 잉크 델타(세그먼트 또는 erase_strokes 연산)가 실시간 릴레이의 최소 단위.
// CRDT에는 append-only로 쌓여 리플레이 시 순서대로 적용된다 (삭제 포함 상태 재현).
export type { InkDelta, InkSegment };

// 세그먼트 / 삭제 / 시각 연산 판별
const isInkDelta = (d: any): d is InkDelta =>
  !!d && typeof d === 'object' && (('from' in d && 'to' in d) || d.type === 'erase_strokes' || d.type === 'stroke_time');

interface SyncState {
  isOnline: boolean;
  setOnline: (online: boolean) => void;

  // 실제 Realtime 채널 연결 여부 (Supabase 미설정 시 false 유지, 시뮬레이션 모드)
  liveConnected: boolean;
  peerCount: number;

  relayStatus: 'idle' | 'syncing' | 'synced';
  driveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastDriveSync: string | null;

  offlineQueueLength: number;

  pushDelta: (delta: any) => void;
  triggerManualFlush: () => void;
}

// --- CRDT 문서: 모든 잉크 이벤트의 충돌 없는 단일 진실 공급원 ---
const ydoc = new Y.Doc();
const yStrokes = ydoc.getArray<InkDelta>('strokes');

// 오프라인 격리 큐 (네트워크 단절 시 보관 → 복귀 시 CRDT 병합)
let offlineQueue: InkDelta[] = [];
let debounceTimer: any = null;
let channel: RealtimeChannel | null = null;

// 원격 델타 수신 리스너 (LiveNoteView가 캔버스에 반영하기 위해 구독)
type RemoteListener = (delta: InkDelta) => void;
const remoteListeners = new Set<RemoteListener>();
export const onRemoteStroke = (cb: RemoteListener): (() => void) => {
  remoteListeners.add(cb);
  return () => remoteListeners.delete(cb);
};
const emitRemote = (delta: InkDelta) => remoteListeners.forEach((cb) => cb(delta));

// CRDT에 누적된 모든 잉크 이벤트 (기기 전환/늦은 합류 시 캔버스 리플레이용 — 유실 0 보장)
export const getAllStrokes = (): InkDelta[] => yStrokes.toArray();

export const useSyncEngine = create<SyncState>((set, get) => {
  // --- 1단계: Supabase Realtime 채널 구독 ---
  const initRealtime = () => {
    if (!isSupabaseConfigured || !supabase || channel) return;

    channel = supabase.channel('omnibridge-room', {
      config: { broadcast: { self: false }, presence: { key: CLIENT_ID } },
    });

    // 원격 기기가 보낸 잉크 델타(세그먼트/삭제) 수신 → CRDT 반영 + 캔버스 렌더
    channel.on('broadcast', { event: 'stroke' }, ({ payload }) => {
      const delta = payload as InkDelta;
      yStrokes.push([delta]);
      emitRemote(delta);
      set({ relayStatus: 'synced' });
    });

    // 접속 중인 기기 수 (Omni-Live 연결 증거)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel!.presenceState();
      set({ peerCount: Object.keys(state).length });
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        set({ liveConnected: true });
        await channel!.track({ online_at: Date.now(), client: CLIENT_ID });
      }
    });
  };

  if (typeof window !== 'undefined') {
    // 다음 틱에 초기화 (스토어 생성 완료 후)
    setTimeout(initRealtime, 0);
  }

  // 오프라인 큐에 쌓인 델타를 CRDT로 병합하고 재전송
  const mergeOfflineQueue = () => {
    if (offlineQueue.length === 0) return;
    yStrokes.push([...offlineQueue]);
    if (channel && get().liveConnected) {
      offlineQueue.forEach((d) =>
        channel!.send({ type: 'broadcast', event: 'stroke', payload: d })
      );
    }
    offlineQueue = [];
    set({ offlineQueueLength: 0 });
  };

  return {
    isOnline: true,
    setOnline: (online) => {
      set({ isOnline: online });
      if (online) mergeOfflineQueue();
    },

    liveConnected: false,
    peerCount: 0,

    relayStatus: 'idle',
    driveStatus: 'idle',
    lastDriveSync: null,
    offlineQueueLength: 0,

    pushDelta: (delta) => {
      // 잉크 델타(세그먼트 또는 erase_strokes)만 동기화 대상. (그 외 이벤트는 무시)
      const d: InkDelta | null = isInkDelta(delta) ? delta : null;

      const { isOnline } = get();

      // 오프라인: 로컬 큐에 안전 격리 (Zero-Loss 세이프가드)
      if (!isOnline) {
        if (d) offlineQueue.push(d);
        set({ offlineQueueLength: offlineQueue.length });
        return;
      }

      // --- 1단계: 실시간 릴레이 ---
      set({ relayStatus: 'syncing' });

      if (d) {
        yStrokes.push([d]); // CRDT 로컬 반영 (append-only: 삭제도 이벤트로 쌓임)
        if (channel && get().liveConnected) {
          // 실제 웹소켓 broadcast (≈0.1초)
          channel.send({ type: 'broadcast', event: 'stroke', payload: d });
          set({ relayStatus: 'synced' });
        } else {
          // Supabase 미설정 → 시뮬레이션
          setTimeout(() => set({ relayStatus: 'synced' }), 100);
        }
      }
      setTimeout(() => set({ relayStatus: 'idle' }), 1500);

      // --- 2단계: Debounce Flush 예약 (5초 데드타임) ---
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => get().triggerManualFlush(), 5000);
    },

    triggerManualFlush: async () => {
      const { isOnline, driveStatus } = get();
      if (!isOnline || driveStatus === 'saving' || yStrokes.length === 0) return;

      set({ driveStatus: 'saving' });
      try {
        // CRDT 상태 전체를 .ob 자산으로 직렬화 (바이너리 Yjs 스냅샷 + 메타)
        const snapshot = Y.encodeStateAsUpdate(ydoc);
        const contents = JSON.stringify({
          timestamp: Date.now(),
          strokeCount: yStrokes.length,
          crdtSnapshot: Array.from(snapshot),
        });
        const blob = new Blob([contents], { type: 'application/json' });

        await uploadToGoogleDrive(blob, `OmniBridge_${new Date().getTime()}.ob`);

        set({ driveStatus: 'saved', lastDriveSync: '방금 전', offlineQueueLength: 0 });
        setTimeout(() => set({ driveStatus: 'idle' }), 3000);
      } catch (e: any) {
        if (e?.message !== 'No access token available for Google Drive') {
          console.error(e);
        }
        set({ driveStatus: 'error' });
        setTimeout(() => set({ driveStatus: 'idle' }), 3000);
      }
    },
  };
});
