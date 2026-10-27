"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { splitReliableRealtimeSpeech } from "@/lib/step11-5/spoken-segmentation";
import { visemeAtProgress, type TextViseme } from "@/lib/step11-5/viseme-timeline";
import type { ColdCallBroadcast } from "@/lib/step8a/types";
import type {
  PresentationLectureRequest,
  PresentationLectureStreamMeta,
} from "@/lib/step11-9/presentation-lecture-types";
import { useSmartVoice } from "../voice/use-smart-voice";
import { voiceClientId } from "../voice/voice-client-id";
import type {
  PhotoAvatarAudioSignals,
  PhotoAvatarGesture,
} from "./photo-avatar-stage";
import ClassroomAvatarStage, { type ClassroomAvatarHandle } from "./classroom-avatar-stage";
import styles from "./fullscreen-local-digital-teacher.module.css";

// STEP 11.3 浏览器本地2.5D真人教师 compatibility: splitRealtimeSpeech is superseded by the reliable Step 11.5 splitter.
// STEP 11.5 compatibility: sequential TTS, retry, browser-speech fallback and the long-answer panel remain available beneath LiveAvatar.
// Legacy fallback compatibility: PhotoAvatarStage and the “不占云数字人路数” local renderer remain packaged for rollback, while Step 11.6 defaults to LiveAvatar.

type Phase = "preparing" | "listening" | "transcribing" | "thinking" | "speaking" | "standby" | "error";
type Transcript = { role: "student" | "teacher"; text: string };
type HistoryMessage = { role: "user" | "assistant"; content: string };
type ColdCallStatus = "idle" | "waiting" | "evaluating" | "feedback" | "timed_out";
type ColdCallEvaluation = {
  score: number;
  verdict: string;
  feedback: string;
  correction: string;
  missingPoints: string[];
  standardAnswer: string;
  rubric: string;
  source: string;
  generatedBy: string;
  teacherReviewRequired: boolean;
};
type ColdCallAttempt = {
  evaluation: ColdCallEvaluation;
  responseText: string;
  timedOut: boolean;
  score: number;
};
type QueuedSpeech = {
  text: string;
  controller: AbortController;
  sequence: number;
  blobPromise: Promise<Blob> | null;
};

class SpeechRequestError extends Error {
  status: number;
  code: string;
  retryAfterMs: number;

  constructor(message: string, options: { status?: number; code?: string; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "SpeechRequestError";
    this.status = Number(options.status || 0);
    this.code = options.code || "VOICE_FAILED";
    this.retryAfterMs = Number(options.retryAfterMs || 0);
  }
}

const PHASE_LABELS: Record<Phase, string> = {
  preparing: "正在连接课堂数字教师",
  listening: "正在聆听 · 说完后自动提交",
  transcribing: "正在高精度识别 · 无需点击发送",
  thinking: "正在检索课程资料并生成回答",
  speaking: "AI数字教师正在实时讲解",
  standby: "数字教师在线 · 随时可以提问",
  error: "本次对话遇到问题",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return new Error(payload?.error?.message || fallback);
}

async function speechResponseError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  const retryAfter = Number(response.headers.get("Retry-After") || 0);
  return new SpeechRequestError(payload?.error?.message || "AI教师语音生成失败，请重试。", {
    status: response.status,
    code: payload?.error?.code,
    retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1_000 : 0,
  });
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = window.setTimeout(finish, milliseconds);
    const abort = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function fetchSpeechBlob(text: string, controller: AbortController) {
  const retryDelays = [0, 650, 1_350, 2_400];
  let lastError: unknown;
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt]) await abortableDelay(retryDelays[attempt], controller.signal);
    try {
      const response = await fetch("/api/voice/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Voice-Queue": "step11.5-sequential",
          "X-Voice-Client-Id": voiceClientId(),
        },
        body: JSON.stringify({ text, language: "mixed", rate: 0.97 }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) return response.blob();
      const requestError = await speechResponseError(response);
      lastError = requestError;
      const transient = [408, 425, 429, 500, 502, 503, 504].includes(requestError.status);
      if (!transient || attempt === retryDelays.length - 1) throw requestError;
      if (requestError.retryAfterMs > retryDelays[attempt + 1]) retryDelays[attempt + 1] = Math.min(4_000, requestError.retryAfterMs);
    } catch (error) {
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      lastError = error;
      if (error instanceof SpeechRequestError) {
        const transient = [408, 425, 429, 500, 502, 503, 504].includes(error.status);
        if (!transient || attempt === retryDelays.length - 1) throw error;
      } else if (attempt === retryDelays.length - 1) {
        throw error;
      }
    }
  }
  throw lastError || new Error("AI教师语音生成失败，请重试。");
}

async function consumeLocalStream(
  response: Response,
  onDelta: (text: string) => void,
  onMeta?: (meta: { lecture?: PresentationLectureStreamMeta }) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("浏览器没有收到AI数字教师的流式回答。");
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeFrame = (frame: string) => {
    const line = frame.split(/\r?\n/u).find((item) => item.startsWith("data:"));
    if (!line) return;
    let payload: { type?: string; text?: string; message?: string; lecture?: PresentationLectureStreamMeta };
    try {
      payload = JSON.parse(line.slice(5).trim()) as typeof payload;
    } catch {
      return;
    }
    if (payload.type === "meta") onMeta?.({ lecture: payload.lecture });
    if (payload.type === "delta" && payload.text) onDelta(payload.text);
    if (payload.type === "error") throw new Error(payload.message || "AI数字教师回答暂时不可用。");
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/u);
    buffer = frames.pop() || "";
    for (const frame of frames) consumeFrame(frame);
    if (done) break;
  }
  if (buffer.trim()) consumeFrame(buffer);
}

function transcriptHistory(transcript: Transcript[]): HistoryMessage[] {
  return transcript.slice(-6).map((item) => ({
    role: item.role === "student" ? "user" : "assistant",
    content: item.text.slice(0, 1_200),
  }));
}

