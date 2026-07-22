// src/lib/notesStore.ts
// 노트 영속 저장소. 로컬(IndexedDB) = 오프라인 캐시, 원격(Supabase notes 테이블) = 계정별
// 클라우드 저장(진실의 원천). 1b-4b 단계에서 다음을 추가했다:
//   - 계정 스코프: 노트에 user_id를 붙여 listNotes가 "현재 로그인 계정" 노트만 반환(같은
//     브라우저에서 계정이 달라도 서로의 노트가 안 보이도록 표시 격리).
//   - 낙관적 write-through: 로컬에 먼저 저장(즉시 성공) → 백그라운드로 Supabase에 upsert.
//     실패/오프라인이면 _dirty 플래그로 남겨 두었다가 재접속·재로그인 시 재전송.
//   - LWW 머지: 로그인 시 원격을 내려받아 updated_at이 더 최신인 쪽으로 병합.
// 외부 의존성 없이 raw IndexedDB 사용. Supabase 미설정(시뮬 모드)이면 로컬만 쓴다.
import type { InkStroke } from './inkEngine';
import type { PdfPageStrokes } from './pdfInk';
import { supabase, isSupabaseConfigured } from './supabase';
import { getCurrentUser } from './auth';
import { deletePdf, deleteCaptureSlides, forgetPdfFile } from './pdfStore';

// 'pdf'/'capture'도 노트로 영속화한다. 빈/유선/옥스포드는 InkCanvas 획(strokes),
// pdf는 페이지별 획(pdfPages) + Storage의 원본 파일을 사용한다.
export type PaperStyle = 'blank' | 'ruled' | 'oxford' | 'pdf' | 'capture';

export interface NoteMeta {
  id: string;
  title: string;
  style: PaperStyle;
  pageSize?: string; // 빈 노트 페이지 크기 id(예: 'a4-p'). 없으면 구노트=1:1(800×800). pageSizes.ts 참고.
  createdAt: number;
  updatedAt: number;
  thumbnail?: string; // 대시보드 카드용 축소 미리보기 (data URL)
}

export interface Note extends NoteMeta {
  strokes: InkStroke[]; // InkCanvas의 스트로크 모델을 그대로 보관 (pdf/capture는 비어 있음)
  pdfPages?: PdfPageStrokes; // PDF 노트: 페이지별 필기. 원본 파일은 Storage(pdfStore)에 별도 저장.
  bookmarks?: number[]; // PDF 북마크 페이지(1-based). 무마이그레이션 동기화: pdf_pages jsonb에 __bm으로 임베드.
  typedText?: string; // 노트북 모드 '타이핑 복습' 텍스트. 손필기와 한 노트로 클라우드 동기화.
  transcript?: { time: string; sec: number; text: string }[]; // 녹음 전사(획↔전사 싱크 복원용)
  // ↓ 내부 필드 (소비처는 무시). IndexedDB에만 저장, NoteMeta 반환 시 제외.
  user_id?: string | null; // 소유 계정(Supabase Auth user.id). 게스트/미로그인 = null
  _dirty?: boolean; // 클라우드 업로드 대기(오프라인/실패). 성공 시 false로 정리
  deleted?: boolean; // 소프트 삭제(tombstone). 목록에서 제외되나 삭제를 기기 간 전파하려고 행은 남긴다.
  deletedAt?: number; // 삭제 시각(epoch ms)
}

const DB_NAME = 'omnibridge';
const STORE = 'notes';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

const genId = () => 'note_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const STYLE_LABEL: Record<PaperStyle, string> = {
  blank: '무선 노트',
  ruled: '유선 노트',
  oxford: '옥스포드 노트',
  pdf: 'PDF 노트',
  capture: '캡쳐 노트',
};

// ============================================================
//  계정 스코프 / 클라우드 동기화 헬퍼
// ============================================================

// 현재 로그인 계정 id. 게스트/미로그인/시뮬 모드 = null.
const currentUid = (): string | null => getCurrentUser()?.id ?? null;

// 클라우드 저장이 가능한 조건: Supabase 설정됨 + 로그인 상태.
const cloudReady = (): boolean => isSupabaseConfigured && supabase != null && currentUid() != null;

// 노트가 "현재 계정" 소유인지. 게스트(null)는 user_id 없는(레거시) 노트도 포함.
const ownedByCurrent = (n: Note): boolean => (n.user_id ?? null) === currentUid();

