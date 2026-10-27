"use client";

import Link from "next/link";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { LiveAvatarSession as LiveAvatarSessionType } from "@heygen/liveavatar-web-sdk";
import { speechBlobToPcmSegments } from "@/lib/step11-6/audio-pcm";
import styles from "./liveavatar-stage.module.css";

const AVATAR_ID_KEY = "surveying-ai-teacher.liveavatar-avatar-id";
const AVATAR_NAME_KEY = "surveying-ai-teacher.liveavatar-avatar-name";

type StageState = "connecting" | "ready" | "missing" | "error";

export type LiveAvatarStageHandle = {
  isReady: () => boolean;
  schedule: (blob: Blob, signal: AbortSignal) => Promise<{ finished: Promise<void> }>;
  interrupt: () => void;
  stop: () => Promise<void>;
};

type PendingPlayback = {
  remainingSegments: number;
  durationSeconds: number;
  signal: AbortSignal;
  abort: () => void;
  timer: number;
  settled: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
};

type SessionPayload = {
  sessionToken?: string;
  leaseId?: string;
  error?: { code?: string; message?: string };
};

class SessionRequestError extends Error {
  code: string;
  retryAfter: number;

  constructor(message: string, code = "", retryAfter = 1) {
    super(message);
    this.name = "SessionRequestError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function sessionError(response: Response) {
  const payload = await response.json().catch(() => null) as SessionPayload | null;
  return new SessionRequestError(
    payload?.error?.message || `LiveAvatar连接失败（${response.status}）。`,
    payload?.error?.code,
    Math.max(1, Number(response.headers.get("retry-after") || 1)),
  );
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

const LiveAvatarStage = forwardRef<LiveAvatarStageHandle, {
  active: boolean;
  panelOpen?: boolean;
  onReady: (ready: boolean) => void;
}>(function LiveAvatarStage({ active, panelOpen = false, onReady }, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<LiveAvatarSessionType | null>(null);
  const leaseIdRef = useRef("");
  const readyRef = useRef(false);
  const endingRef = useRef(false);
  const heartbeatTimerRef = useRef<number | null>(null);
  const pendingPlaybackRef = useRef<PendingPlayback[]>([]);
  const [stageState, setStageState] = useState<StageState>("connecting");
  const [detail, setDetail] = useState("正在连接LiveAvatar真人教师…");
  const [avatarName, setAvatarName] = useState("已选择的人物");
  const [needsPlay, setNeedsPlay] = useState(false);

  const releaseLease = useCallback(async (leaseId: string) => {
    if (!leaseId) return;
    await fetch("/api/liveavatar/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaseId }),
      cache: "no-store",
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) window.clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = null;
  }, []);

  const startHeartbeat = useCallback((leaseId: string) => {
    stopHeartbeat();
    heartbeatTimerRef.current = window.setInterval(() => {
      void fetch("/api/liveavatar/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaseId }),
        cache: "no-store",
      }).catch(() => undefined);
    }, 15_000);
  }, [stopHeartbeat]);

  const settlePlayback = useCallback((entry: PendingPlayback, error?: Error) => {
    if (entry.settled) return;
    entry.settled = true;
    window.clearTimeout(entry.timer);
    entry.signal.removeEventListener("abort", entry.abort);
    const index = pendingPlaybackRef.current.indexOf(entry);
    if (index >= 0) pendingPlaybackRef.current.splice(index, 1);
    if (error) entry.reject(error);
    else entry.resolve();
  }, []);

  const rejectPendingPlayback = useCallback((error: Error) => {
    const pending = pendingPlaybackRef.current.splice(0);
    for (const entry of pending) {
      if (entry.settled) continue;
      entry.settled = true;
      window.clearTimeout(entry.timer);
      entry.signal.removeEventListener("abort", entry.abort);
      entry.reject(error);
    }
  }, []);

  const stopSession = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    const session = sessionRef.current;
    const leaseId = leaseIdRef.current;
    sessionRef.current = null;
    leaseIdRef.current = "";
    readyRef.current = false;
    onReady(false);
    stopHeartbeat();
    try {
      rejectPendingPlayback(new DOMException("LiveAvatar会话已结束", "AbortError"));
      session?.interrupt();
      if (session) await session.stop().catch(() => undefined);
    } finally {
      await releaseLease(leaseId);
      endingRef.current = false;
    }
  }, [onReady, rejectPendingPlayback, releaseLease, stopHeartbeat]);

