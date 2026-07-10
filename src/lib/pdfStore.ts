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
