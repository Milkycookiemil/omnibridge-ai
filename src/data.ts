import { DummyData } from "./types";

export const dummyData: DummyData = {
  devices: [
    { name: "Galaxy Tab S9+", type: "tablet", status: "connected", lastSync: "0.1초 전" },
    { name: "LG Gram 16", type: "laptop", status: "connected", lastSync: "0.1초 전" }
  ],
  currentNote: {
    title: "디지털 마케팅 실습 — 6강 비즈니스 모델",
    progress: "42:15 / 60:00",
    lastOpened: "어제 오후 3:30"
  },
  aiInsights: {
    tags: ["#비즈니스모델캔버스", "#9블록", "#가치제안"],
    warning: "교수님 강조 '수익 구조' 재확인 필요"
  },
  summaryCards: [
    { time: "00:30", text: "BMC 9블록의 전체 구조 개요", inkGroupId: "ink-1", timestamp: 30 },
    { time: "05:12", text: "가치 제안 — 고객 결과 중심 언어로 전환", inkGroupId: "ink-2", timestamp: 312 },
    { time: "12:30", text: "수익원: 무료(2대 제한) → 프로 구독 전환 트리거", inkGroupId: "ink-3", timestamp: 750 },
    { time: "18:45", text: "비용 구조: 고정비 vs 변동비 구분", inkGroupId: "ink-4", timestamp: 1125 }
  ],
  taskBinding: { trigger: "12:30", text: "'중간고사 12월 5일' 일정을 캘린더에 추가할까요?" },
  searchSuggestions: ["교수님이 9블록 강조한 부분", "수익 구조 설명", "고정비 변동비 차이", "전환 트리거"],
  recentNotes: [
    { title: "디지털 마케팅 실습 — 6강", date: "어제", snippet: "교수님 연락처는 010-1234-5678 이고 주민번호는 900101-1234567 입니다." },
    { title: "멀티모달 기획 — 잉크매핑 메모", date: "3일 전", snippet: "다음 주 회의 자료 준비. 담당자 김철수 (010-9876-5432)" },
    { title: "팀 프로젝트 회의록", date: "지난주", snippet: "스토리보드 초안 완성. API 연동 부분 확인 필요." }
  ]
};
