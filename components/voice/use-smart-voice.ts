"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { voiceClientId } from "./voice-client-id";

export type VoiceLanguage = "mixed" | "zh" | "en";

export type RecognitionOptions = {
  context?: string;
  hotwords?: string[];
  language?: VoiceLanguage;
};

export type SpeakOptions = {
  language?: VoiceLanguage;
  rate?: number;
};

type PendingStop = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  options: RecognitionOptions;
};

function voiceMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return new Error(payload?.error?.message || fallback);
}

function recorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((value) => MediaRecorder.isTypeSupported(value)) || "";
}

function extensionForMime(value: string) {
  if (value.includes("ogg")) return "ogg";
  if (value.includes("mp4")) return "mp4";
  return "webm";
}

function speechChunks(value: string) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return [];
  const sentences = normalized.match(/[^。！？!?；;]+[。！？!?；;]?/gu)?.map((item) => item.trim()).filter(Boolean) || [normalized];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > 480) {
      push();
      for (let offset = 0; offset < sentence.length; offset += 420) chunks.push(sentence.slice(offset, offset + 420));
      continue;
    }
    if (current && current.length + sentence.length > (chunks.length === 0 ? 100 : 280)) push();
    current += sentence;
  }
  push();
  return chunks;
}

export function useSmartVoice() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptionRef = useRef<AbortController | null>(null);
  const recordingGeneration = useRef(0);
  const pendingStopRef = useRef<PendingStop | null>(null);
  const maxRecordingTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");
  const speechAbortRef = useRef<AbortController | null>(null);
  const vadCleanupRef = useRef<(() => void) | null>(null);
  const vadAbortRef = useRef<(() => void) | null>(null);

  const clearError = useCallback(() => setError(""), []);

  const releaseMicrophone = useCallback(() => {
    if (maxRecordingTimerRef.current !== null) window.clearTimeout(maxRecordingTimerRef.current);
    maxRecordingTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob, options: RecognitionOptions) => {
    transcriptionRef.current?.abort();
    const transcription = new AbortController();
    transcriptionRef.current = transcription;
    setIsTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, `student-voice.${extensionForMime(blob.type)}`);
      form.append("context", String(options.context || "").slice(0, 1_000));
      form.append("hotwords", JSON.stringify((options.hotwords || []).slice(0, 40)));
      form.append("language", options.language || "mixed");
      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "X-Voice-Client-Id": voiceClientId() },
        body: form,
        signal: transcription.signal,
        cache: "no-store",
      });
      if (!response.ok) throw await responseError(response, "智能语音识别失败，请重新录制。");
      const payload = await response.json() as { text?: string };
      const text = String(payload.text || "").trim();
      if (!text) throw new Error("没有识别到清晰语音，请靠近麦克风后重试。");
      return text;
    } finally {
      if (transcriptionRef.current === transcription) { transcriptionRef.current = null; setIsTranscribing(false); }
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    if (isRecording || isTranscribing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      const message = "当前浏览器无法使用麦克风录音。请用最新版Chrome、Edge或Safari，并确认网页使用HTTPS。";
      setError(message);
      throw new Error(message);
    }
    const generation = ++recordingGeneration.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (generation !== recordingGeneration.current) { stream.getTracks().forEach(track => track.stop()); throw new DOMException("录音已取消", "AbortError"); }
      const mimeType = recorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 })
        : new MediaRecorder(stream, { audioBitsPerSecond: 64_000 });
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const pending = pendingStopRef.current;
        pendingStopRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        chunksRef.current = [];
        releaseMicrophone();
        if (!pending) return;
        void transcribeBlob(blob, pending.options)
          .then(pending.resolve)
          .catch((stopError) => {
            if (stopError instanceof DOMException && stopError.name === "AbortError") { pending.reject(stopError); return; }
            const message = voiceMessage(stopError, "智能语音识别失败，请重试。");
            setError(message);
            pending.reject(new Error(message));
          });
      };
      recorder.onerror = () => {
        const message = "录音没有正常完成，请检查麦克风权限后重试。";
        setError(message);
        pendingStopRef.current?.reject(new Error(message));
        pendingStopRef.current = null;
        releaseMicrophone();
      };
      recorder.start(250);
      setIsRecording(true);
      maxRecordingTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 120_000);
    } catch (startError) {
      releaseMicrophone();
      if (startError instanceof DOMException && startError.name === "AbortError") throw startError;
      const denied = startError instanceof DOMException && (startError.name === "NotAllowedError" || startError.name === "SecurityError");
      const message = denied
        ? "麦克风权限未开启，请在浏览器地址栏允许本网站使用麦克风。"
        : voiceMessage(startError, "无法启动麦克风，请检查设备后重试。");
      setError(message);
      throw new Error(message);
    }
  }, [isRecording, isTranscribing, releaseMicrophone, transcribeBlob]);

  const stopRecording = useCallback((options: RecognitionOptions = {}) => {
    setError("");
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return Promise.reject(new Error("当前没有正在进行的录音。"));
    return new Promise<string>((resolve, reject) => {
      pendingStopRef.current = { resolve, reject, options };
      recorder.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    recordingGeneration.current += 1;
    transcriptionRef.current?.abort();
    transcriptionRef.current = null;
    setIsTranscribing(false);
    const abortVad = vadAbortRef.current;
    vadAbortRef.current = null;
    if (abortVad) abortVad();
    else vadCleanupRef.current?.();
    vadCleanupRef.current = null;
    pendingStopRef.current?.reject(new DOMException("录音已取消", "AbortError"));
    pendingStopRef.current = null;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else releaseMicrophone();
  }, [releaseMicrophone]);

  const recordUntilSilence = useCallback(async (
    options: RecognitionOptions = {},
    vadOptions: { silenceMs?: number; initialSpeechMs?: number; maximumMs?: number; threshold?: number } = {},
  ) => {
    await startRecording();
    const stream = streamRef.current;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!stream || !AudioContextClass) {
      const message = "当前浏览器无法自动判断语音结束，请更新Chrome、Edge或Safari后重试。";
      setError(message);
      cancelRecording();
      throw new Error(message);
    }
    const context = new AudioContextClass();
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const threshold = Math.max(0.008, Math.min(0.08, vadOptions.threshold ?? 0.018));
    const silenceMs = Math.max(550, Math.min(2_500, vadOptions.silenceMs ?? 700));
    const initialSpeechMs = Math.max(3_000, Math.min(60_000, vadOptions.initialSpeechMs ?? 8_000));
    const maximumMs = Math.max(10_000, Math.min(90_000, vadOptions.maximumMs ?? 45_000));
    const startedAt = performance.now();
    let lastSpeechAt = startedAt;
    let speechStarted = false;
    let animationFrame = 0;
    let settled = false;
    let abortVad: (() => void) | null = null;

    const cleanup = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      source.disconnect();
      analyser.disconnect();
      void context.close().catch(() => undefined);
      if (vadCleanupRef.current === cleanup) vadCleanupRef.current = null;
      if (vadAbortRef.current === abortVad) vadAbortRef.current = null;
    };
    vadCleanupRef.current?.();
    vadCleanupRef.current = cleanup;

    return new Promise<string>((resolve, reject) => {
      abortVad = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new DOMException("录音已取消", "AbortError"));
      };
      vadAbortRef.current = abortVad;
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        void stopRecording(options).then(resolve).catch(reject);
      };
      const failWithoutSpeech = () => {
        if (settled) return;
        settled = true;
        cleanup();
        cancelRecording();
        const message = "没有检测到清晰说话声，请靠近麦克风后重新提问。";
        setError(message);
        reject(new Error(message));
      };
      const detect = () => {
        if (settled) return;
        analyser.getFloatTimeDomainData(samples);
        let squareSum = 0;
        for (const sample of samples) squareSum += sample * sample;
        const rms = Math.sqrt(squareSum / samples.length);
        const now = performance.now();
        if (rms >= threshold) {
          speechStarted = true;
          lastSpeechAt = now;
        }
        if (speechStarted && now - lastSpeechAt >= silenceMs) {
          finish();
          return;
        }
        if (!speechStarted && now - startedAt >= initialSpeechMs) {
          failWithoutSpeech();
          return;
        }
        if (now - startedAt >= maximumMs) {
          if (speechStarted) finish();
          else failWithoutSpeech();
          return;
        }
        animationFrame = requestAnimationFrame(detect);
      };
      animationFrame = requestAnimationFrame(detect);
    });
  }, [cancelRecording, startRecording, stopRecording]);

  const stopSpeaking = useCallback(() => {
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = "";
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string, options: SpeakOptions = {}) => {
    const chunks = speechChunks(text);
    if (!chunks.length) return;
    stopSpeaking();
    setError("");
    setIsSpeaking(true);
    const controller = new AbortController();
    speechAbortRef.current = controller;
    try {
      const fetchChunk = async (chunk: string) => {
        const response = await fetch("/api/voice/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Voice-Client-Id": voiceClientId() },
          body: JSON.stringify({ text: chunk, language: options.language || "mixed", rate: options.rate }),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw await responseError(response, "AI教师语音生成失败，请重试。");
        return response.blob();
      };
      let nextAudio = fetchChunk(chunks[0]);
      for (let index = 0; index < chunks.length; index += 1) {
        const blob = await nextAudio;
        if (controller.signal.aborted) return;
        if (index + 1 < chunks.length) {nextAudio = fetchChunk(chunks[index + 1]);void nextAudio.catch(()=>{});}
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        await new Promise<void>((resolve, reject) => {
          const done=(error?:unknown)=>{controller.signal.removeEventListener('abort',abort);audio.onended=null;audio.onerror=null;if(error)reject(error);else resolve();};
          const abort=()=>{audio.pause();done();};
          controller.signal.addEventListener('abort',abort,{once:true});
          if(controller.signal.aborted){abort();return;}
          audio.onended=()=>done();audio.onerror=()=>done(new Error("AI教师语音播放失败，请重试。"));void audio.play().catch(done);
        });
        URL.revokeObjectURL(url);
        if (audioUrlRef.current === url) audioUrlRef.current = "";
      }
    } catch (speakError) {
      if (!controller.signal.aborted) {
        const message = voiceMessage(speakError, "AI教师语音播放失败，请重试。");
        setError(message);
      }
    } finally {
      if (speechAbortRef.current === controller) {speechAbortRef.current = null;audioRef.current = null;setIsSpeaking(false);}
    }
  }, [stopSpeaking]);

  useEffect(() => () => {
    recordingGeneration.current += 1;
    transcriptionRef.current?.abort();
    pendingStopRef.current?.reject(new DOMException("录音已取消", "AbortError"));
    pendingStopRef.current = null;
    vadAbortRef.current?.();
    vadAbortRef.current = null;
    vadCleanupRef.current?.();
    vadCleanupRef.current = null;
    if (maxRecordingTimerRef.current !== null) window.clearTimeout(maxRecordingTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    speechAbortRef.current?.abort();
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  return {
    isRecording,
    isTranscribing,
    isSpeaking,
    autoSpeak,
    setAutoSpeak,
    error,
    clearError,
    startRecording,
    stopRecording,
    recordUntilSilence,
    cancelRecording,
    speak,
    stopSpeaking,
  };
}
