export type PcmAudioSegment = {
  base64: string;
  durationSeconds: number;
};

const TARGET_SAMPLE_RATE = 24_000;
const MAX_SEGMENT_SECONDS = 12;

function abortError() {
  return new DOMException("Aborted", "AbortError");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const batchSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += batchSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + batchSize));
  }
  return window.btoa(binary);
}

function floatSamplesToPcm16(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(index * 2, Math.round(value), true);
  }
  return bytes;
}

export async function speechBlobToPcmSegments(blob: Blob, signal: AbortSignal): Promise<PcmAudioSegment[]> {
  if (signal.aborted) throw abortError();
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass || typeof OfflineAudioContext === "undefined") {
    throw new Error("当前浏览器无法把语音转换为LiveAvatar所需格式，请使用最新版Chrome或Edge。");
  }
  const decodingContext = new AudioContextClass();
  try {
    const sourceBuffer = await decodingContext.decodeAudioData(await blob.arrayBuffer());
    if (signal.aborted) throw abortError();
    const frameCount = Math.max(1, Math.ceil(sourceBuffer.duration * TARGET_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = sourceBuffer;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    if (signal.aborted) throw abortError();
    const samples = rendered.getChannelData(0);
    const segmentFrames = TARGET_SAMPLE_RATE * MAX_SEGMENT_SECONDS;
    const segments: PcmAudioSegment[] = [];
    for (let offset = 0; offset < samples.length; offset += segmentFrames) {
      const slice = samples.subarray(offset, Math.min(samples.length, offset + segmentFrames));
      segments.push({
        base64: bytesToBase64(floatSamplesToPcm16(slice)),
        durationSeconds: slice.length / TARGET_SAMPLE_RATE,
      });
    }
    return segments;
  } finally {
    await decodingContext.close().catch(() => undefined);
  }
}