// Supabase notes 테이블 행(snake_case) 형태.
interface NoteRow {
  id: string;
  user_id: string;
  title: string;
  style: string;
  strokes: unknown;
  thumbnail: string | null;
  created_at: number;
  updated_at: number;
  deleted: boolean;
  deleted_at: number | null;
  pdf_pages: unknown;
  typed_text: string | null;
  transcript: unknown;
}

// 페이지 크기를 별도 마이그레이션 없이 동기화: style 텍스트 컬럼에 `style|pageSize`로 인코딩.
// (pageSize 값엔 '|'가 없으므로 fromRow에서 안전하게 분리) 없으면 순수 style만 저장.
const encodeStyle = (n: Note) => (n.pageSize ? `${n.style}|${n.pageSize}` : n.style);
const decodeStyle = (raw: string): { style: PaperStyle; pageSize?: string } => {
  const [style, pageSize] = (raw || '').split('|');
  return { style: (style as PaperStyle) || 'blank', pageSize: pageSize || undefined };
};

const toRow = (n: Note, uid: string): NoteRow => ({
  id: n.id,
  user_id: uid,
  title: n.title,
  style: encodeStyle(n),
  strokes: n.strokes,
  thumbnail: n.thumbnail ?? null,
  created_at: n.createdAt,
  updated_at: n.updatedAt,
  deleted: n.deleted ?? false,
  deleted_at: n.deletedAt ?? null,
  // 북마크는 pdf_pages jsonb에 __bm으로 함께 실어 마이그레이션 없이 동기화(숫자 키만 소비하는 쪽은 무시).
  pdf_pages: encodePdfPages(n),
  typed_text: n.typedText ?? null,
  transcript: n.transcript ?? null,
});

// pdfPages(+bookmarks) → pdf_pages 컬럼 payload. 둘 다 없으면 null.
const encodePdfPages = (n: Note): unknown => {
  const hasBm = Array.isArray(n.bookmarks) && n.bookmarks.length > 0;
  if (!n.pdfPages && !hasBm) return null;
  const payload: Record<string, unknown> = { ...(n.pdfPages ?? {}) };
  if (hasBm) payload.__bm = n.bookmarks;
  return payload;
};
// pdf_pages 컬럼 → { pdfPages, bookmarks } 분리(__bm 제거).
const decodePdfPages = (raw: unknown): { pdfPages?: PdfPageStrokes; bookmarks?: number[] } => {
  if (!raw || typeof raw !== 'object') return {};
  const { __bm, ...pages } = raw as Record<string, unknown>;
  const bookmarks = Array.isArray(__bm) ? (__bm as number[]) : undefined;
  const pdfPages = Object.keys(pages).length ? (pages as unknown as PdfPageStrokes) : undefined;
  return { pdfPages, bookmarks };
};

const fromRow = (r: NoteRow): Note => {
  const { pdfPages, bookmarks } = decodePdfPages(r.pdf_pages);
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    ...decodeStyle(r.style),
    strokes: (r.strokes as InkStroke[]) ?? [],
    pdfPages,
    bookmarks,
    typedText: r.typed_text ?? undefined,
    transcript: (r.transcript as Note['transcript']) ?? undefined,
    thumbnail: r.thumbnail ?? undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    deleted: Boolean(r.deleted),
    deletedAt: r.deleted_at != null ? Number(r.deleted_at) : undefined,
    _dirty: false,
  };
};

// 로컬 노트의 _dirty 플래그를 갱신 (업로드 성공/실패 표시).
async function markDirty(id: string, dirty: boolean): Promise<void> {
  const n = await getNote(id);
  if (!n || Boolean(n._dirty) === dirty) return;
  n._dirty = dirty;
  await run('readwrite', (s) => s.put(n));
}

// 낙관적 write-through: 로컬 저장은 이미 끝난 상태에서 원격 upsert 시도.
// 성공 시 _dirty 해제, 실패/오프라인이면 _dirty 유지(다음 sync에서 재전송).
async function pushNote(n: Note): Promise<void> {
  const uid = currentUid();
  if (!isSupabaseConfigured || !supabase || !uid) return;
  try {
    const { error } = await supabase.from('notes').upsert(toRow(n, uid), { onConflict: 'id' });
    if (error) {
      console.warn('[notesStore] 클라우드 업로드 실패(로컬은 보관됨):', error.message);
      await markDirty(n.id, true);
    } else {
      await markDirty(n.id, false);
    }
  } catch (e) {
    console.warn('[notesStore] 클라우드 업로드 예외(오프라인?):', e);
    await markDirty(n.id, true);
  }
}

