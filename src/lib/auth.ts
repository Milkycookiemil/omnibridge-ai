// src/lib/auth.ts
// 인증 = Supabase Auth (이메일/비밀번호). 세션은 supabase 클라이언트가 브라우저에
// 유지하므로 새로고침/재방문 시 자동 로그인된다. RLS는 auth.uid()(=세션 user.id)로
// 계정별 격리한다. (구글 로그인/Drive 연동은 이후 단계에서 추가)
import { supabase, isSupabaseConfigured } from './supabase';
import type { User } from '@supabase/supabase-js';

// 현재 로그인 사용자 캐시 (onAuthStateChange로 갱신)
let currentUser: User | null = null;

// 로그인 사용자 변경 구독. listNotes 등 "현재 계정"에 의존하는 화면이, 앱 로드 직후
// 세션이 뒤늦게 확정되거나 계정이 바뀔 때 다시 조회하도록 통지한다.
type UserCb = (user: User | null) => void;
const userListeners = new Set<UserCb>();
export function onUserChange(cb: UserCb): () => void {
  userListeners.add(cb);
  return () => {
    userListeners.delete(cb);
  };
}

// Supabase 인증 에러 → 한국어 안내 문구.
export const authErrorMessage = (err?: any): string => {
  const code = typeof err === 'string' ? err : err?.code;
  const msg = (typeof err === 'string' ? '' : err?.message ?? '').toLowerCase();

  switch (code) {
    case 'invalid_credentials':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    case 'user_already_exists':
    case 'email_exists':
      return '이미 가입된 이메일입니다. 로그인해 주세요.';
    case 'weak_password':
      return '비밀번호는 6자 이상이어야 합니다.';
    case 'email_not_confirmed':
      return '이메일 확인이 필요합니다. 메일의 링크를 클릭한 뒤 로그인해 주세요.';
    case 'email_not_confirmed_signup':
      return typeof err === 'object' && err?.message ? err.message : '확인 메일을 보냈습니다.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
    case 'validation_failed':
      return '입력값을 확인해 주세요.';
  }

  // 코드가 없을 때 메시지 기반 폴백
  if (msg.includes('invalid login')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (msg.includes('already registered') || msg.includes('already been registered'))
    return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (msg.includes('password should be at least')) return '비밀번호는 6자 이상이어야 합니다.';
  if (msg.includes('email not confirmed')) return '이메일 확인이 필요합니다. 메일의 링크를 클릭한 뒤 로그인해 주세요.';
  if (!isSupabaseConfigured) return 'Supabase 키가 설정되지 않았습니다. (.env.local 확인)';
  return '인증 중 문제가 발생했습니다. 다시 시도해 주세요.';
};

// 앱 로드 시 1회 호출. 현재 세션을 즉시 반영하고, 이후 로그인/로그아웃을 구독한다.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (!supabase) {
    onAuthFailure?.();
    return () => {};
  }
  // onAuthStateChange는 로드 직후 INITIAL_SESSION 이벤트로 현재 세션을 전달한다.
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    // 계정에 의존하는 화면들에 사용자 확정/변경을 통지 (목록 재조회 트리거)
    userListeners.forEach((cb) => {
      try {
        cb(currentUser);
      } catch {
        /* 리스너 오류 무시 */
      }
    });
    if (session?.user) {
      onAuthSuccess?.(session.user, session.access_token ?? '');
    } else {
      onAuthFailure?.();
    }
  });
  return () => data.subscription.unsubscribe();
};

// 이메일/비밀번호 회원가입. Confirm email이 켜져 있으면 세션이 없이 확인 메일이 발송된다.
export const emailSignUp = async (email: string, password: string): Promise<User | null> => {
  if (!supabase) throw new Error('supabase 미설정');
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  if (!data.session) {
    // 확인 메일 모드 → 자동 로그인 안 됨. LoginView가 안내하도록 특수 에러로 알림.
    throw {
      code: 'email_not_confirmed_signup',
      message: '확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요. (또는 Supabase에서 Confirm email 끄기)',
    };
  }
  return data.user;
};

// 이메일/비밀번호 로그인.
export const emailSignIn = async (email: string, password: string): Promise<User | null> => {
  if (!supabase) throw new Error('supabase 미설정');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data.user;
};

export const getCurrentUser = (): User | null => currentUser;

// ============================================================
//  Google Drive 토큰 (1c 선택적 내보내기)
//  신원(로그인)은 Supabase Auth가 담당하고, Drive 접근 토큰만 Google Identity
//  Services 토큰 클라이언트(팝업)로 필요할 때 온디맨드로 받는다. drive.file 스코프라
//  이 앱이 만든 파일에만 접근 → 민감 스코프가 아니라 앱 심사 없이도 동작한다.
// ============================================================
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// 클라이언트 ID가 있어야 Drive 내보내기 UI를 노출한다.
export const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID);

let driveToken: string | null = null;
let gisPromise: Promise<void> | null = null;

// Google Identity Services 스크립트를 1회 지연 로드.
function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google 스크립트 로드 실패'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

// Drive 접근 토큰을 팝업으로 요청. 성공 시 토큰을 캐시하고 반환.
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!GOOGLE_CLIENT_ID) return null;
  await loadGis();
  const google = (window as any).google;
  return new Promise((resolve, reject) => {
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (resp: any) => {
          if (resp?.access_token) {
            driveToken = resp.access_token;
            resolve({ user: currentUser as User, accessToken: resp.access_token });
          } else {
            reject(new Error(resp?.error || 'Drive 토큰을 받지 못했습니다.'));
          }
        },
      });
      client.requestAccessToken();
    } catch (e) {
      reject(e);
    }
  });
};

// 캐시된 Drive 토큰 반환. 없으면(미연결) null. 만료/최초에는 googleSignIn으로 재취득.
export const getAccessToken = async (): Promise<string | null> => driveToken;

// Drive 연결 해제(토큰 폐기). 신원 로그아웃과 별개.
export const googleDisconnect = () => {
  driveToken = null;
};

export const logout = async () => {
  if (supabase) await supabase.auth.signOut();
  currentUser = null;
};
