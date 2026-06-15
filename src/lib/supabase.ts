// src/lib/supabase.ts
// Supabase Realtime 클라이언트. 환경변수(.env.local)가 있으면 실제 동기화,
// 없으면 null을 반환해 syncEngine이 시뮬레이션 모드로 자동 폴백한다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      realtime: { params: { eventsPerSecond: 40 } },
      auth: { persistSession: false },
    })
  : null;

// 같은 기기(탭)가 자신이 보낸 스트로크를 다시 그리지 않도록 식별하는 클라이언트 ID.
export const CLIENT_ID =
  Math.random().toString(36).slice(2) + Date.now().toString(36);