// 변경 알림: 원격 pull로 로컬이 바뀌면 대시보드 등이 목록을 다시 그리도록 통지.
type ChangeCb = () => void;
const listeners = new Set<ChangeCb>();
export function onNotesChanged(cb: ChangeCb): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function emitChange() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* 리스너 오류는 무시 */
    }
  });
}

// 로그인 직후/재접속 시 호출: 원격과 로컬을 LWW(updated_at 최신 우선)로 병합.
//  1) 오프라인 동안 쌓인 _dirty 로컬 노트 업로드
//  2) 원격을 내려받아 더 최신이면 로컬 갱신
//  3) 원격에 없거나 로컬이 더 최신이면 업로드
// 반환: 실제 동기화를 수행했으면 true.
export async function syncNotesFromCloud(): Promise<boolean> {
  if (!cloudReady()) return false;
  const uid = currentUid()!;

  // 0) 게스트→로그인 이관: 이 브라우저에서 게스트(user_id null)로 만든 노트를 현재
  //    로그인 계정으로 귀속시킨다. 이후 dirty 업로드/pull에 자연히 포함된다.
  let localAll = await run<Note[]>('readonly', (s) => s.getAll());
  const guestNotes = localAll.filter((n) => (n.user_id ?? null) === null);
  if (guestNotes.length > 0) {
    for (const n of guestNotes) {
      n.user_id = uid;
      n._dirty = true;
      await run('readwrite', (s) => s.put(n));
    }
    localAll = await run<Note[]>('readonly', (s) => s.getAll());
    emitChange(); // 대시보드가 이관된 노트를 즉시 표시
  }

  const mine = localAll.filter((n) => (n.user_id ?? null) === uid);

  // 1) dirty 로컬 우선 업로드
  for (const n of mine) {
    if (n._dirty) await pushNote(n);
  }

  // 2) 원격 내려받기 (RLS가 계정별로 걸러주지만 명시적으로도 필터)
  const { data, error } = await supabase!.from('notes').select('*').eq('user_id', uid);
  if (error) {
    console.warn('[notesStore] 클라우드 조회 실패:', error.message);
    return false;
  }
  const rows = (data ?? []) as NoteRow[];

  let changed = false;
  const localById = new Map(mine.map((n) => [n.id, n] as const));
  for (const row of rows) {
    const local = localById.get(row.id);
    if (!local || Number(row.updated_at) > local.updatedAt) {
      await run('readwrite', (s) => s.put(fromRow(row)));
      changed = true;
    }
  }

  // 3) 로컬이 더 최신이거나 원격에 없는 노트 업로드
  const remoteById = new Map(rows.map((r) => [r.id, r] as const));
  for (const n of mine) {
    const r = remoteById.get(n.id);
    if (!r || n.updatedAt > Number(r.updated_at)) await pushNote(n);
  }

  if (changed) emitChange();
  return true;
}

// 브라우저가 온라인으로 복귀하면 쌓인 변경을 자동 재전송.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void syncNotesFromCloud();
  });
}

// ============================================================
//  CRUD (로컬 우선 + 백그라운드 클라우드 write-through)
// ============================================================

// 최신 수정순 메타 목록 (현재 계정 소유만, 무거운 strokes 제외).
export async function listNotes(): Promise<NoteMeta[]> {
  const all = await run<Note[]>('readonly', (s) => s.getAll());
  return all
    .filter((n) => ownedByCurrent(n) && !n.deleted) // 소프트 삭제된 노트는 목록에서 제외
    .map((n) => ({
      id: n.id,
      title: n.title,
      style: n.style,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      thumbnail: n.thumbnail,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getNote(id: string): Promise<Note | undefined> {
  return run<Note | undefined>('readonly', (s) => s.get(id));
}

export async function createNote(style: PaperStyle, title?: string, pageSize?: string): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    id: genId(),
    title: title || `${STYLE_LABEL[style]} ${new Date(now).toLocaleDateString('ko-KR')}`,
    style,
    pageSize,
    createdAt: now,
    updatedAt: now,
    strokes: [],
    user_id: currentUid(),
    _dirty: true,
  };
  await run('readwrite', (s) => s.put(note));
  void pushNote(note); // 백그라운드 업로드 (실패해도 로컬은 보관 + 재시도)
  return note;
}

// 외부 파일(.ob)에서 가져온 노트를 새 노트로 저장. id는 새로 발급(덮어쓰기 방지),
// 소유는 현재 계정, updatedAt=now로 최신화 → write-through로 클라우드에도 올라간다.
export async function importNote(data: {
  title?: string;
  style?: PaperStyle;
  strokes?: InkStroke[];
  createdAt?: number;
  thumbnail?: string;
}): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    id: genId(),
    title: data.title || '가져온 노트',
    style: data.style || 'blank',
    createdAt: data.createdAt || now,
    updatedAt: now,
    strokes: Array.isArray(data.strokes) ? data.strokes : [],
    thumbnail: data.thumbnail,
    user_id: currentUid(),
    _dirty: true,
  };
  await run('readwrite', (s) => s.put(note));
  void pushNote(note);
  emitChange();
  return note;
}

