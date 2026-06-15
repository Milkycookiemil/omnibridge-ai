export interface Device {
  name: string;
  type: "tablet" | "laptop";
  status: "connected" | "disconnected";
  lastSync: string;
}

export interface SummaryCard {
  time: string;
  text: string;
  inkGroupId: string;
  timestamp: number; // in seconds
}

export type ViewState = "dashboard" | "live_note" | "replay" | "search" | "settings";

export interface DummyData {
  devices: Device[];
  currentNote: {
    title: string;
    progress: string;
    lastOpened: string;
  };
  aiInsights: {
    tags: string[];
    warning: string;
  };
  summaryCards: SummaryCard[];
  taskBinding: {
    trigger: string;
    text: string;
  };
  searchSuggestions: string[];
  recentNotes: {
    title: string;
    date: string;
    snippet?: string;
  }[];
}
