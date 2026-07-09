// src/lib/aiSummary.ts
// AI 요약 (BYOK — Bring Your Own Key). 사용자가 설정에서 본인 Anthropic API 키를 넣으면,
// 실시간 전사 텍스트를 Claude로 요약한다. 키/모델은 브라우저 localStorage에만 저장하고
// (계정별 격리는 키 자체가 사용자 소유라 불필요), 호출은 브라우저에서 Messages API로 직접
// 보낸다(anthropic-dangerous-direct-browser-access). 키가 없으면 요약 기능은 비활성.
//
// 보안: 키가 사용자 본인 것이고 본인 브라우저에만 저장되므로 노출 위험이 없다(BYOS 철학과
// 동일). 사업자 프록시(서버) 방식은 대중화 단계에서 별도 도입 가능(Path 2).

const KEY_LS = 'ob_anthropic_key';
const MODEL_LS = 'ob_summary_model';

// 요약은 짧은 전사 텍스트를 자주 처리 → 기본값은 빠르고 저렴한 Haiku 4.5.
// 사용자가 설정에서 상위 모델로 바꿀 수 있다(비용은 본인 부담이므로 선택은 사용자 몫).
export const SUMMARY_MODELS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 (빠름·저렴, 추천)' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 (균형)' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8 (최고 품질·고비용)' },
] as const;

const DEFAULT_MODEL = 'claude-haiku-4-5';

export const getAnthropicKey = (): string => localStorage.getItem(KEY_LS)?.trim() || '';
export const setAnthropicKey = (key: string) => {
  const v = key.trim();
  if (v) localStorage.setItem(KEY_LS, v);
  else localStorage.removeItem(KEY_LS);
};

export const getSummaryModel = (): string => localStorage.getItem(MODEL_LS) || DEFAULT_MODEL;
export const setSummaryModel = (model: string) => localStorage.setItem(MODEL_LS, model);

export const isAiSummaryConfigured = (): boolean => getAnthropicKey().length > 0;

const SYSTEM_PROMPT =
  '너는 강의/회의 실시간 필기 앱의 요약 도우미다. 주어진 전사(자막) 텍스트에서 학습자가 ' +
  '복습에 바로 쓸 핵심 요점을 뽑아라. 규칙: (1) 한국어로, (2) 각 요점을 한 줄로 간결하게, ' +
  '(3) 2~4개만, (4) 각 줄은 "- "로 시작, (5) 서론/맺음말/메타설명 없이 요점 줄만 출력.';

// 전사 텍스트를 Claude로 요약 → 요점 문자열 배열. 실패 시 예외.
export async function summarizeTranscript(
  transcript: string,
  opts: { signal?: AbortSignal } = {}
): Promise<string[]> {
  const apiKey = getAnthropicKey();
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다. (설정 → AI 엔진)');

  const text = transcript.trim();
  if (!text) return [];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // 브라우저에서 직접 호출 허용 (BYOK — 사용자 본인 키)
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: getSummaryModel(),
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `다음 전사 내용을 요약해줘:\n\n${text}` }],
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err?.error?.message || '';
    } catch {
      /* ignore */
    }
    if (res.status === 401) throw new Error('API 키가 올바르지 않습니다.');
    if (res.status === 429) throw new Error('요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    throw new Error(detail || `요약 실패 (HTTP ${res.status})`);
  }

  const data = await res.json();
  // content: [{type:'text', text:'...'}] 형태. 텍스트 블록만 합쳐 줄 단위로 파싱.
  const raw: string = Array.isArray(data?.content)
    ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n')
    : '';

  return raw
    .split('\n')
    .map((l) => l.replace(/^[-*•\d.\s]+/, '').trim())
    .filter((l) => l.length > 0)
    .slice(0, 4);
}