export async function saveNoteStrokes(
  id: string,
  strokes: InkStroke[],
  thumbnail?: string
): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  note.strokes = strokes;
  note.updatedAt = Date.now();
  if (thumbnail) note.thumbnail = thumbnail;
  note._dirty = true;
  await run('readwrite', (s) => s.put(note));
  void pushNote(note);
}

// PDF 노트: 페이지별 필기 저장 (원본 파일은 pdfStore가 Storage에 별도 저장).
export async function saveNotePdfPages(
  id: string,
  pdfPages: PdfPageStrokes,
  thumbnail?: string
): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  note.pdfPages = pdfPages;
  note.updatedAt = Date.now();
  if (thumbnail) note.thumbnail = thumbnail;
  note._dirty = true;
  await run('readwrite', (s) => s.put(note));
  void pushNote(note);
}

// PDF 북마크 저장 → 로컬(IndexedDB) + pdf_pages jsonb에 임베드돼 클라우드 동기화(LWW).
export async function saveNoteBookmarks(id: string, bookmarks: number[]): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  note.bookmarks = bookmarks;
  note.updatedAt = Date.now();
  note._dirty = true;
  await run('readwrite', (s) => s.put(note));
  void pushNote(note);
}

// 노트북 '타이핑 복습' 텍스트 저장 → 손필기와 한 노트로 클라우드 동기화(LWW).
export async function saveNoteTypedText(id: string, typedText: string): Promise<void> {
  const note = await getNote(id);
  if (!note || note.typedText === typedText) return;
  note.typedText = typedText;
  note.updatedAt = Date.now();
  note._dirty = true;
  await run('readwrite', (s) => s.put(note));
  void pushNote(note);
}

// 녹음 전사 저장 → 노트 재방문·크로스디바이스에서도 획↔전사 싱크가 동작하도록 영속화.
export async function saveNoteTranscript(id: string, transcript: Note['transcript']): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  note.transcript = transcript;
  note.updatedAt = Date.now();
  note._dirty = true;
  await run('readwrite', (s) => s.put(note));
  void pushNote(note);
}

// 노트 썸네일만 갱신(대시보드 카드용). 캡쳐 노트 등에서 사용.
export async function saveNoteThumbnail(id: string, thumbnail: string): Promise<void> {
  const note = await getNote(id);
  if (!note || note.thumbnail === thumbnail) return;
  note.thumbnail = thumbnail;
  note.updatedAt = Date.now();
  note._dirty = true;
  await run('readwrite', (s) => s.put(note));
  void pushNote(note);
}

export async function renameNote(id: string, title: string): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  note.title = title;
  note.updatedAt = Date.now();
  note._dirty = true;
  await run('readwrite', (s) => s.put(note));
  void pushNote(note);
}

// 소프트 삭제(tombstone). 행을 지우지 않고 deleted 플래그를 세워 두면, 삭제가 하나의
// 일반 LWW(updated_at) 갱신이 되어 기기 간에 자동 전파된다(다른 기기가 pull 시 deleted를
// 받아 목록에서 제외). 하드 삭제 때 생기던 "다른 기기에서 되살아남" 문제를 없앤다.
export async function deleteNote(id: string): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  const now = Date.now();
  note.deleted = true;
  note.deletedAt = now;
  note.updatedAt = now; // 삭제가 최신 변경이 되도록(LWW로 전파)
  note.strokes = []; // 용량 절약: tombstone은 획을 보관할 필요 없음
  note.pdfPages = undefined;
  note.thumbnail = undefined;
  note._dirty = true;
  await run('readwrite', (s) => s.put(note));
  void pushNote(note);
  // Storage에 둔 원본 파일도 정리 (best-effort). 파일 없으면 무해.
  if (note.style === 'pdf') { void deletePdf(id); forgetPdfFile(id); }
  if (note.style === 'capture') void deleteCaptureSlides(id);
}
