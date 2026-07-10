// src/lib/pdfInk.ts
// PDF 노트의 페이지별 필기(잉크) 자료형. PdfAdvancedRenderer와 notesStore가 함께 쓴다.
// 좌표는 비율(0~1)로 저장해 화면 크기·확대율과 무관하게 복원된다.
import type { PenType } from './inkEngine';

export interface InkPoint {
  x: number;
  y: number;
} // ratio 0~1

export interface PageInkSeg {
  from: InkPoint;
  to: InkPoint;
  width: number; // 내부 해상도 px
}

export interface PageStroke {
  penType: PenType;
  color: string;
  opacity: number;
  segs: PageInkSeg[];
}

// 페이지 번호(1-base) → 그 페이지의 스트로크 목록. 노트에 이 형태로 저장한다.
export type PdfPageStrokes = Record<number, PageStroke[]>;
