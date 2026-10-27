"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./fullscreen-digital-teacher.module.css";

type AvatarSdk = typeof import("lm-avatar-chat-sdk");
type AvatarInstance = ReturnType<AvatarSdk["createAvatar"]>;
type Phase = "preparing" | "waiting" | "connecting" | "listening" | "thinking" | "responding" | "standby" | "error";

type SessionPayload = {
  ok?: boolean;
  lease_id?: string;
  session_id?: string;
  rtc?: {
    appId?: string;
    avatarUserId?: string;
    channel?: string;
    clientUserId?: string;
    serverUserId?: string;
    token?: string;
    nonce?: string;
    timestamp?: number;
  };
  queue?: { active?: number; limit?: number; position?: number; designed_capacity?: number };
  error?: { message?: string; code?: string };
};

type Transcript = { role: "student" | "teacher"; text: string };

const PHASE_LABELS: Record<Phase, string> = {
  preparing: "正在申请数字教师通道",
  waiting: "通道繁忙 · 正在排队",
  connecting: "正在建立实时数字人连接",
  listening: "正在聆听 · 请直接说话",
  thinking: "正在检索课程资料",
  responding: "AI数字教师正在回答",
  standby: "数字教师在线 · 随时提问",
  error: "数字教师暂时不可用",
};

function phaseFromProvider(state: string): Phase {
  if (state === "Listening") return "listening";
  if (state === "Thinking") return "thinking";
  if (state === "Responding") return "responding";
  return "standby";
}

async function responseMessage(response: Response) {
  const payload = await response.json().catch(() => null) as SessionPayload | null;
  return { payload, message: payload?.error?.message || "AI数字教师暂时无法建立连接。" };
}

