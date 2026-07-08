// src/components/ink/LayerPanel.tsx
// #5: 포토샵식 레이어 패널. 위에 있는 항목 = 위 레이어(나중에 합성).
// 추가/삭제/표시 토글/활성 선택을 제공한다. 상태는 InkCanvas가 소유.
import React, { useState } from 'react';
import { Layers, Plus, Eye, EyeOff, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { InkLayer } from '../../lib/inkEngine';

interface LayerPanelProps {
  layers: InkLayer[];
  activeLayerId: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onSelect: (id: string) => void;
}

export function LayerPanel({ layers, activeLayerId, onAdd, onRemove, onToggleVisible, onSelect }: LayerPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  // 표시 순서: 위 레이어(나중에 그려지는 것)가 목록 위에 오도록 역순
  const ordered = [...layers].reverse();

  return (
    <div className="absolute top-3 right-3 z-30 w-44 bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-lg overflow-hidden text-slate-700">
      <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100 bg-slate-50/70">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <Layers className="w-3.5 h-3.5 text-violet-500" /> 레이어
          {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>
        <button
          onClick={onAdd}
          title="레이어 추가"
          className="p-1 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-44 overflow-y-auto py-1">
          {ordered.map((layer) => {
            const active = layer.id === activeLayerId;
            return (
              <div
                key={layer.id}
                onClick={() => onSelect(layer.id)}
                className={cn(
                  "px-2.5 py-1.5 flex items-center gap-2 cursor-pointer transition-colors group",
                  active ? "bg-violet-50" : "hover:bg-slate-50"
                )}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleVisible(layer.id); }}
                  title={layer.visible ? '숨기기' : '표시'}
                  className={cn("p-0.5 rounded transition-colors shrink-0",
                    layer.visible ? "text-slate-500 hover:text-slate-800" : "text-slate-300 hover:text-slate-500")}
                >
                  {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <span className={cn("flex-1 text-xs truncate select-none",
                  active ? "font-bold text-violet-700" : "font-medium text-slate-600",
                  !layer.visible && "opacity-50")}>
                  {layer.name}
                </span>
                {layers.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(layer.id); }}
                    title="레이어 삭제"
                    className="p-0.5 rounded text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
