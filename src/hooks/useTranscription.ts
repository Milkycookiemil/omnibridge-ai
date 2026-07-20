// src/hooks/useTranscription.ts
// 강의 녹음 스트림을 ~5초 윈도로 모아 온디바이스 Whisper로 실시간 전사한다.
import { useRef, useState, useCallback } from 'react';
import { getTranscriber, resampleTo16k, transcribePcm16k, type ModelProgress } from '../lib/transcription';

export interface TranscriptLine {
  time: string; // mm:ss
  sec: number;  // 녹음 시작부터 경과 초(획↔전사 싱크용)
  text: string;
}

export type TranscribeStatus = 'idle' | 'loading' | 'listening' | 'transcribing' | 'error';

const WINDOW_MS = 5000;

export function useTranscription() {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [status, setStatus] = useState<TranscribeStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modelProgress, setModelProgress] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const startTimeRef = useRef(0);

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const flushWindow = useCallback(async () => {
    if (busyRef.current) return;
    const ctx = ctxRef.current;
    const chunks = chunksRef.current;
    if (!ctx || chunks.length === 0) return;

    // 누적 PCM 합치고 버퍼 비우기
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    chunksRef.current = [];

    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    busyRef.current = true;
    setStatus('transcribing');
    try {
      const pcm16k = resampleTo16k(merged, ctx.sampleRate);
      const text = await transcribePcm16k(pcm16k);
      if (text) setLines((prev) => [...prev, { time: fmt(elapsed), sec: elapsed, text }]);
    } catch (e) {
      console.error('전사 실패', e);
    } finally {
      busyRef.current = false;
      // 녹음 진행 중(interval 살아있음)이면 청취로 복귀, 종료됐으면 대기로.
      // (stop 시 마지막 flush가 비동기로 끝나며 idle을 덮어써 '청취 중'이 남던 버그 수정)
      setStatus(intervalRef.current ? 'listening' : 'idle');
    }
  }, []);

  const start = useCallback(async (stream: MediaStream) => {
    if (ctxRef.current) return; // 이미 동작 중
    startTimeRef.current = Date.now();
    chunksRef.current = [];

    // 모델 미리 로드 (진행률 표시). 실패하면 '청취 중'으로 넘어가지 말고 에러를 노출한다.
    // (예전엔 에러를 삼키고 listening으로 진행 → 매 flush가 throw → "청취 중인데 라인 0"으로 오인)
    setStatus('loading');
    setErrorMsg(null);
    try {
      await getTranscriber((p: ModelProgress) => {
        if (typeof p.progress === 'number') setModelProgress(Math.round(p.progress));
      });
    } catch (e) {
      console.error('Whisper 모델 로드 실패', e);
      setErrorMsg('전사 모델을 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.');
      setStatus('error');
      return; // 모델 없이 캡처를 시작해봐야 매번 실패하므로 중단
    }

    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      chunksRef.current.push(new Float32Array(input)); // 복사본 누적
    };

    // 오디오 피드백 방지용 무음 게인
    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(processor);
    processor.connect(silent);
    silent.connect(ctx.destination);

    setStatus('listening');
    intervalRef.current = setInterval(flushWindow, WINDOW_MS);
  }, [flushWindow]);

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    // 마지막 잔여 윈도 전사
    flushWindow();
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      ctxRef.current?.close();
    } catch { /* noop */ }
    processorRef.current = null;
    sourceRef.current = null;
    ctxRef.current = null;
    setStatus('idle');
  }, [flushWindow]);

  const reset = useCallback(() => setLines([]), []);
  // 저장된 전사를 노트 열 때 복원(획↔전사 싱크가 재방문·크로스디바이스에서도 동작).
  const restore = useCallback((saved: TranscriptLine[]) => setLines(saved ?? []), []);

  return { lines, status, errorMsg, modelProgress, start, stop, reset, restore };
}