function teachingGesture(text: string, sequence: number): PhotoAvatarGesture {
  if (/(重点|注意|必须|关键|important|remember|note that)/iu.test(text)) return "emphasis";
  if (/(首先|其次|最后|包括|分为|步骤|一是|二是|three|steps?|include)/iu.test(text)) return "two-hands";
  if (/(例如|比如|也就是说|可以理解为|for example|in other words)/iu.test(text)) return "open-palm";
  return (["open-palm", "two-hands", "neutral"] as PhotoAvatarGesture[])[sequence % 3];
}

function readableAnswer(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/^#{1,6}\s*/gmu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isHardMicrophoneError(message: string) {
  return /(麦克风权限|无法使用麦克风|无法启动麦克风|不支持.*录音|HTTPS|地址栏允许)/iu.test(message);
}

export default function FullscreenLocalDigitalTeacher({
  open,
  mode = "auto",
  onClose,
  onFallbackVoice,
  presentationLecture = null,
  coldCallRequest = null,
  preferredProvider,
}: {
  open: boolean;
  mode?: string;
  onClose: () => void;
  onFallbackVoice: () => void;
  presentationLecture?: PresentationLectureRequest | null;
  coldCallRequest?: ColdCallBroadcast | null;
  preferredProvider?: "lite" | "live";
}) {
  const voice = useSmartVoice();
  const [phase, setPhase] = useState<Phase>("preparing");
  const [paused, setPaused] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [liveAnswer, setLiveAnswer] = useState("");
  const [typedQuestion, setTypedQuestion] = useState("");
  const [, setGesture] = useState<PhotoAvatarGesture>("neutral");
  const [answerPanelOpen, setAnswerPanelOpen] = useState(true);
  const [liveAvatarReady, setLiveAvatarReady] = useState(false);
  const [liveColdCall, setLiveColdCall] = useState<ColdCallBroadcast | null>(null);
  const [coldCallStatus, setColdCallStatus] = useState<ColdCallStatus>("idle");
  const [coldCallCountdown, setColdCallCountdown] = useState(0);
  const [coldCallAttempt, setColdCallAttempt] = useState<ColdCallAttempt | null>(null);
  const [livePresentation, setLivePresentation] = useState<PresentationLectureRequest | null>(presentationLecture);
  const [lectureMeta, setLectureMeta] = useState<PresentationLectureStreamMeta | null>(null);

  const transcriptRef = useRef<Transcript[]>([]);
  const flowTokenRef = useRef(0);
  const pausedRef = useRef(false);
  const listenTimerRef = useRef<number | null>(null);
  const answerAbortRef = useRef<AbortController | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);
  const speechQueueRef = useRef<QueuedSpeech[]>([]);
  const speechSequenceRef = useRef(0);
  const ttsPrefetchActiveRef = useRef(0);
  const pumpPromiseRef = useRef<Promise<void> | null>(null);
  const pendingAvatarPlaybackRef = useRef<Set<Promise<void>>>(new Set());
  const speechIdleResolversRef = useRef<Array<() => void>>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioSignalFrameRef = useRef(0);
  const audioSignalsRef = useRef<PhotoAvatarAudioSignals>({ open: 0, wide: 0, round: 0, viseme: "rest" });
  const answerScrollerRef = useRef<HTMLDivElement | null>(null);
  const startListeningCycleRef = useRef<() => void>(() => undefined);
  const cleanupRef = useRef<() => void>(() => undefined);
  const liveAvatarRef = useRef<ClassroomAvatarHandle | null>(null);
  const coldCallHandlerRef = useRef<(event: ColdCallBroadcast) => Promise<void>>(async () => undefined);
  const activeColdCallRef = useRef<ColdCallBroadcast | null>(null);
  const coldCallStatusRef = useRef<ColdCallStatus>("idle");
  const coldCallIntervalRef = useRef<number | null>(null);
  const coldCallTimeoutRef = useRef<number | null>(null);
  const coldCallSubmittingRef = useRef(false);
  const presentationLectureHandlerRef = useRef<(request: PresentationLectureRequest) => Promise<void>>(async () => undefined);
  const lastColdCallIdRef = useRef("");
  const lastPresentationLectureIdRef = useRef("");
  const activePresentationRequestRef = useRef<PresentationLectureRequest | null>(presentationLecture);
  const presentationContextRef = useRef<PresentationLectureStreamMeta | null>(null);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    coldCallStatusRef.current = coldCallStatus;
  }, [coldCallStatus]);

  const handleLiveAvatarReady = useCallback((ready: boolean) => {
    setLiveAvatarReady(ready);
    if (!ready) setPhase("preparing");
  }, []);

  useEffect(() => {
    const panel = answerScrollerRef.current;
    if (!panel || !liveAnswer) return;
    panel.scrollTop = panel.scrollHeight;
  }, [answerPanelOpen, liveAnswer]);

  function setAudioSignals(openAmount = 0, wide = 0, round = 0, viseme: TextViseme = "rest") {
    audioSignalsRef.current.open = openAmount;
    audioSignalsRef.current.wide = wide;
    audioSignalsRef.current.round = round;
    audioSignalsRef.current.viseme = viseme;
  }

  function appendTranscript(item: Transcript) {
    const next = [...transcriptRef.current.slice(-5), item];
    transcriptRef.current = next;
    setTranscript(next);
  }

  function resolveSpeechIdle() {
    if (pumpPromiseRef.current || speechQueueRef.current.length || pendingAvatarPlaybackRef.current.size) return;
    const resolvers = speechIdleResolversRef.current.splice(0);
    resolvers.forEach((resolve) => resolve());
  }

  function waitForSpeechIdle() {
    if (!pumpPromiseRef.current && speechQueueRef.current.length === 0 && pendingAvatarPlaybackRef.current.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => speechIdleResolversRef.current.push(resolve));
  }

  async function ensureAudioPipeline() {
    let context = audioContextRef.current;
    if (!context) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("当前浏览器不支持数字人口型音频驱动，请使用最新版Chrome或Edge。");
      context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      analyser.connect(context.destination);
      audioContextRef.current = context;
      audioAnalyserRef.current = analyser;
    }
    if (context.state === "suspended") await context.resume();
    return { context, analyser: audioAnalyserRef.current! };
  }

  async function playSpeechBlob(blob: Blob, text: string, controller: AbortController, sequence: number) {
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const { context, analyser } = await ensureAudioPipeline();
    const url = URL.createObjectURL(blob);
    currentAudioUrlRef.current = url;
    const audio = new Audio(url);
    audio.preload = "auto";
    currentAudioRef.current = audio;
    const source = context.createMediaElementSource(audio);
    source.connect(analyser);
    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    setGesture(teachingGesture(text, sequence));
    setPhase("speaking");
    let abortHandler: (() => void) | null = null;
    let playbackTimer = 0;

    const trackMouth = () => {
      if (currentAudioRef.current !== audio || audio.paused || audio.ended) {
        setAudioSignals();
        return;
      }
      analyser.getByteFrequencyData(spectrum);
      let low = 0;
      let mid = 0;
      let high = 0;
      for (let index = 2; index < 10; index += 1) low += spectrum[index];
      for (let index = 10; index < 28; index += 1) mid += spectrum[index];
      for (let index = 28; index < 62; index += 1) high += spectrum[index];
      low /= 8;
      mid /= 18;
      high /= 34;
      const energy = Math.max(low, mid * 0.92, high * 0.72);
      const openAmount = Math.max(0, Math.min(1, (energy - 7) / 55));
      const total = Math.max(1, low + mid + high);
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 1;
      const viseme = openAmount < 0.03 ? "rest" : visemeAtProgress(text, audio.currentTime / duration);
      setAudioSignals(
        openAmount,
        Math.min(1, (mid + high * 0.55) / total * 1.55),
        Math.min(1, low / total * 1.85),
        viseme,
      );
      audioSignalFrameRef.current = requestAnimationFrame(trackMouth);
    };

    try {
      await new Promise<void>((resolve, reject) => {
        abortHandler = () => {
          audio.pause();
          reject(new DOMException("Aborted", "AbortError"));
        };
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("AI教师语音播放失败，请点击重试。"));
        playbackTimer = window.setTimeout(() => reject(new Error("AI教师语音播放等待超时。")), 75_000);
        controller.signal.addEventListener("abort", abortHandler, { once: true });
        void audio.play().then(() => {
          trackMouth();
        }).catch(reject);
      });
    } finally {
      if (abortHandler) controller.signal.removeEventListener("abort", abortHandler);
      if (playbackTimer) window.clearTimeout(playbackTimer);
      if (audioSignalFrameRef.current) cancelAnimationFrame(audioSignalFrameRef.current);
      audioSignalFrameRef.current = 0;
      setAudioSignals();
      source.disconnect();
      audio.pause();
      if (currentAudioRef.current === audio) currentAudioRef.current = null;
      URL.revokeObjectURL(url);
      if (currentAudioUrlRef.current === url) currentAudioUrlRef.current = "";
    }
  }

  async function playBrowserSpeech(text: string, controller: AbortController, sequence: number) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      throw new Error("当前浏览器没有可用的本机语音。");
    }
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const utterance = new SpeechSynthesisUtterance(text);
    const hanCount = Array.from(text).filter((symbol) => /[\p{Script=Han}]/u.test(symbol)).length;
    utterance.lang = hanCount >= Math.max(2, text.length * 0.18) ? "zh-CN" : "en-US";
    utterance.rate = 0.96;
    const matchingVoice = window.speechSynthesis.getVoices().find((voiceItem) =>
      voiceItem.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase()),
    );
    if (matchingVoice) utterance.voice = matchingVoice;
    setGesture(teachingGesture(text, sequence));
    setPhase("speaking");
    let boundaryProgress = 0;
    let animationFrame = 0;
    let abortHandler: (() => void) | null = null;
    let fallbackTimer = 0;
    const estimatedMilliseconds = Math.max(1_200, Math.min(22_000, text.length * (utterance.lang === "zh-CN" ? 245 : 105)));
    const startedAt = performance.now();
    const animateFallbackMouth = () => {
      if (controller.signal.aborted) return;
      const estimatedProgress = Math.min(0.999, (performance.now() - startedAt) / estimatedMilliseconds);
      const progress = Math.max(boundaryProgress, estimatedProgress);
      const viseme = visemeAtProgress(text, progress);
      const pulse = viseme === "rest" || viseme === "closed" ? 0 : 0.48 + Math.abs(Math.sin(performance.now() / 128)) * 0.28;
      setAudioSignals(pulse, 0.46, 0.34, viseme);
      animationFrame = requestAnimationFrame(animateFallbackMouth);
    };

    await new Promise<void>((resolve, reject) => {
      abortHandler = () => {
        window.speechSynthesis.cancel();
        reject(new DOMException("Aborted", "AbortError"));
      };
      utterance.onboundary = (event) => {
        boundaryProgress = Math.max(boundaryProgress, event.charIndex / Math.max(1, text.length));
      };
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(event.error === "interrupted" ? "本机语音已中断。" : "本机语音播放失败。"));
      controller.signal.addEventListener("abort", abortHandler, { once: true });
      fallbackTimer = window.setTimeout(() => {
        window.speechSynthesis.cancel();
        resolve();
      }, estimatedMilliseconds + 6_000);
      animationFrame = requestAnimationFrame(animateFallbackMouth);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }).finally(() => {
      if (abortHandler) controller.signal.removeEventListener("abort", abortHandler);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      if (animationFrame) cancelAnimationFrame(animationFrame);
      setAudioSignals();
    });
  }

  async function pumpSpeechQueue() {
    if (pumpPromiseRef.current) return pumpPromiseRef.current;
    const run = (async () => {
      while (speechQueueRef.current.length) {
        primeTtsPrefetch();
        const item = speechQueueRef.current.shift()!;
        if (item.controller.signal.aborted) continue;
        try {
          const stage = liveAvatarRef.current;
          if (stage?.isReady()) {
            setGesture(teachingGesture(item.text, item.sequence));
            setPhase("speaking");
            const scheduled = stage.scheduleText
              ? await stage.scheduleText(item.text, item.controller.signal)
              : await stage.schedule(await (item.blobPromise || fetchSpeechBlob(item.text, item.controller)), item.controller.signal);
            const playback = scheduled.finished.catch((error) => {
              if (!isAbortError(error)) setVoiceNotice("数字人语音播放短时中断；完整文字回答仍可查看。");
            });
            pendingAvatarPlaybackRef.current.add(playback);
            void playback.finally(() => {
              pendingAvatarPlaybackRef.current.delete(playback);
              if (pendingAvatarPlaybackRef.current.size === 0) setGesture("neutral");
              resolveSpeechIdle();
            });
            if (stage.scheduleText) await playback;
          } else {
            const blob = await (item.blobPromise || fetchSpeechBlob(item.text, item.controller));
            await playSpeechBlob(blob, item.text, item.controller, item.sequence);
          }
        } catch (error) {
          if (isAbortError(error)) continue;
          setVoiceNotice("云端语音短时繁忙，已自动切换本机语音，回答不会中断。");
          try {
            if (pendingAvatarPlaybackRef.current.size) {
              await Promise.all([...pendingAvatarPlaybackRef.current]);
            }
            await playBrowserSpeech(item.text, item.controller, item.sequence);
          } catch (fallbackError) {
            if (!isAbortError(fallbackError)) {
              setVoiceNotice("语音暂时不可播放；完整文字回答仍会继续显示，可稍后点击重试。");
            }
          }
        }
      }
      if (pendingAvatarPlaybackRef.current.size === 0) setGesture("neutral");
    })();
    pumpPromiseRef.current = run;
    void run.finally(() => {
      if (pumpPromiseRef.current === run) pumpPromiseRef.current = null;
      if (speechQueueRef.current.length) void pumpSpeechQueue();
      else resolveSpeechIdle();
    });
    return run;
  }

  function startTtsPrefetch(item: QueuedSpeech) {
    if (item.blobPromise || item.controller.signal.aborted || liveAvatarRef.current?.scheduleText) return;
    ttsPrefetchActiveRef.current += 1;
    item.blobPromise = fetchSpeechBlob(item.text, item.controller).finally(() => {
      ttsPrefetchActiveRef.current = Math.max(0, ttsPrefetchActiveRef.current - 1);
      primeTtsPrefetch();
    });
    void item.blobPromise.catch(() => undefined);
  }

  function primeTtsPrefetch() {
    for (const item of speechQueueRef.current) {
      if (ttsPrefetchActiveRef.current >= 2) break;
      startTtsPrefetch(item);
    }
  }

  function enqueueSpeech(text: string, controller: AbortController) {
    const normalized = text.trim();
    if (!normalized || controller.signal.aborted) return;
    speechQueueRef.current.push({ text: normalized, controller, sequence: speechSequenceRef.current++, blobPromise: null });
    primeTtsPrefetch();
    void pumpSpeechQueue();
  }

  function stopSpeechPlayback() {
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    speechQueueRef.current = [];
    currentAudioRef.current?.pause();
    currentAudioRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    liveAvatarRef.current?.interrupt();
    if (currentAudioUrlRef.current) URL.revokeObjectURL(currentAudioUrlRef.current);
    currentAudioUrlRef.current = "";
    if (audioSignalFrameRef.current) cancelAnimationFrame(audioSignalFrameRef.current);
    audioSignalFrameRef.current = 0;
    setAudioSignals();
    setGesture("neutral");
  }

  function clearColdCallTimers() {
    if (coldCallIntervalRef.current !== null) window.clearInterval(coldCallIntervalRef.current);
    if (coldCallTimeoutRef.current !== null) window.clearTimeout(coldCallTimeoutRef.current);
    coldCallIntervalRef.current = null;
    coldCallTimeoutRef.current = null;
    setColdCallCountdown(0);
  }

  function abandonColdCall() {
    clearColdCallTimers();
    activeColdCallRef.current = null;
    coldCallSubmittingRef.current = false;
    coldCallStatusRef.current = "idle";
    setColdCallStatus("idle");
    setColdCallAttempt(null);
    setLiveColdCall(null);
  }

  function scheduleListening(delay = 360) {
    if (listenTimerRef.current !== null) window.clearTimeout(listenTimerRef.current);
    if (pausedRef.current) return;
    listenTimerRef.current = window.setTimeout(() => startListeningCycleRef.current(), delay);
  }

  async function streamAndSpeak(
    question: string,
    token: number,
    history: HistoryMessage[],
    lectureRequest: PresentationLectureRequest | null = null,
    lectureFollowUp = "",
  ) {
    const answerController = new AbortController();
    const speechController = new AbortController();
    answerAbortRef.current?.abort();
    stopSpeechPlayback();
    speechSequenceRef.current = 0;
    answerAbortRef.current = answerController;
    speechAbortRef.current = speechController;
    setPhase("thinking");
    setVoiceNotice("");
    setLiveAnswer("");
    setAnswerPanelOpen(true);
    let fullAnswer = "";
    let speechBuffer = "";

    try {
      const response = await fetch(lectureRequest ? "/api/presentation/explain" : "/api/avatar/local/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: lectureRequest
          ? JSON.stringify({
              version: lectureRequest.version,
              slideNumber: lectureRequest.slideNumber,
              ...(lectureFollowUp ? { followUp: lectureFollowUp.slice(0, 900) } : {}),
            })
          : JSON.stringify({ question, mode, history }),
        cache: "no-store",
        signal: answerController.signal,
      });
      if (!response.ok) throw await responseError(
        response,
        lectureRequest ? "PPT本页深度讲解暂时不可用，请稍后再试。" : "AI数字教师回答暂时不可用，请稍后再试。",
      );
      await consumeLocalStream(response, (delta) => {
        if (token !== flowTokenRef.current || answerController.signal.aborted) return;
        fullAnswer += delta;
        speechBuffer += delta;
        setLiveAnswer(fullAnswer.trim());
        const split = splitReliableRealtimeSpeech(speechBuffer, false);
        speechBuffer = split.remainder;
        split.segments.forEach((segment) => enqueueSpeech(segment, speechController));
      }, (meta) => {
        if (!meta.lecture || token !== flowTokenRef.current || answerController.signal.aborted) return;
        presentationContextRef.current = meta.lecture;
        setLectureMeta(meta.lecture);
      });
      if (token !== flowTokenRef.current || answerController.signal.aborted) return;
      const finalSplit = splitReliableRealtimeSpeech(speechBuffer, true);
      finalSplit.segments.forEach((segment) => enqueueSpeech(segment, speechController));
      await waitForSpeechIdle();
      if (token !== flowTokenRef.current || speechController.signal.aborted) return;
      const finalText = fullAnswer.trim();
      if (finalText) appendTranscript({ role: "teacher", text: finalText });
      setLiveAnswer("");
      setPhase("standby");
      scheduleListening();
    } catch (error) {
      if (answerController.signal.aborted || token !== flowTokenRef.current) return;
      stopSpeechPlayback();
      setVoiceNotice(`${errorMessage(error, lectureRequest ? "PPT本页讲解暂时不可用，请稍后再试。" : "AI数字教师回答暂时不可用，请稍后再试。")} AI教师仍在线等待，你可以继续提问。`);
      setPhase("standby");
      scheduleListening(1_200);
    } finally {
      if (answerAbortRef.current === answerController) answerAbortRef.current = null;
      if (speechAbortRef.current === speechController && !speechController.signal.aborted) speechAbortRef.current = null;
    }
  }

  async function answerQuestion(question: string, token: number) {
    const normalized = question.trim();
    if (normalized.length < 2 || token !== flowTokenRef.current) return;
    abandonColdCall();
    const history = transcriptHistory(transcriptRef.current);
    appendTranscript({ role: "student", text: normalized });
    const activePresentationRequest = activePresentationRequestRef.current;
    await streamAndSpeak(
      normalized,
      token,
      history,
      activePresentationRequest,
      activePresentationRequest ? normalized : "",
    );
  }

  async function explainPresentationPage(request: PresentationLectureRequest) {
    const token = ++flowTokenRef.current;
    if (listenTimerRef.current !== null) window.clearTimeout(listenTimerRef.current);
    listenTimerRef.current = null;
    answerAbortRef.current?.abort();
    answerAbortRef.current = null;
    voice.cancelRecording();
    stopSpeechPlayback();
    pausedRef.current = false;
    setPaused(false);
    setVoiceNotice("");
    setLiveColdCall(null);
    setLivePresentation(request);
    activePresentationRequestRef.current = request;
    setLectureMeta(null);
    presentationContextRef.current = null;
    setLiveAnswer("");
    setAnswerPanelOpen(true);
    setPhase("thinking");
    await streamAndSpeak("", token, [], request);
  }

  async function speakColdCallResult(text: string, token: number) {
    const normalized = text.trim();
    if (!normalized || token !== flowTokenRef.current) return;
    const speechController = new AbortController();
    speechAbortRef.current = speechController;
    setLiveAnswer(normalized);
    setAnswerPanelOpen(true);
    appendTranscript({ role: "teacher", text: normalized });
    setPhase("speaking");
    const speech = splitReliableRealtimeSpeech(normalized, true);
    speech.segments.forEach((segment) => enqueueSpeech(segment, speechController));
    try {
      await waitForSpeechIdle();
      if (token !== flowTokenRef.current || speechController.signal.aborted) return;
      setLiveAnswer("");
      pausedRef.current = true;
      setPaused(true);
      setPhase("standby");
      setVoiceNotice("本轮课堂提问已完成。教师可在工作台确认最终得分；点击“继续自动聆听”可恢复普通问答。");
    } catch (error) {
      if (!isAbortError(error) && token === flowTokenRef.current) {
        pausedRef.current = true;
        setPaused(true);
        setPhase("standby");
        setVoiceNotice("纠错结果已显示在文字侧栏；语音播放短时中断。");
      }
    } finally {
      if (speechAbortRef.current === speechController && !speechController.signal.aborted) speechAbortRef.current = null;
    }
  }

  async function completeColdCallAttempt(event: ColdCallBroadcast, studentAnswer: string, timedOut: boolean) {
    if (coldCallSubmittingRef.current || activeColdCallRef.current?.id !== event.id) return;
    coldCallSubmittingRef.current = true;
    clearColdCallTimers();
    flowTokenRef.current += 1;
    const token = flowTokenRef.current;
    voice.cancelRecording();
    stopSpeechPlayback();
    coldCallStatusRef.current = "evaluating";
    setColdCallStatus("evaluating");
    setPhase("thinking");
    setVoiceNotice(timedOut ? "教师已结束回答，正在读取标准答案……" : "已收到学生回答，正在依据本题标准答案与评分要点纠错……");
    if (!timedOut && studentAnswer.trim()) appendTranscript({ role: "student", text: studentAnswer.trim() });
    try {
      const response = await fetch("/api/classroom/cold-call", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(timedOut
          ? { action: "timeout", eventId: event.id }
          : { action: "evaluate", eventId: event.id, studentAnswer: studentAnswer.trim() }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; attempt?: ColdCallAttempt } | null;
      if (!response.ok || !payload?.attempt?.evaluation) throw new Error(payload?.error || "课堂回答纠错失败，请重试。");
      if (token !== flowTokenRef.current) return;
      const attempt = payload.attempt;
      setColdCallAttempt(attempt);
      coldCallStatusRef.current = attempt.timedOut ? "timed_out" : "feedback";
      setColdCallStatus(attempt.timedOut ? "timed_out" : "feedback");
      const evaluation = attempt.evaluation;
      const spoken = attempt.timedOut
        ? `${evaluation.feedback}${evaluation.standardAnswer ? `标准答案是：${evaluation.standardAnswer}` : evaluation.correction}`
        : `回答纠错结果：${evaluation.verdict}。${evaluation.feedback}${evaluation.correction ? ` ${evaluation.correction}` : ""}`;
      setVoiceNotice("");
      await speakColdCallResult(spoken, token);
    } catch (error) {
      if (token !== flowTokenRef.current) return;
      coldCallStatusRef.current = "feedback";
      setColdCallStatus("feedback");
      pausedRef.current = true;
      setPaused(true);
      setPhase("standby");
      setVoiceNotice(errorMessage(error, "课堂回答纠错失败，请由教师手动显示参考答案。"));
    } finally {
      coldCallSubmittingRef.current = false;
    }
  }

  function startColdCallAnswerWindow(event: ColdCallBroadcast) {
    clearColdCallTimers();
    activeColdCallRef.current = event;
    setColdCallAttempt(null);
    coldCallStatusRef.current = "waiting";
    setColdCallStatus("waiting");
    const seconds = Math.max(1, Math.min(60, Number(event.answerWindowSeconds || 60)));
    const deadline = Date.now() + seconds * 1_000;
    setColdCallCountdown(seconds);
    coldCallIntervalRef.current = window.setInterval(() => {
      setColdCallCountdown(Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)));
    }, 200);
    coldCallTimeoutRef.current = window.setTimeout(() => {
      setVoiceNotice("建议回答时间已到；可继续输入或确认回答，教师也可结束本题显示标准答案。");
    }, seconds * 1_000);
    scheduleListening(240);
  }

  async function announceColdCall(event: ColdCallBroadcast) {
    const announcement = event.spokenText.trim();
    if (!announcement) return;
    const token = ++flowTokenRef.current;
    if (listenTimerRef.current !== null) window.clearTimeout(listenTimerRef.current);
    listenTimerRef.current = null;
    answerAbortRef.current?.abort();
    answerAbortRef.current = null;
    voice.cancelRecording();
    stopSpeechPlayback();
    pausedRef.current = false;
    setPaused(false);
    setVoiceNotice("");
    clearColdCallTimers();
    activeColdCallRef.current = event;
    coldCallSubmittingRef.current = false;
    setLiveColdCall(event);
    coldCallStatusRef.current = "idle";
    setColdCallStatus("idle");
    setColdCallAttempt(null);
    setLivePresentation(null);
    setLectureMeta(null);
    activePresentationRequestRef.current = null;
    presentationContextRef.current = null;
    setLiveAnswer(announcement);
    setAnswerPanelOpen(true);
    appendTranscript({ role: "teacher", text: announcement });

    const speechController = new AbortController();
    speechAbortRef.current = speechController;
    setPhase("speaking");
    const speech = splitReliableRealtimeSpeech(announcement, true);
    speech.segments.forEach((segment) => enqueueSpeech(segment, speechController));
    try {
      await waitForSpeechIdle();
      if (token !== flowTokenRef.current || speechController.signal.aborted) return;
      setLiveAnswer("");
      setPhase("standby");
      startColdCallAnswerWindow(event);
    } catch (error) {
      if (!isAbortError(error) && token === flowTokenRef.current) {
        setVoiceNotice("课堂点名题目已同步到文字侧栏；语音短时中断，AI教师仍在线等待。");
        setPhase("standby");
        startColdCallAnswerWindow(event);
      }
    } finally {
      if (speechAbortRef.current === speechController && !speechController.signal.aborted) speechAbortRef.current = null;
    }
  }

  useEffect(() => {
    coldCallHandlerRef.current = announceColdCall;
    presentationLectureHandlerRef.current = explainPresentationPage;
    startListeningCycleRef.current = () => {
      if (!open || pausedRef.current) return;
      const coldCallEvent = activeColdCallRef.current;
      const answeringColdCall = Boolean(coldCallEvent && coldCallStatusRef.current === "waiting");
      const token = ++flowTokenRef.current;
      voice.clearError();
      setVoiceNotice("");
      setPhase("listening");
      void (async () => {
        try {
          const text = await voice.recordUntilSilence({
            language: "mixed",
            context: answeringColdCall
              ? `测绘专业外语课堂点名回答。当前题目：${coldCallEvent?.question.prompt || "课堂问题"}`
              : "测绘专业外语AI数字教师实时对话。重点识别测绘、摄影测量、GNSS、GIS、遥感和专业英语术语。",
            hotwords: ["surveying", "geodesy", "GNSS", "RTK", "total station", "photogrammetry", "remote sensing", "GIS", "测绘", "全站仪", "摄影测量", "遥感"],
          }, {
            silenceMs: 720,
            initialSpeechMs: 60_000,
            maximumMs: 60_000,
            threshold: 0.02,
          });
          if (token !== flowTokenRef.current || pausedRef.current) return;
          if (answeringColdCall && coldCallEvent) {
            setTypedQuestion(text.slice(0,2000));
            pausedRef.current=true;setPaused(true);setPhase("standby");
            setVoiceNotice("请核对下方识别文字，再点击“确认回答并讲评”。可修改文字或重新录制。");
          }
          else await answerQuestion(text, token);
        } catch (error) {
          if (token !== flowTokenRef.current || pausedRef.current) return;
          const message = errorMessage(error, "智能语音识别失败，请重新提问。");
          voice.clearError();
          setPhase("standby");
          if (answeringColdCall && coldCallEvent && activeColdCallRef.current?.id === coldCallEvent.id) {
            setVoiceNotice(isHardMicrophoneError(message)
              ? `${message} 请在下方输入学生回答，再确认讲评。`
              : "暂未听到清晰回答；可重新录制或在下方输入，确认后讲评。");
            return;
          }
          if (isHardMicrophoneError(message)) {
            pausedRef.current = true;
            setPaused(true);
            setVoiceNotice(`${message} 你仍可在下方输入文字提问。`);
            return;
          }
          setVoiceNotice(message.includes("没有检测到清晰说话声") ? "" : "这次没有听清，AI教师会自动继续等待。你无需关闭任何窗口。");
          scheduleListening(650);
        }
      })();
    };

    cleanupRef.current = () => {
      flowTokenRef.current += 1;
      pausedRef.current = true;
      if (listenTimerRef.current !== null) window.clearTimeout(listenTimerRef.current);
      listenTimerRef.current = null;
      answerAbortRef.current?.abort();
      answerAbortRef.current = null;
      clearColdCallTimers();
      activeColdCallRef.current = null;
      coldCallSubmittingRef.current = false;
      coldCallStatusRef.current = "idle";
      setColdCallStatus("idle");
      setColdCallAttempt(null);
      setLiveColdCall(null);
      voice.cancelRecording();
      stopSpeechPlayback();
      if (audioContextRef.current) void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
      audioAnalyserRef.current = null;
    };
  });

  useEffect(() => {
    if (!open || !liveAvatarReady || coldCallRequest || presentationLecture || preferredProvider === "lite") return;
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const poll = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/classroom/cold-call", {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json().catch(() => null) as { event?: ColdCallBroadcast | null } | null;
        const event = payload?.event;
        if (!active || !event?.id || event.id === lastColdCallIdRef.current) return;
        lastColdCallIdRef.current = event.id;
        await coldCallHandlerRef.current(event);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // 点名同步短时断线时保持静默；下一次轮询会自动恢复。
        }
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1_200);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [open, liveAvatarReady, coldCallRequest, presentationLecture, preferredProvider]);

  useEffect(() => {
    if (!open || !liveAvatarReady) {
      return;
    }
    const timer = window.setTimeout(() => {
      pausedRef.current = false;
      setPaused(false);
      setPhase("preparing");
      if (coldCallRequest && coldCallRequest.id !== lastColdCallIdRef.current) {
        lastColdCallIdRef.current = coldCallRequest.id;
        void coldCallHandlerRef.current(coldCallRequest);
      } else if (presentationLecture && presentationLecture.requestId !== lastPresentationLectureIdRef.current) {
        lastPresentationLectureIdRef.current = presentationLecture.requestId;
        void presentationLectureHandlerRef.current(presentationLecture);
      } else if (!coldCallRequest && !presentationLecture) {
        startListeningCycleRef.current();
      }
    }, 420);
    return () => {
      window.clearTimeout(timer);
      cleanupRef.current();
    };
  }, [liveAvatarReady, open, presentationLecture, coldCallRequest]);

  if (!open) return null;

  const displayPhase: Phase = voice.isTranscribing ? "transcribing" : phase;
  const latestStudent = [...transcript].reverse().find((item) => item.role === "student")?.text || "";
  const latestTeacher = liveAnswer || [...transcript].reverse().find((item) => item.role === "teacher")?.text || "";
  const displayedTeacher = readableAnswer(latestTeacher);
  const activePresentation = lectureMeta || livePresentation;
  const hasAnswerPanelContent = Boolean(displayedTeacher || activePresentation || liveColdCall);

  function interruptAndListen() {
    flowTokenRef.current += 1;
    answerAbortRef.current?.abort();
    answerAbortRef.current = null;
    voice.cancelRecording();
    stopSpeechPlayback();
    setLiveAnswer("");
    setVoiceNotice("");
    pausedRef.current = false;
    setPaused(false);
    setPhase("standby");
    if (coldCallStatusRef.current !== "waiting") abandonColdCall();
    scheduleListening(280);
  }

  function toggleListening() {
    if (paused) {
      if (coldCallStatusRef.current !== "waiting") abandonColdCall();
      pausedRef.current = false;
      setPaused(false);
      scheduleListening(180);
      return;
    }
    flowTokenRef.current += 1;
    pausedRef.current = true;
    setPaused(true);
    voice.cancelRecording();
    setPhase("standby");
  }

  function sendTypedQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = typedQuestion.trim();
    if (question.length < 2) return;
    const coldCallEvent = activeColdCallRef.current;
    if (coldCallEvent && coldCallStatusRef.current === "waiting") {
      setTypedQuestion("");
      void completeColdCallAttempt(coldCallEvent, question, false);
      return;
    }
    flowTokenRef.current += 1;
    const token = flowTokenRef.current;
    answerAbortRef.current?.abort();
    voice.cancelRecording();
    stopSpeechPlayback();
    setTypedQuestion("");
    pausedRef.current = false;
    setPaused(false);
    window.setTimeout(() => void answerQuestion(question, token), 120);
  }

  function closeMode() {
    cleanupRef.current();
    onClose();
  }

  return (
    <section className={styles.overlay} role="dialog" aria-modal="true" aria-label="全屏课堂数字教师模式">
      <div className={styles.environment} aria-hidden="true"><i /><i /><i /></div>
      <ClassroomAvatarStage preferredProvider={preferredProvider}
        active={open}
        onReady={handleLiveAvatarReady}
        panelOpen={Boolean(hasAnswerPanelContent && answerPanelOpen)}
        ref={liveAvatarRef}
      />

      <header className={styles.header}>
        <div className={styles.brand}>
          <b>AI DIGITAL TEACHER · VERSION 21 · TEACHER ONLY</b>
          <span>测绘专业外语 · 课堂数字人</span>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.setupLink} href="/liveavatar-setup">人物配置</Link>
          <span className={styles.localBadge}>LITE · 单路 · 480P · 现有演示知识库</span>
          <button onClick={() => { cleanupRef.current(); onFallbackVoice(); }} type="button">普通问答</button>
          <button onClick={closeMode} type="button">退出全屏</button>
        </div>
      </header>

      <div className={styles.statePill} aria-live="polite">
        <span className={styles["state_" + displayPhase]} />
        <strong>{paused ? "已暂停自动聆听" : PHASE_LABELS[displayPhase]}</strong>
      </div>

      {voiceNotice ? <div className={styles.voiceNotice} role="status">{voiceNotice}</div> : null}

      {hasAnswerPanelContent && answerPanelOpen ? (
        <aside className={styles.answerPanel} aria-label="AI教师完整文字回答">
          <div className={styles.panelToolbar}>
            <strong>{liveColdCall ? "课堂点名提问" : activePresentation ? "PPT本页深度讲解" : "AI教师完整回答"}</strong>
            <span>{liveColdCall ? "教师工作台实时同步" : activePresentation ? "词汇 · 短语 · 句式 · 全文翻译 · 重难点" : "侧栏显示，不遮挡数字教师"}</span>
            <button onClick={() => setAnswerPanelOpen(false)} type="button">隐藏回答</button>
          </div>
          {liveColdCall ? (
            <div className={styles.coldCallSummary}>
              <span>已点名</span>
              <strong>{liveColdCall.student.name}</strong>
              <small>{liveColdCall.student.studentNo} · {liveColdCall.question.source}</small>
              <p>{liveColdCall.question.prompt}</p>
              {coldCallStatus === "waiting" ? (
                <div className={styles.coldCallCountdown}>
                  <b>{coldCallCountdown}</b>
                  <span>秒建议回答时间</span>
                  <em>向教师电脑麦克风回答，核对转写后确认；到时不自动评分</em>
                </div>
              ) : null}
              {coldCallStatus === "evaluating" ? <div className={styles.coldCallEvaluating}>正在对照本题标准答案和评分要点进行纠错……</div> : null}
              {coldCallAttempt ? (
                <div className={styles.coldCallFeedback}>
                  <header><span>{coldCallAttempt.timedOut ? "超时" : "AI纠错"}</span><b>{coldCallAttempt.evaluation.verdict}</b><em>{coldCallAttempt.score}/10（教师确认前仅供参考）</em></header>
                  {coldCallAttempt.responseText ? <p><strong>学生回答：</strong>{coldCallAttempt.responseText}</p> : null}
                  <p><strong>纠错反馈：</strong>{coldCallAttempt.evaluation.feedback}</p>
                  <p><strong>规范改正：</strong>{coldCallAttempt.evaluation.correction}</p>
                  <p><strong>标准答案：</strong>{coldCallAttempt.evaluation.standardAnswer}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {!liveColdCall && activePresentation ? (
            <div className={styles.presentationSummary}>
              <span>正在讲解</span>
              <strong>第{activePresentation.slideNumber}页 / 共{activePresentation.slideCount}页</strong>
              <small>{activePresentation.presentationName}</small>
              <p>{"slideTitle" in activePresentation ? activePresentation.slideTitle : "正在提取本页原文并匹配演示课程知识…"}</p>
              {lectureMeta ? <em>提取{lectureMeta.extractedCharacters}字 · 教材术语匹配{lectureMeta.textbookGlossaryMatches}项{lectureMeta.citations.length ? ` · 关联${lectureMeta.citations.length}处课程依据` : ""}</em> : null}
            </div>
          ) : null}
          <div className={styles.transcriptScroller} ref={answerScrollerRef} aria-live="polite">
            {latestStudent ? <p className={styles.studentLine}><span>学生</span>{latestStudent}</p> : null}
            {displayedTeacher ? <p className={styles.teacherLine}><span>AI教师</span>{displayedTeacher}</p> : <p className={styles.lecturePreparing}><span>AI教师</span>正在读取当前页原文、核对教材术语并组织深度讲解…</p>}
          </div>
        </aside>
      ) : hasAnswerPanelContent ? (
        <button className={styles.answerToggle} onClick={() => setAnswerPanelOpen(true)} type="button">显示完整回答</button>
      ) : null}

      <div className={`${styles.controls} ${hasAnswerPanelContent && answerPanelOpen ? styles.controlsWithPanel : ""}`}>
        {displayPhase === "thinking" || displayPhase === "speaking" ? (
          <button className={styles.interrupt} onClick={interruptAndListen} type="button">打断老师 · 继续提问</button>
        ) : null}
        <button className={styles.listenButton} onClick={toggleListening} type="button">
          {paused ? "▶ 继续自动聆听" : voice.isRecording ? "● 麦克风正在收音" : "Ⅱ 暂停自动聆听"}
        </button>
        <form onSubmit={sendTypedQuestion}>
          <input maxLength={2000} aria-label={coldCallStatus === "waiting" ? "输入被点名学生的回答" : "文字提问"} onChange={(event) => setTypedQuestion(event.target.value)} placeholder={coldCallStatus === "waiting" ? "输入被点名学生的回答…" : "也可以输入文字提问…"} value={typedQuestion} />
          <button disabled={typedQuestion.trim().length < 2} type="submit">{coldCallStatus === "waiting" ? "确认回答并讲评" : "发送"}</button>
        </form>
      </div>

      {coldCallStatus === "waiting" && liveColdCall ? <div style={{position:'absolute',bottom:35,left:30,zIndex:20}}>
        <button type="button" onClick={()=>{voice.cancelRecording();flowTokenRef.current++;pausedRef.current=false;setPaused(false);startListeningCycleRef.current();}}>重新录制回答</button>
        <button type="button" onClick={()=>{if(confirm('结束本次回答并显示标准答案？'))void completeColdCallAttempt(liveColdCall,'',true);}}>结束回答并显示标准答案</button>
      </div> : null}
      <p className={styles.costNote}>21.7：语音点名→核对回答→数字人讲评；AI判定供参考，最终成绩由教师确认。</p>
    </section>
  );
}
