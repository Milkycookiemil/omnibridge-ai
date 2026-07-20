// src/components/ink/PenTip.tsx
// 펜 종류별 "실사풍" 펜촉 일러스트(SVG). 삼성 노트처럼 팝오버 헤더에서 종류를 고를 때
// 납작 아이콘 대신 진짜 펜촉 모양을 보여준다. color를 받아 잉크가 나오는 부분을 물들인다.
import React from 'react';
import type { PenType } from '../../lib/inkEngine';

// 세로 펜촉(만년필/펜/연필/브러쉬/형광펜/지우개). viewBox 40x104, 촉이 위를 향한다.
export function PenTip({ type, color, className }: { type: PenType; color: string; className?: string }) {
  return (
    <svg viewBox="0 0 40 104" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {type === 'pen' && (
        <>
          {/* 볼펜: 흰 배럴 + 원뿔 팁 + 잉크색 볼 */}
          <rect x="12" y="34" width="16" height="66" rx="4" fill="#f8fafc" stroke="#e2e8f0" />
          <path d="M14 36 L20 6 L26 36 Z" fill="#e2e8f0" />
          <path d="M16 34 L20 12 L24 34 Z" fill={color} />
          <circle cx="20" cy="10" r="3" fill={color} />
        </>
      )}
      {type === 'pencil' && (
        <>
          {/* 연필: 나무 육각 배럴 + 깎인 원뿔 + 흑연심 */}
          <rect x="12" y="40" width="16" height="60" rx="2" fill="#fcd34d" stroke="#eab308" />
          <path d="M12 40 L20 8 L28 40 Z" fill="#f5deb3" stroke="#d6b370" />
          <path d="M16.5 22 L20 8 L23.5 22 Z" fill="#334155" />
          <circle cx="20" cy="11" r="2" fill={color} />
        </>
      )}
      {type === 'brush' && (
        <>
          {/* 브러쉬: 배럴 + 금속 페룰 + 잉크색 붓끝 */}
          <rect x="12" y="52" width="16" height="48" rx="4" fill="#f8fafc" stroke="#e2e8f0" />
          <rect x="12" y="44" width="16" height="12" rx="2" fill="#cbd5e1" />
          <path d="M13 46 C13 26 20 6 20 6 C20 6 27 26 27 46 Z" fill={color} />
          <path d="M20 6 C20 6 22 22 21.5 44 L18.5 44 C18 22 20 6 20 6 Z" fill="#000" opacity="0.12" />
        </>
      )}
      {type === 'highlighter' && (
        <>
          {/* 형광펜: 굵은 배럴 + 납작한 치즐 마커 촉(잉크색) */}
          <rect x="9" y="40" width="22" height="60" rx="4" fill="#f8fafc" stroke="#e2e8f0" />
          <path d="M11 42 L29 42 L26 20 L14 20 Z" fill={color} opacity="0.85" />
          <path d="M14 20 L26 20 L24 10 L16 10 Z" fill={color} />
          <rect x="15" y="7" width="10" height="5" rx="1.5" fill={color} opacity="0.7" />
        </>
      )}
      {type === 'eraser' && (
        <>
          {/* 지우개: 분홍 블록 + 흰 슬리브 */}
          <rect x="10" y="44" width="20" height="56" rx="3" fill="#f8fafc" stroke="#e2e8f0" />
          <rect x="9" y="14" width="22" height="34" rx="5" fill="#fda4af" stroke="#fb7185" />
          <rect x="9" y="40" width="22" height="8" fill="#fecdd3" />
        </>
      )}
    </svg>
  );
}
