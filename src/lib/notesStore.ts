// src/lib/notesStore.ts
// 노트 로컬 영속 저장소 (IndexedDB). 1a 단계: 손필기(잉크) 중심 노트를
// 기기 로컬에 실제로 저장한다. 1b에서 이 저장소가 Supabase 동기화의
// 오프라인 캐시 역할로 확장된다. 외부 의존성 없이 raw IndexedDB 사용.
import type { InkStroke } from './inkEngine';

export type PaperStyle = 'blank' | 'ruled' | 'oxford';

export interface NoteMeta {
  id: string;
  title: string;
  style: PaperStyle;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string; // 대시보드 카드용 축소 미리보기 (data URL)
}

export interface Note extends NoteMeta {
  strokes: InkStroke[]; // InkCanvas의 스트로크 모델을 그대로 보관
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
};

// 최신 수정순 메타 목록 (무거운 strokes는 제외해서 반환)
export async function listNotes(): Promise<NoteMeta[]> {
  const all = await run<Note[]>('readonly', (s) => s.getAll());
  return all
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

export async function createNote(style: PaperStyle, title?: string): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    id: genId(),
    title: title || `${STYLE_LABEL[style]} ${new Date(now).toLocaleDateString('ko-KR')}`,
    style,
    createdAt: now,
    updatedAt: now,
    strokes: [],
  };
  await run('readwrite', (s) => s.put(note));
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
  await run('readwrite', (s) => s.put(note));
}

export async function renameNote(id: string, title: string): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  note.title = title;
  note.updatedAt = Date.now();
  await run('readwrite', (s) => s.put(note));
}

export async function deleteNote(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}
