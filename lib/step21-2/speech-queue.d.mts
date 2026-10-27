export function speechText(text: string): string;
export function takeSpeechSegment(text: string, final?: boolean): { segment: string; rest: string };
export class SpeechQueue {
  constructor(options: { fetchAudio: (text: string, signal: AbortSignal) => Promise<Blob>; playAudio: (blob: Blob, text: string, signal: AbortSignal) => Promise<void>; onPending?: (pending: boolean) => void; onError?: (error: unknown) => void });
  push(text: string, final?: boolean): void;
  cancel(): void;
}
