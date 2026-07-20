// src/lib/audioCapture.ts
// 녹음/전사에 쓸 오디오 스트림을 소스 선택에 따라 구성한다.
//  - mic:    마이크(getUserMedia, 장치 선택 가능)
//  - system: 시스템/윈도우 소리(인강·줌). 브라우저는 시스템 소리를 직접 못 잡고
//            화면공유(getDisplayMedia)로만 캡처 가능 → 녹음 시작 시 "화면 공유 + 오디오 공유"
//            선택 창이 뜬다. 비디오 트랙은 필요 없으니 즉시 정지·제거하고 오디오만 사용.
//  - both:   마이크 + 시스템을 Web Audio로 한 스트림으로 믹싱.
import type { AudioSource } from './preferences';

export interface RecordingStream {
  stream: MediaStream; // MediaRecorder + 전사에 먹일 스트림
  cleanup: () => void; // 정지 시 원본 트랙/믹싱 컨텍스트 정리
}

// 시스템 오디오 공유를 사용자가 체크하지 않았을 때 구분용 에러.
export const NO_SYSTEM_AUDIO = 'no-system-audio';

async function getMicStream(deviceId: string | null): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  });
}

async function getSystemStream(): Promise<MediaStream> {
  // 시스템 소리는 화면공유로만. video:true가 있어야 오디오 공유 옵션이 뜨는 브라우저가 많다.
  const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  if (display.getAudioTracks().length === 0) {
    display.getTracks().forEach((t) => t.stop());
    throw new Error(NO_SYSTEM_AUDIO);
  }
  // 오디오만 필요 → 비디오 트랙은 정지·제거(화면 캡처 자원 낭비 방지).
  display.getVideoTracks().forEach((t) => { t.stop(); display.removeTrack(t); });
  return display;
}

export async function buildRecordingStream(
  source: AudioSource,
  micDeviceId: string | null,
): Promise<RecordingStream> {
  if (source === 'mic') {
    const s = await getMicStream(micDeviceId);
    return { stream: s, cleanup: () => s.getTracks().forEach((t) => t.stop()) };
  }
  if (source === 'system') {
    const s = await getSystemStream();
    return { stream: s, cleanup: () => s.getTracks().forEach((t) => t.stop()) };
  }
  // both: 마이크 먼저 잡고(권한 팝업), 이어서 시스템(화면공유 팝업) → 실패 시 마이크도 정리.
  const mic = await getMicStream(micDeviceId);
  let sys: MediaStream;
  try {
    sys = await getSystemStream();
  } catch (e) {
    mic.getTracks().forEach((t) => t.stop());
    throw e;
  }
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  ctx.createMediaStreamSource(mic).connect(dest);
  ctx.createMediaStreamSource(sys).connect(dest);
  return {
    stream: dest.stream,
    cleanup: () => {
      mic.getTracks().forEach((t) => t.stop());
      sys.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

// 마이크 장치 목록(라벨은 마이크 권한을 한 번 허용해야 채워진다).
export async function listMicDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  } catch {
    return [];
  }
}
