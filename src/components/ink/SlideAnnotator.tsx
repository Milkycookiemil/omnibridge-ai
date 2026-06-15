// src/components/ink/SlideAnnotator.tsx
// A-3: 캡쳐된 슬라이드 이미지를 배경으로 깔고 그 위에 InkCanvas를 오버레이해
// A-1의 펜 도구로 즉시 필기한 뒤, 배경+잉크를 합성한 이미지를 저장한다.
import React, { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { InkCanvas, type InkCanvasHandle } from './InkCanvas';
import { PenToolbar } from './PenToolbar';
import { usePenState } from '../../hooks/usePenState';

interface SlideAnnotatorProps {
  image: string;            // 원본 슬라이드 dataURL
  onSave: (merged: string) => void;
  onClose: () => void;
}

export function SlideAnnotator({ image, onSave, onClose }: SlideAnnotatorProps) {
  const { activeType, activePen, setActiveType, updateActivePen } = usePenState('pen');
  const inkRef = useRef<InkCanvasHandle>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  // 원본 이미지 해상도를 읽어 InkCanvas 내부 해상도/종횡비를 맞춘다 (왜곡 없는 합성)
  useEffect(() => {
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth || 1280, h: img.naturalHeight || 720 });
    img.src = image;
  }, [image]);

  const handleSave = () => {
    const inkCanvas = inkRef.current?.getCanvas();
    if (!inkCanvas || !dims) { onClose(); return; }

    const out = document.createElement('canvas');
    out.width = dims.w;
    out.height = dims.h;
    const ctx = out.getContext('2d');
    if (!ctx) { onClose(); return; }

    const bg = new Image();
    bg.onload = () => {
      ctx.drawImage(bg, 0, 0, dims.w, dims.h);              // 배경 슬라이드
      ctx.drawImage(inkCanvas, 0, 0, dims.w, dims.h);        // 그 위 잉크(동일 해상도)
      onSave(out.toDataURL('image/jpeg', 0.92));
    };
    bg.src = image;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 text-white shrink-0">
        <h3 className="font-bold flex items-center gap-2">슬라이드에 필기</h3>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between mb-3 shrink-0">
        <PenToolbar
          activeType={activeType}
          activePen={activePen}
          setActiveType={setActiveType}
          updateActivePen={updateActivePen}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => inkRef.current?.clear()}
            className="px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
          >
            전체 지우기
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-bold bg-gradient-sync text-white rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> 저장
          </button>
        </div>
      </div>

      {/* Canvas area — 이미지가 박스 크기(종횡비 보존)를 결정하고 캔버스를 그 위에 오버레이 */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        {dims && (
          <div className="relative inline-block rounded-lg overflow-hidden shadow-2xl bg-white">
            <img
              src={image}
              alt="슬라이드"
              className="block max-h-[72vh] max-w-full select-none pointer-events-none"
              draggable={false}
            />
            <div className="absolute inset-0">
              <InkCanvas
                ref={inkRef}
                pen={activePen}
                width={dims.w}
                height={dims.h}
                className="w-full h-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
