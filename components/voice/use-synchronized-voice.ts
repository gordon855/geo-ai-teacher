"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SpeechQueue } from "@/lib/step21-2/speech-queue.mjs";
import { visemeAtProgress } from "@/lib/step11-5/viseme-timeline";
import type { PhotoAvatarAudioSignals } from "../avatar/photo-avatar-stage";
import { useSmartVoice, type SpeakOptions } from "./use-smart-voice";
import { voiceClientId } from "./voice-client-id";

const rest = (): PhotoAvatarAudioSignals => ({ open: 0, wide: 0, round: 0, viseme: "rest" });
export function useSynchronizedVoice() {
  const input = useSmartVoice();
  const [isSpeaking, setSpeaking] = useState(false);
  const [isSpeechPending, setPending] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [speechError, setSpeechError] = useState("");
  const queueRef = useRef<SpeechQueue | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const audioSignals = useRef<PhotoAvatarAudioSignals>(rest());
  const mounted = useRef(true);
  const stopSpeaking = useCallback(() => {
    queueRef.current?.cancel(); queueRef.current = null;
    audioSignals.current = rest();
    if (mounted.current) { setSpeaking(false); setPending(false); setSpokenText(""); }
  }, []);
  const beginAnswer = useCallback((enabled = true, options: SpeakOptions = {}) => {
    stopSpeaking(); setSpeechError("");
    if (enabled) {
      try {
        if (!contextRef.current || contextRef.current.state === 'closed') contextRef.current = new AudioContext();
        void contextRef.current.resume().catch(() => {});
      } catch { /* Audio remains playable without analyser support. */ }
    }
    const queue = new SpeechQueue({
      fetchAudio: async (text: string, signal: AbortSignal) => {
        const response = await fetch('/api/voice/speech', {
          method: 'POST', signal, cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-Voice-Client-Id': voiceClientId() },
          body: JSON.stringify({ text, language: options.language || 'mixed', rate: options.rate }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.error?.message || '语音生成失败，文字回答仍可阅读；请点击朗读重试。');
        }
        return response.blob();
      },
      playAudio: (blob: Blob, text: string, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
        if (signal.aborted) { resolve(); return; }
        const url = URL.createObjectURL(blob); const audio = new Audio(url);
        let frame = 0; let ended = false;
        let source: MediaElementAudioSourceNode | null = null; let analyser: AnalyserNode | null = null;
        const context = contextRef.current;
        if (context?.state === 'running') {
          try { source = context.createMediaElementSource(audio); analyser = context.createAnalyser(); analyser.fftSize = 512; source.connect(analyser); analyser.connect(context.destination); } catch { source?.disconnect(); analyser = null; }
        }
        const samples = new Float32Array(512);
        const finish = (error?: unknown) => {
          if (ended) return; ended = true;
          signal.removeEventListener('abort', abort); cancelAnimationFrame(frame);
          audio.onended = null; audio.onerror = null; audio.onplaying = null;
          audio.pause(); audio.removeAttribute('src'); audio.load();
          source?.disconnect(); analyser?.disconnect(); URL.revokeObjectURL(url);
          if (queueRef.current === queue) { audioSignals.current = rest(); if (mounted.current) { setSpeaking(false); setSpokenText(''); } }
          if (error) reject(error); else resolve();
        };
        const abort = () => finish();
        const animate = () => {
          if (ended) return;
          let amplitude = 0;
          if (analyser) { analyser.getFloatTimeDomainData(samples); amplitude = Math.min(1, Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length) * 7); }
          const progress = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
          const viseme = visemeAtProgress(text, progress);
          const open = analyser ? amplitude : viseme === 'rest' || viseme === 'closed' ? 0 : 0.35;
          audioSignals.current = { open, wide: viseme === 'wide' ? 0.85 : 0.3, round: viseme === 'round' ? 0.85 : 0.2, viseme };
          frame = requestAnimationFrame(animate);
        };
        audio.onplaying = () => { if (!ended && mounted.current && queueRef.current === queue) { setSpeaking(true); setSpokenText(text); cancelAnimationFrame(frame); animate(); } };
        audio.onended = () => finish(); audio.onerror = () => finish(new Error('语音播放失败，请点击朗读重试。'));
        signal.addEventListener('abort', abort, { once: true });
        void audio.play().catch(() => finish(new Error('浏览器暂停了自动播放。文字已显示，请点击“朗读本答案”播放。')));
      }),
      onPending: (pending: boolean) => { if (mounted.current && queueRef.current === queue) setPending(pending); },
      onError: (error: unknown) => { if (mounted.current && queueRef.current === queue) setSpeechError(error instanceof Error ? error.message : '语音暂不可用，文字回答可继续阅读。'); },
    });
    queueRef.current = queue;
    if (!enabled) queue.cancel();
    return { push: (text: string) => queue.push(text), finish: (text: string) => queue.push(text, true) };
  }, [stopSpeaking]);
  const speak = useCallback(async (text: string, options: SpeakOptions = {}) => { beginAnswer(true, options).finish(text); }, [beginAnswer]);
  useEffect(() => { if (!input.autoSpeak) stopSpeaking(); }, [input.autoSpeak, stopSpeaking]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; queueRef.current?.cancel(); void contextRef.current?.close().catch(() => {}); }; }, []);
  return { ...input, isSpeaking, isSpeechPending, spokenText, audioSignals, beginAnswer, speak, stopSpeaking, clearError: () => { input.clearError(); setSpeechError(""); }, error: speechError || input.error };
}
