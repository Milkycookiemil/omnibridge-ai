import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 세션을 브라우저 로컬에 영속화 → 한 번 로그인하면 새로고침/재방문에도 자동 로그인.
// (웹 SDK 기본값도 local이지만 명시적으로 보장한다.)
setPersistence(auth, browserLocalPersistence).catch((e) =>
  console.warn('auth persistence 설정 실패:', e)
);

const provider = new GoogleAuthProvider();
// Request Workspace scopes (BYOS: 사용자 본인 Drive 저장용)
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');

// Drive 접근 토큰(OAuth)은 메모리에만 캐시한다. 새로고침하면 사라지므로
// 실제 저장이 필요한 시점에 없으면 재요청한다. 신원(로그인)과는 분리됐다.
let cachedAccessToken: string | null = null;

// Firebase 인증 에러 코드를 한국어 안내 문구로 변환.
export const authErrorMessage = (code?: string): string => {
  switch (code) {
    case 'auth/invalid-email':
      return '이메일 형식이 올바르지 않습니다.';
    case 'auth/user-disabled':
      return '비활성화된 계정입니다.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    case 'auth/email-already-in-use':
      return '이미 가입된 이메일입니다. 로그인해 주세요.';
    case 'auth/weak-password':
      return '비밀번호는 6자 이상이어야 합니다.';
    case 'auth/operation-not-allowed':
      return '이메일/비밀번호 로그인이 아직 활성화되지 않았습니다. (Firebase 콘솔 → Authentication → Sign-in method에서 설정 필요)';
    case 'auth/configuration-not-found':
      return 'Firebase 인증이 아직 초기화되지 않았습니다. (Firebase 콘솔 → Authentication → 시작하기 필요)';
    case 'auth/popup-blocked':
    case 'auth/cancelled-popup-request':
      return '';
    default:
      return '인증 중 문제가 발생했습니다. 다시 시도해 주세요.';
  }
};

// 앱 로드 시 1회 호출. 리다이렉트 복귀 결과를 흡수하고, 인증 상태를 구독한다.
// user가 있으면(구글이든 이메일이든) onAuthSuccess가 호출된다.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken ?? '');
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// 구글 로그인 — 팝업 방식. (실 브라우저의 사용자 클릭에서 팝업은 차단되지 않으며,
// localhost ↔ firebaseapp.com 교차 도메인 저장소 차단으로 리다이렉트가 실패하는 문제를 피한다.)
// Drive 접근 토큰을 즉시 회수해 캐시한다 → BYOS(내 Drive 노트 접근)에 사용.
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) cachedAccessToken = credential.accessToken;
  return { user: result.user, accessToken: cachedAccessToken ?? '' };
};

// 이메일/비밀번호 로그인.
export const emailSignIn = async (email: string, password: string): Promise<User> => {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
};

// 이메일/비밀번호 회원가입.
export const emailSignUp = async (email: string, password: string): Promise<User> => {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
};

export const getCurrentUser = (): User | null => auth.currentUser;

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
