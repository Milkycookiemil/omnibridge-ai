// src/lib/pdfStore.ts
// PDF/캡쳐 노트의 "원본 파일"을 Supabase Storage(note-files 버킷)에 저장/복원한다.
// 필기(획)는 notes 테이블(jsonb)에 저장하고, 무거운 원본 파일만 여기서 다룬다.
//  - 경로: <user_id>/<noteId>.pdf  (Storage 정책이 첫 폴더=user_id로 계정 격리)
//  - 무료 한도: 파일당 MAX_FILE_BYTES, 계정 총합 MAX_ACCOUNT_BYTES 초과 시 QuotaError.
//    (클라이언트 상한 — 초기 방어선. 엄격 강제는 후속으로 서버측 검증 추가 가능)
import { supabase, isSupabaseConfigured } from './supabase';
import { getCurrentUser } from './auth';

const BUCKET = 'note-files';

// 무료 한도 (조정하려면 이 두 상수만 바꾸면 됨)
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 파일당 10MB
export const MAX_ACCOUNT_BYTES = 50 * 1024 * 1024; // 계정당 총 50MB

const uid = (): string | null => getCurrentUser()?.id ?? null;

// 파일 저장이 가능한 조건: Supabase 설정됨 + 로그인 상태.
export const isFileStoreReady = (): boolean =>
  isSupabaseConfigured && supabase != null && uid() != null;

// 방금 고른 PDF File을 세션 메모리에 잠시 보관한다.
// App은 noteId가 있으면 WorkspaceView로 라우팅하는데, WorkspaceView가 navContext.file을
// 떨어뜨려서 LiveNoteView가 원본 파일을 못 받는다. 게스트(Storage 없음)는 여기서 PDF가
// 영영 안 뜬다. 이 캐시로 최초 렌더에서 원본을 즉시 쓰게 하고(게스트 포함), 로그인
// 사용자의 불필요한 Storage 재다운로드도 아낀다. 노트 삭제 시 forgetPdfFile로 정리한다.
const recentPdfFiles = new Map<string, File>();
export const stashPdfFile = (noteId: string, file: File): void => { recentPdfFiles.set(noteId, file); };
export const takePdfFile = (noteId: string): File | undefined => recentPdfFiles.get(noteId);
export const forgetPdfFile = (noteId: string): void => { recentPdfFiles.delete(noteId); };

// ── 원본 로컬 영속 (IndexedDB) ─────────────────────────────────────
// 위 메모리 캐시는 새로고침·탭 재생성에 사라지고, Storage 다운로드는 Supabase+로그인이 필요하다.
// 그래서 게스트/오프라인/시뮬레이션 모드에선 PDF 노트를 다시 열 때 원본을 어디서도 못 찾아
// "PDF 로딩 중…"에서 멈췄다. 원본을 로컬에 영속해 재방문에도 항상 복원되게 한다.
// notes DB(version 1) 스키마를 건드리지 않으려고 별도 DB를 쓴다.
const FILE_DB = 'omnibridge-files';
const FILE_STORE = 'pdf';

function openFileDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 실패해도 앱이 죽지 않도록 항상 null로 흡수한다(저장소 미지원·용량초과 등).
async function fileTx(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<unknown> {
  try {
    const db = await openFileDb();
    return await new Promise<unknown>((resolve) => {
      const tx = db.transaction(FILE_STORE, mode);
      const req = fn(tx.objectStore(FILE_STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export const savePdfLocal = (noteId: string, file: Blob): Promise<unknown> =>
  fileTx('readwrite', (s) => s.put(file, noteId));
export const loadPdfLocal = async (noteId: string): Promise<Blob | null> => {
  const v = await fileTx('readonly', (s) => s.get(noteId));
  return v instanceof Blob ? v : null;
};
export const deletePdfLocal = (noteId: string): Promise<unknown> =>
  fileTx('readwrite', (s) => s.delete(noteId));

const pdfPath = (u: string, noteId: string) => `${u}/${noteId}.pdf`;

// 계정 저장 여유가 없을 때 던지는 에러 (UI가 안내 문구로 구분해 처리).
export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaError';
  }
}

// 현재 계정이 note-files에 쓰고 있는 총 바이트. 업로드 전 한도 체크에 사용.
export async function getAccountUsage(): Promise<number> {
  const u = uid();
  if (!supabase || !u) return 0;
  const { data, error } = await supabase.storage.from(BUCKET).list(u, { limit: 1000 });
  if (error || !data) return 0;
  return data.reduce((sum, f) => sum + ((f.metadata?.size as number) ?? 0), 0);
}

const mb = (b: number) => Math.round(b / 1024 / 1024);

// PDF 원본 업로드. 파일당/계정당 한도 초과 시 QuotaError. 반환: storage 경로.
// PDF는 노트 생성 시 1회만 업로드되고(필기는 notes 테이블), 이후 편집은 필기만 바뀐다.
export async function uploadPdf(noteId: string, file: Blob): Promise<string> {
  const u = uid();
  if (!isSupabaseConfigured || !supabase || !u) throw new Error('로그인이 필요합니다.');
  if (file.size > MAX_FILE_BYTES)
    throw new QuotaError(`PDF 파일이 너무 큽니다. 무료는 파일당 최대 ${mb(MAX_FILE_BYTES)}MB까지예요.`);
  const usage = await getAccountUsage();
  if (usage + file.size > MAX_ACCOUNT_BYTES)
    throw new QuotaError(
      `저장 공간이 부족해요. 무료는 계정당 총 ${mb(MAX_ACCOUNT_BYTES)}MB까지입니다. (현재 ${mb(usage)}MB 사용 중)`
    );
  const path = pdfPath(u, noteId);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: 'application/pdf' });
  if (error) throw error;
  return path;
}

// PDF 원본 다운로드 → Blob (다시 열 때 자동 복원용). 없거나 실패 시 null.
export async function downloadPdf(noteId: string): Promise<Blob | null> {
  const u = uid();
  if (!supabase || !u) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(pdfPath(u, noteId));
  if (error) {
    console.warn('[pdfStore] PDF 다운로드 실패:', error.message);
    return null;
  }
  return data;
}

// 노트 삭제 시 원본 파일도 정리 (best-effort).
export async function deletePdf(noteId: string): Promise<void> {
  const u = uid();
  if (!supabase || !u) return;
  const { error } = await supabase.storage.from(BUCKET).remove([pdfPath(u, noteId)]);
  if (error) console.warn('[pdfStore] PDF 삭제 실패:', error.message);
}

// ============================================================
//  캡쳐 노트: 슬라이드 목록(각 슬라이드 = 배경+잉크 합성 이미지 data URL)을
//  하나의 JSON 파일로 Storage에 저장한다. (필기는 이미지에 구워져 있어 이미지만 보관)
// ============================================================
export interface CaptureSlide {
  id: string;
  imgData: string; // data URL (배경+잉크 합성 JPEG)
  timestamp: string;
}

const capturePath = (u: string, noteId: string) => `${u}/${noteId}_capture.json`;

// 캡쳐 슬라이드 목록 업로드(덮어쓰기). 용량 초과 시 QuotaError.
export async function uploadCaptureSlides(noteId: string, slides: CaptureSlide[]): Promise<void> {
  const u = uid();
  if (!isSupabaseConfigured || !supabase || !u) throw new Error('로그인이 필요합니다.');
  const blob = new Blob([JSON.stringify(slides)], { type: 'application/json' });
  if (blob.size > MAX_FILE_BYTES)
    throw new QuotaError(`캡쳐 용량이 너무 큽니다. 무료는 노트당 최대 ${mb(MAX_FILE_BYTES)}MB까지예요.`);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(capturePath(u, noteId), blob, { upsert: true, contentType: 'application/json' });
  if (error) throw error;
}

// 캡쳐 슬라이드 목록 다운로드(재열기 복원용). 없거나 실패 시 null.
export async function downloadCaptureSlides(noteId: string): Promise<CaptureSlide[] | null> {
  const u = uid();
  if (!supabase || !u) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(capturePath(u, noteId));
  if (error) return null;
  try {
    return JSON.parse(await data.text()) as CaptureSlide[];
  } catch {
    return null;
  }
}

// 노트 삭제 시 캡쳐 파일 정리 (best-effort).
export async function deleteCaptureSlides(noteId: string): Promise<void> {
  const u = uid();
  if (!supabase || !u) return;
  await supabase.storage.from(BUCKET).remove([capturePath(u, noteId)]);
}
