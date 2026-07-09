/// <reference types="vite/client" />

// Vite `?url` 에셋 import (pdf.worker.min.mjs?url 등)
declare module '*?url' {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  // 1c: Google Drive 선택적 내보내기용 OAuth 클라이언트 ID(drive.file 스코프).
  // 없으면 Drive 내보내기는 비활성(로컬 .ob 내보내기는 영향 없음).
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