  useImperativeHandle(ref, () => ({
    isReady: () => readyRef.current && Boolean(sessionRef.current),
    schedule: async (blob, signal) => {
      const session = sessionRef.current;
      if (!session || !readyRef.current) throw new Error("LiveAvatar真人教师尚未连接完成。");
      const segments = await speechBlobToPcmSegments(blob, signal);
      if (!segments.length) throw new Error("LiveAvatar没有收到有效语音数据。");
      let resolveFinished!: () => void;
      let rejectFinished!: (error: Error) => void;
      const finished = new Promise<void>((resolve, reject) => {
        resolveFinished = resolve;
        rejectFinished = reject;
      });
      const durationSeconds = segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);
      const aheadSeconds = pendingPlaybackRef.current.reduce((sum, entry) => sum + entry.durationSeconds, 0);
      const entry: PendingPlayback = {
        remainingSegments: segments.length,
        durationSeconds,
        signal,
        abort: () => undefined,
        timer: 0,
        settled: false,
        resolve: resolveFinished,
        reject: rejectFinished,
      };
      entry.abort = () => {
        session.interrupt();
        rejectPendingPlayback(new DOMException("语音已中断", "AbortError"));
      };
      entry.timer = window.setTimeout(() => {
        session.interrupt();
        rejectPendingPlayback(new Error("LiveAvatar语音播放等待超时。"));
      }, Math.max(20_000, (aheadSeconds + durationSeconds + 20) * 1_000));
      signal.addEventListener("abort", entry.abort, { once: true });
      pendingPlaybackRef.current.push(entry);
      try {
        for (const segment of segments) session.repeatAudio(segment.base64);
      } catch (error) {
        session.interrupt();
        rejectPendingPlayback(error instanceof Error ? error : new Error("LiveAvatar没有接收语音。"));
        throw error;
      }
      return { finished };
    },
    interrupt: () => {
      sessionRef.current?.interrupt();
      rejectPendingPlayback(new DOMException("语音已中断", "AbortError"));
    },
    stop: stopSession,
  }));

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const avatarId = window.localStorage.getItem(AVATAR_ID_KEY) || "";
    const storedName = window.localStorage.getItem(AVATAR_NAME_KEY) || "";
    if (storedName) setAvatarName(storedName);
    if (!avatarId) {
      setStageState("missing");
      setDetail("尚未选择LiveAvatar人物。先进入配置页，从人物列表中选择已经确定的女教师。");
      onReady(false);
      return;
    }

    setStageState("connecting");
    setDetail("正在建立单路LITE真人视频会话…");
    void (async () => {
      try {
        let payload: SessionPayload | null = null;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const response = await fetch("/api/liveavatar/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatarId }),
            cache: "no-store",
          });
          if (response.ok) {
            payload = await response.json() as SessionPayload;
            break;
          }
          const error = await sessionError(response);
          if (error.code !== "LIVEAVATAR_SINGLE_SESSION_BUSY" || attempt === 7 || cancelled) throw error;
          setDetail("正在清理上一连接，稍候自动重试…");
          await delay(Math.min(1_500, error.retryAfter * 1_000));
        }
        if (!payload) throw new Error("LiveAvatar会话申请没有完成。");
        if (!payload.sessionToken || !payload.leaseId) throw new Error("LiveAvatar没有返回有效的短期会话令牌。");
        if (cancelled) {
          await releaseLease(payload.leaseId);
          return;
        }
        leaseIdRef.current = payload.leaseId;
        startHeartbeat(payload.leaseId);
        const sdk = await import("@heygen/liveavatar-web-sdk");
        const session = new sdk.LiveAvatarSession(payload.sessionToken, { voiceChat: false });
        sessionRef.current = session;
        session.on(sdk.AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
          const entry = pendingPlaybackRef.current[0];
          if (!entry || entry.settled) return;
          entry.remainingSegments -= 1;
          if (entry.remainingSegments <= 0) settlePlayback(entry);
        });
        session.on(sdk.SessionEvent.SESSION_STREAM_READY, () => {
          if (videoRef.current) {
            session.attach(videoRef.current);
            void videoRef.current.play().catch(() => setNeedsPlay(true));
          }
        });
        session.on(sdk.SessionEvent.SESSION_DISCONNECTED, () => {
          rejectPendingPlayback(new Error("LiveAvatar会话已断开。"));
          readyRef.current = false;
          onReady(false);
          const disconnectedLeaseId = leaseIdRef.current;
          leaseIdRef.current = "";
          stopHeartbeat();
          void releaseLease(disconnectedLeaseId);
          if (!cancelled) {
            setStageState("error");
            setDetail("LiveAvatar会话已断开。退出全屏后重新进入即可建立新会话。");
          }
        });
        await session.start();
        if (cancelled) {
          await stopSession();
          return;
        }
        if (videoRef.current) {
          session.attach(videoRef.current);
          void videoRef.current.play().catch(() => setNeedsPlay(true));
        }
        readyRef.current = true;
        setStageState("ready");
        setDetail("LiveAvatar真人教师已连接");
        onReady(true);
      } catch (error) {
        if (cancelled) return;
        readyRef.current = false;
        onReady(false);
        setStageState("error");
        setDetail(messageOf(error, "LiveAvatar真人教师连接失败。"));
        await stopSession();
      }
    })();

    return () => {
      cancelled = true;
      void stopSession();
    };
  }, [active, onReady, rejectPendingPlayback, releaseLease, settlePlayback, startHeartbeat, stopHeartbeat, stopSession]);

  return (
    <div className={styles.stage} data-panel-open={panelOpen ? "true" : "false"} data-state={stageState}>
      <video aria-label={`${avatarName}实时视频`} autoPlay className={styles.video} playsInline ref={videoRef} />
      {stageState !== "ready" ? (
        <div className={styles.statusCard} role={stageState === "error" ? "alert" : "status"}>
          <span>{stageState === "connecting" ? "LIVE" : "SETUP"}</span>
          <strong>{stageState === "connecting" ? "正在启动真人AI教师" : "LiveAvatar需要配置"}</strong>
          <p>{detail}</p>
          {stageState !== "connecting" ? <Link href="/liveavatar-setup">打开人物配置页</Link> : null}
        </div>
      ) : null}
      {needsPlay ? (
        <button className={styles.playButton} onClick={() => {
          void videoRef.current?.play().then(() => setNeedsPlay(false));
        }} type="button">点击启用真人教师声音</button>
      ) : null}
      <div className={styles.networkBadge}><i />{stageState === "ready" ? `${avatarName} · 480P · H.264` : detail}</div>
    </div>
  );
});

export default LiveAvatarStage;