export default function FullscreenDigitalTeacher({
  open,
  onClose,
  onFallbackVoice,
}: {
  open: boolean;
  onClose: () => void;
  onFallbackVoice: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const avatarRef = useRef<AvatarInstance | null>(null);
  const leaseRef = useRef("");
  const providerSessionRef = useRef("");
  const sdkRef = useRef<AvatarSdk | null>(null);
  const [phase, setPhase] = useState<Phase>("preparing");
  const [error, setError] = useState("");
  const [frameReady, setFrameReady] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [queueLabel, setQueueLabel] = useState("");
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [typedQuestion, setTypedQuestion] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let retryTimer: number | null = null;
    let firstAttempt = true;

    const releaseLease = () => {
      const leaseId = leaseRef.current;
      const sessionId = providerSessionRef.current;
      leaseRef.current = "";
      providerSessionRef.current = "";
      if (!leaseId) return;
      void fetch("/api/avatar/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lease_id: leaseId, session_id: sessionId }),
        cache: "no-store",
        keepalive: true,
      }).catch(() => undefined);
    };

    const stopAvatar = () => {
      try {
        avatarRef.current?.exit();
      } catch {
        // Best-effort cleanup; the server lease still expires automatically.
      }
      avatarRef.current = null;
      releaseLease();
    };

    const connect = async () => {
      if (cancelled) return;
      if (firstAttempt) {
        firstAttempt = false;
        setError("");
        setFrameReady(false);
        setMicMuted(false);
        setQueueLabel("");
        setTranscript([]);
      }
      setPhase("preparing");
      try {
        const response = await fetch("/api/avatar/session", { method: "POST", cache: "no-store" });
        const { payload, message } = await responseMessage(response);
        if (cancelled) return;
        if (response.status === 429) {
          const active = Number(payload?.queue?.active || 0);
          const limit = Number(payload?.queue?.limit || 1);
          const position = Number(payload?.queue?.position || 1);
          setPhase("waiting");
          setQueueLabel(`当前已占用 ${active}/${limit} 路 · 等待位 ${position}`);
          const retryAfter = Math.max(3, Number(response.headers.get("retry-after") || 5));
          retryTimer = window.setTimeout(() => void connect(), retryAfter * 1_000);
          return;
        }
        if (!response.ok || !payload?.ok || !payload.lease_id || !payload.session_id || !payload.rtc) {
          setPhase("error");
          setError(message);
          return;
        }
        leaseRef.current = payload.lease_id;
        providerSessionRef.current = payload.session_id;
        setPhase("connecting");
        const sdk = await import("lm-avatar-chat-sdk");
        sdkRef.current = sdk;
        if (cancelled || !videoRef.current) {
          releaseLease();
          return;
        }
        const rtc = payload.rtc;
        const avatar = sdk.createAvatar(sdk.TYAvatarType.cloudAvatar, {
          appId: String(rtc.appId || ""),
          channel: String(rtc.channel || ""),
          timestamp: Number(rtc.timestamp || 0),
          token: String(rtc.token || ""),
          clientUserId: String(rtc.clientUserId || ""),
          clientUserName: "surveying-student",
          serverUserId: String(rtc.serverUserId || ""),
          avatarUserId: String(rtc.avatarUserId || ""),
          sessionId: payload.session_id,
          rootContainer: videoRef.current,
          ignoreAudioInput: false,
        });
        avatarRef.current = avatar;
        avatar.onFirstFrameReceived(() => {
          if (!cancelled) setFrameReady(true);
        });
        avatar.onReadyToSpeech(() => {
          if (!cancelled) setPhase("listening");
        });
        avatar.onStateChanged((state) => {
          if (!cancelled) setPhase(phaseFromProvider(String(state)));
        });
        avatar.onMessageReceived((message) => {
          const text = String(message.text || "").trim();
          if (!text || !message.isFinished || cancelled) return;
          const role: Transcript["role"] = Number(message.type) === Number(sdk.TYVoiceChatMessageType.speaking) ? "student" : "teacher";
          setTranscript((current) => [...current.slice(-3), { role, text }]);
        });
        avatar.onErrorReceived((providerError) => {
          if (cancelled) return;
          setError(`数字教师连接异常（${String(providerError.code)}）。请退出后重试。`);
          if (providerError.terminate) setPhase("error");
        });
        await avatar.start({ mode: sdk.TYVoiceChatMode.duplex, outboundSampleRate: 24_000 });
      } catch (connectError) {
        stopAvatar();
        if (cancelled) return;
        setPhase("error");
        setError(connectError instanceof Error && connectError.message ? connectError.message : "AI数字教师连接失败，请稍后重试。");
      }
    };

    void connect();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      stopAvatar();
      sdkRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  function toggleMicrophone() {
    const avatar = avatarRef.current;
    if (!avatar) return;
    setMicMuted((current) => {
      const next = !current;
      avatar.muteLocalMic(next);
      return next;
    });
  }

  function interruptTeacher() {
    avatarRef.current?.interrupt();
    setPhase("listening");
  }

  async function sendTypedQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = typedQuestion.trim();
    const avatar = avatarRef.current;
    if (!avatar || !question || phase === "thinking" || phase === "responding") return;
    try {
      const sdk = sdkRef.current || await import("lm-avatar-chat-sdk");
      sdkRef.current = sdk;
      avatar.requestToRespond(sdk.IRequestToRespondType.prompt, question);
      setTranscript((current) => [...current.slice(-3), { role: "student", text: question }]);
      setTypedQuestion("");
      setPhase("thinking");
    } catch {
      setError("文本提问没有发送成功，请直接说话或稍后再试。");
    }
  }

  const controlsAvailable = phase === "listening" || phase === "standby" || phase === "thinking" || phase === "responding";

  return (
    <section className={styles.overlay} role="dialog" aria-modal="true" aria-label="全屏AI数字教师模式">
      <video autoPlay className={`${styles.avatarVideo} ${frameReady ? styles.avatarVideoReady : ""}`} muted playsInline ref={videoRef} />
      <div className={styles.backdrop} aria-hidden="true"><i /><i /><i /></div>
      <header className={styles.header}>
        <div className={styles.brand}>
          <b>AI DIGITAL TEACHER</b>
          <span>测绘专业外语 · 实时数字教师</span>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.aiLabel}>AI生成 · 数字人合成</span>
          <button onClick={onClose} type="button">退出全屏</button>
        </div>
      </header>

      <div className={styles.centerState} aria-live="polite">
        <span className={`${styles.stateDot} ${styles[`state_${phase}`]}`} />
        <strong>{PHASE_LABELS[phase]}</strong>
        {queueLabel ? <small>{queueLabel}</small> : null}
      </div>

      {!frameReady && phase !== "error" ? (
        <div className={styles.loader}><i /><i /><i /><span>{PHASE_LABELS[phase]}</span></div>
      ) : null}

      <div className={styles.subtitlePanel} aria-live="polite">
        {transcript.length ? transcript.slice(-2).map((item, index) => (
          <p className={item.role === "teacher" ? styles.teacherLine : styles.studentLine} key={`${item.role}-${index}-${item.text.slice(0, 20)}`}>
            <span>{item.role === "teacher" ? "AI教师" : "学生"}</span>{item.text}
          </p>
        )) : <p className={styles.hintLine}>进入后无需再点发送。听到提示后直接说话，停顿后系统会自动完成识别并回答。</p>}
      </div>

      <div className={styles.controls}>
        {phase === "responding" || phase === "thinking" ? <button className={styles.interrupt} onClick={interruptTeacher} type="button">打断并继续提问</button> : null}
        <button disabled={!controlsAvailable} onClick={toggleMicrophone} type="button">{micMuted ? "开启麦克风" : "麦克风已开启"}</button>
        <form onSubmit={sendTypedQuestion}>
          <input aria-label="文字提问" disabled={!controlsAvailable} onChange={(event) => setTypedQuestion(event.target.value)} placeholder="也可以输入文字提问…" value={typedQuestion} />
          <button disabled={!typedQuestion.trim() || !controlsAvailable} type="submit">发送</button>
        </form>
      </div>

      {error ? (
        <div className={styles.errorCard} role="alert">
          <strong>数字教师暂未连接</strong>
          <p>{error}</p>
          <div><button onClick={onFallbackVoice} type="button">使用低延迟语音问答</button><button onClick={onClose} type="button">返回普通页面</button></div>
        </div>
      ) : null}
    </section>
  );
}
