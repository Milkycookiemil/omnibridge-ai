// src/lib/exporter.ts
// 1c: 노트 내보내기/가져오기.
//  - 로컬 파일: 노트를 `.ob`(JSON) 파일로 브라우저에서 다운로드 / 파일을 골라 가져오기.
//    BYOS(내 저장소) 철학 — 사용자가 자기 데이터를 자유롭게 들고 나갈 수 있게 한다.
//  - Google Drive: 같은 `.ob` blob을 내 구글 드라이브에 업로드(선택). Google OAuth
//    토큰(drive.file 스코프)이 있을 때만 동작하며, 없으면 isGoogleConfigured=false.
import { getNote, listNotes, importNote, type Note, type PaperStyle } from './notesStore';
import type { InkStroke } from './inkEngine';
import { uploadToGoogleDrive } from './drive';

const OB_FORMAT = 'omnibridge-note';
const OB_VERSION = 1;

interface ExportedNote {
  id: string;
  title: string;
  style: PaperStyle;
  strokes: InkStroke[];
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

interface ObFile {
  format: string;
  version: number;
  exportedAt: number;
  notes: ExportedNote[];
}

const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'note';

const toExported = (n: Note): ExportedNote => ({
  id: n.id,
  title: n.title,
  style: n.style,
  strokes: n.strokes,
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
  thumbnail: n.thumbnail,
});

function toObBlob(notes: ExportedNote[]): Blob {
  const payload: ObFile = { format: OB_FORMAT, version: OB_VERSION, exportedAt: Date.now(), notes };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 단일 노트를 `.ob` 파일로 다운로드.
export async function exportNoteToFile(noteId: string): Promise<void> {
  const note = await getNote(noteId);
  if (!note) throw new Error('노트를 찾을 수 없습니다.');
  triggerDownload(toObBlob([toExported(note)]), `${sanitize(note.title)}.ob`);
}

// 현재 계정의 모든 노트를 하나의 `.ob` 번들로 다운로드. 반환: 내보낸 노트 수.
export async function exportAllNotesToFile(): Promise<number> {
  const metas = await listNotes();
  const full = await Promise.all(metas.map((m) => getNote(m.id)));
  const notes = full.filter((n): n is Note => Boolean(n)).map(toExported);
  if (notes.length === 0) return 0;
  triggerDownload(toObBlob(notes), `OmniBridge_노트_${new Date().toISOString().slice(0, 10)}.ob`);
  return notes.length;
}

// `.ob`(또는 과거 형식) 파일을 파싱해 노트로 가져온다. 반환: 새로 만든 노트들.
export async function importNotesFromFile(file: File): Promise<Note[]> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('올바른 .ob 파일이 아닙니다. (JSON 형식 아님)');
  }

  // 허용 형식: {format, notes:[...]} / 노트 배열 / 단일 노트 객체
  const p = parsed as any;
  const list: ExportedNote[] = Array.isArray(p?.notes)
    ? p.notes
    : Array.isArray(p)
    ? p
    : p && typeof p === 'object' && (p.strokes || p.title)
    ? [p]
    : [];

  if (list.length === 0) throw new Error('파일에서 가져올 노트를 찾지 못했습니다.');

  const created: Note[] = [];
  for (const n of list) {
    created.push(
      await importNote({
        title: n.title || '가져온 노트',
        style: (n.style as PaperStyle) || 'blank',
        strokes: Array.isArray(n.strokes) ? n.strokes : [],
        createdAt: n.createdAt,
        thumbnail: n.thumbnail,
      })
    );
  }
  return created;
}

// 단일 노트를 Google Drive에 `.ob`로 업로드(선택). Google 토큰이 없으면 예외.
// 반환: 생성된 Drive 파일 id.
export async function exportNoteToDrive(noteId: string): Promise<string> {
  const note = await getNote(noteId);
  if (!note) throw new Error('노트를 찾을 수 없습니다.');
  const blob = toObBlob([toExported(note)]);
  return uploadToGoogleDrive(blob, `${sanitize(note.title)}.ob`);
}
