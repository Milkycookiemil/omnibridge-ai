// src/components/RecordSourcePopover.tsx
// 녹음 버튼 옆 작은 톱니 버튼 → 전사 소스(마이크/시스템/둘 다)와 마이크 장치 선택 팝오버.
// 선택은 preferences에 영속되어 빠른 녹음·노트·PDF 녹음이 모두 같은 설정을 쓴다.
import React, { useEffect, useRef, useState } from 'react';
import { Settings2, Check } from 'lucide-react';
import { usePreferences, type AudioSource } from '../lib/preferences';
import { listMicDevices } from '../lib/audioCapture';
import { cn } from '../lib/utils';

const SOURCES: { id: AudioSource; label: string; desc: string }[] = [
  { id: 'mic', label: '마이크', desc: '내 목소리·주변 소리' },
  { id: 'system', label: '시스템 소리', desc: '인강·줌 (화면공유로 캡처)' },
  { id: 'both', label: '마이크 + 시스템', desc: '내 말 + PC 소리 함께' },
];

export function RecordSourcePopover({ disabled }: { disabled?: boolean }) {
  const { audioSource, micDeviceId, setAudioSource, setMicDeviceId } = usePreferences();
  const [open, setOpen] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void listMicDevices().then(setMics);
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title="녹음 소스 · 마이크 선택"
        className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Settings2 className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3 text-slate-700">
          <div className="text-xs font-bold text-slate-400 px-1 mb-1.5">전사 소스</div>
          <div className="space-y-0.5">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setAudioSource(s.id)}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-lg flex items-start gap-2 transition-colors',
                  audioSource === s.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50',
                )}
              >
                <span className="w-4 shrink-0 mt-0.5">{audioSource === s.id && <Check className="w-4 h-4" />}</span>
                <span>
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-[11px] text-slate-400">{s.desc}</span>
                </span>
              </button>
            ))}
          </div>

          {audioSource !== 'system' && (
            <div className="mt-3">
              <div className="text-xs font-bold text-slate-400 px-1 mb-1.5">마이크 장치</div>
              <select
                value={micDeviceId ?? ''}
                onChange={(e) => setMicDeviceId(e.target.value || null)}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">기본 마이크</option>
                {mics.map((m, i) => (
                  <option key={m.deviceId || i} value={m.deviceId}>
                    {m.label || `마이크 ${i + 1}`}
                  </option>
                ))}
              </select>
              {mics.length === 0 && (
                <p className="text-[11px] text-slate-400 mt-1 px-1">마이크 권한을 한 번 허용하면 장치 목록이 표시됩니다.</p>
              )}
            </div>
          )}

          {audioSource !== 'mic' && (
            <p className="text-[11px] text-amber-600 mt-2.5 px-1 leading-relaxed">
              시스템 소리는 녹음 시작 시 뜨는 <b>화면 공유 창에서 "오디오 공유"를 체크</b>해야 캡처됩니다. (탭 인강은 그 탭을, 줌·PC 프로그램은 "전체 화면 + 시스템 오디오"를 공유)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
