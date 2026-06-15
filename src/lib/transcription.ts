// src/lib/transcription.ts
// 온디바이스 Whisper(transformers.js) 전사 엔진. 키 불필요·브라우저 내 처리(프라이버시).
// 동적 import로 코드 분할 → 최초 녹음 시에만 모델을 lazy-load 한다.

export type ModelProgress = { status: string; progress?: number; file?: string };

// 파이프라인 싱글톤 (최초 1회만 모델 다운로드/초기화)
let transcriberPromise: Promise<any> | null = null;

export async function getTranscriber(onProgress?: (p: ModelProgress) => void): Promise<any> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      // 원격(HF Hub) 모델 사용
      env.allowLocalModels = false;
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        progress_callback: onProgress as any,
      });
    })();
  }
  return transcriberPromise;
}

// 입력 PCM(임의 샘플레이트)을 Whisper가 요구하는 16kHz 모노로 선형 리샘플
export function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

// 16kHz Float32 PCM 한 윈도를 한국어로 전사
export async function transcribePcm16k(pcm16k: Float32Array): Promise<string> {
  const transcriber = await getTranscriber();
  const result = await transcriber(pcm16k, {
    language: 'korean',
    task: 'transcribe',
    chunk_length_s: 30,
  });
  const text = Array.isArray(result) ? result.map((r: any) => r.text).join(' ') : result?.text;
  return (text || '').trim();
}
