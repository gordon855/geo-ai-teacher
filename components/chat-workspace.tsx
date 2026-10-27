"use client";

import {sourceLocation,sourceTitle,displayCitations} from "@/lib/step20-1/source-display.mjs";

import PhotoAvatarStage from "./avatar/photo-avatar-stage";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  apiErrorFromPayload,
  buildHistoryPayload,
  CHAT_MODE_OPTIONS,
  ChatUiError,
  modeLabel,
  normalizeChatPayload,
  restoreSession,
  serializeSession,
  type ChatMessage,
  type ChatMode,
  type CourseSource,
} from "@/lib/step5/chat-client";
import styles from "./chat-workspace.module.css";
import Workstation from "./workstations/workstation";

import {MotionSwitch} from "./workstations/motion";
import { readChatStream } from "@/lib/step19/chat-stream";
import { useSynchronizedVoice } from "./voice/use-synchronized-voice";
import KeyAnalysisWorkspace from "./key-analysis/key-analysis-workspace";
import type { SafeUser } from "@/lib/step8a/types";
import BarrageLiveDisplay from "./classroom/barrage-live-display";

const SESSION_KEY = "surveying-ai-teacher.step6.session.v1";
const LEGACY_SESSION_KEY = "surveying-ai-teacher.step5.session.v1";
const MOTION_KEY = "surveying-ai-teacher.step7.motion.v1";

const MODE_CODES: Record<ChatMode, string> = {
  auto: "AI",
  terminology: "ABC",
  original: "TXT",
  translation: "中⇄EN",
  explanation: "WHY",
  quiz: "TEST",
};

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "您好！我是测绘专业外语AI虚拟教师。请选择学习模式，然后输入您的问题。我会依据课程教材、大纲、周历和教案回答，并标出资料来源与对应页码。",
  createdAt: 0,
  state: "welcome",
  includeInHistory: false,
};

type HealthState = "checking" | "ready" | "not_ready";
type TeacherVisualState = "online" | "thinking" | "speaking" | "offline";

function newMessageId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${randomId || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function formatMessageTime(timestamp: number) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function confidenceLabel(value: ChatMessage["confidence"]) {
  if (value === "high") return "高置信度";
  if (value === "medium") return "中等置信度";
  if (value === "guarded") return "谨慎回答";
  if (value === "low") return "低置信度";
  return "";
}

function readJsonSafely(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

function SourceList({ messageId, sources }: { messageId: string; sources: CourseSource[] }) {
  return (
    <div className={styles.sources} aria-label="课程资料来源">
      <div className={styles.sourcesHeading}>课程资料来源</div>
      {sources.map((source) => (
        <details
          className={styles.sourceCard}
          id={`${messageId}-${source.id}`}
          key={`${messageId}-${source.id}`}
        >
          <summary>
            <span className={styles.sourceId}>{sourceLocation(source)}</span>
            <span>{sourceTitle(source)}</span>
          </summary>
          <div className={styles.sourceDetails}>
            {source.excerpt ? <p>{source.excerpt}</p> : null}

          </div>
        </details>
      ))}
    </div>
  );
}

function AnswerText({ message }: { message: ChatMessage }) {
  const sourceIds = useMemo(
    () => new Set((message.sources || []).map((source) => source.id)),
    [message.sources],
  );
  const parts = message.content.split(/(\[S\d+\])/gu);
  return (
    <p className={styles.messageText}>
      {parts.map((part, index) => {
        const sourceId = /^\[(S\d+)\]$/u.exec(part)?.[1];
        if (sourceId && !sourceIds.has(sourceId)) return null;
        if (!sourceId) return <span key={`${index}-${part}`}>{part.replace(/\[S?\d*$/u, '')}</span>;
        return (
          <button
            className={styles.citationButton}
            key={`${index}-${part}`}
            onClick={() => {
              const target = document.getElementById(`${message.id}-${sourceId}`);
              target?.scrollIntoView({ behavior: "smooth", block: "center" });
              if (target instanceof HTMLDetailsElement) target.open = true;
            }}
            title={`查看${sourceTitle(message.sources?.find(s=>s.id===sourceId))}`}
            type="button"
          >
            {sourceLocation(message.sources?.find(s=>s.id===sourceId))}
          </button>
        );
      })}
    </p>
  );
}

export default function ChatWorkspace({ direct = false }: { direct?: boolean } = {}) {
  const [copied, setCopied] = useState("");
  const userStoppedRef = useRef(false);
  const [mode, setMode] = useState<ChatMode>("auto");
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [question, setQuestion] = useState("");
  const [inputError, setInputError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [health, setHealth] = useState<HealthState>("checking");
  const [sessionReady, setSessionReady] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [workspaceView, setWorkspaceView] = useState<"qa" | "analysis">("qa");
  const [sessionUser, setSessionUser] = useState<SafeUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const voice = useSynchronizedVoice();
  const [avatarExpanded, setAvatarExpanded] = useState(direct);
  const voiceTurnRef = useRef(0);
  const [handsFree, setHandsFree] = useState(false);
  const startVoiceRef = useRef<() => Promise<void>>(async () => {});
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const speechRequestRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  const selectedMode = CHAT_MODE_OPTIONS.find((item) => item.id === mode) || CHAT_MODE_OPTIONS[0];
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );
  const teacherVisualState: TeacherVisualState = health === "not_ready"
    ? "offline"
    : voice.isSpeaking
      ? "speaking"
      : isSending
        ? "thinking"
        : "online";
  const teacherStateLabel: Record<TeacherVisualState, string> = {
    online: "教师在线 · 随时提问",
    thinking: "正在检索课程知识库",
    speaking: "正在语音讲解课程回答",
    offline: "服务连接待检查",
  };
  const teacherSubtitle = useMemo(() => {
    if (voice.spokenText) return voice.spokenText;
    if (isSending && !latestAssistantMessage?.content) return "正在检索课程资料……";
    if (health === "not_ready") return "问答服务暂时未就绪，请检查服务器状态后再继续。";
    const content = latestAssistantMessage?.content
      .replace(/\[S\d+\]/gu, "")
      .replace(/\s+/gu, " ")
      .trim();
    if (!content || latestAssistantMessage?.id === WELCOME_MESSAGE.id) {
      return "欢迎进入测绘专业外语智能课堂。请选择模式，开始今天的学习。";
    }
    return content.length > 76 ? `${content.slice(0, 76)}…` : content;
  }, [health, isSending, latestAssistantMessage, voice.spokenText]);

  useEffect(() => {
    const stored = localStorage.getItem(MOTION_KEY);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMotionEnabled(stored === "on" ? true : stored === "off" ? false : !media.matches);

    const handlePreferenceChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(MOTION_KEY) === null) setMotionEnabled(!event.matches);
    };
    media.addEventListener?.("change", handlePreferenceChange);
    return () => media.removeEventListener?.("change", handlePreferenceChange);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/classroom/auth/me", { cache: "no-store", headers: { Accept: "application/json" } })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active && payload?.user) setSessionUser(payload.user as SafeUser);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setSessionChecked(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const restored = restoreSession(
      sessionStorage.getItem(SESSION_KEY) || sessionStorage.getItem(LEGACY_SESSION_KEY),
    );
    if (restored) {
      setMode(restored.mode);
      setMessages([WELCOME_MESSAGE, ...restored.messages]);
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    sessionStorage.setItem(SESSION_KEY, serializeSession(messages, mode));
  }, [messages, mode, sessionReady]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    fetch("/api/health", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => ({ response, payload: await readJsonSafely(response) }))
      .then(({ response, payload }) => {
        const available = response.ok && typeof payload === "object" && payload !== null && "ok" in payload && payload.ok === true;
        if (active) setHealth(available ? "ready" : "not_ready");
      })
      .catch(() => {
        if (active) setHealth("not_ready");
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  useEffect(() => { const q = new URLSearchParams(window.location.search).get("q"); if(q) setQuestion(q.slice(0,4000)); }, []);

  useEffect(() => () => {requestControllerRef.current?.abort();speechRequestRef.current?.abort();}, []);

  async function sendQuestion(questionOverride?: string) {
    const normalizedQuestion = (questionOverride ?? question).trim();
    if (normalizedQuestion.length < 2) {
      setHandsFree(false);
      setInputError("请至少输入2个字符后再发送。");
      inputRef.current?.focus();
      return;
    }
    if (normalizedQuestion.length > 4_000) {
      setInputError("问题不能超过4000个字符。");
      return;
    }
    if (sendingRef.current) return;

    const requestMode = mode;
    const history = buildHistoryPayload(messages);
    const userMessage: ChatMessage = {
      id: newMessageId("user"),
      role: "user",
      content: normalizedQuestion,
      createdAt: Date.now(),
      state: "sent",
      includeInHistory: true,
      mode: requestMode,
    };
    sendingRef.current = true;
    setIsSending(true);
    setInputError("");
    setQuestion("");
    setMessages((current) => [...current, userMessage]);

    const controller = new AbortController();
    userStoppedRef.current = false;
    speechRequestRef.current?.abort();
    voice.stopSpeaking();
    speechRequestRef.current = controller;
    requestControllerRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 65_000);
    const streamedId = newMessageId("assistant");
    const speech = voice.beginAnswer(voice.autoSpeak);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/x-ndjson",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: normalizedQuestion,
          mode: requestMode,
          history,
        }),
        signal: controller.signal,
      });
      const payload = response.ok ? await readChatStream(response, text => {
        speech.push(text);

        setMessages(current => {const found=current.some(item=>item.id===streamedId);const next:ChatMessage={id:streamedId,role:"assistant",content:text,createdAt:Date.now(),state:"answered",includeInHistory:false,mode:requestMode};return found?current.map(item=>item.id===streamedId?next:item):[...current,next];});
      }) : await readJsonSafely(response);
      if (!response.ok) throw apiErrorFromPayload(payload, response.status);
      const result = normalizeChatPayload(payload);
      const assistantMessage: ChatMessage = {
        id: streamedId,
        role: "assistant",
        content: result.answer,
        createdAt: Date.now(),
        state: result.status === "answered" ? "answered" : "insufficient",
        includeInHistory: true,
        mode: result.mode,
        confidence: result.confidence,
        sources: result.sources,
        requestId: result.requestId,
        verbatimVerified: result.verbatimVerified,
        retrievalStrategy: result.retrievalStrategy,
      };
      setMessages((current) => [...current.filter(item=>item.id!==streamedId), assistantMessage]);
      speech.finish(result.answer);
    } catch (error) {
      setHandsFree(false);
      controller.abort();voice.stopSpeaking();
      setMessages(current=>current.filter(item=>item.id!==streamedId));
      const aborted = error instanceof DOMException && error.name === "AbortError";
      const known = error instanceof ChatUiError;
      const publicMessage = aborted
        ? (userStoppedRef.current ? "已停止等待本次回答。服务器可能仍在处理，您可以重新提问。" : "本次回答等待时间过长，请检查网络后重新提问。")
        : known
          ? error.publicMessage
          : "网络连接失败，请确认开发服务器仍在运行后重试。";
      setMessages((current) => [
        ...current,
        {
          id: newMessageId("error"),
          role: "assistant",
          content: publicMessage,
          createdAt: Date.now(),
          state: "error",
          includeInHistory: false,
          mode: requestMode,
          requestId: known ? error.requestId : undefined,
          retryQuestion: normalizedQuestion,
        },
      ]);
    } finally {
      window.clearTimeout(timer);
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      sendingRef.current = false;
      setIsSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendQuestion();
    }
  }

  function clearConversation() {
    if (isSending) return;
    speechRequestRef.current?.abort();
    setHandsFree(false);
    voiceTurnRef.current += 1;
    voice.stopSpeaking();
    voice.cancelRecording();
    setMessages([WELCOME_MESSAGE]);
    setQuestion("");
    setInputError("");
    sessionStorage.removeItem(SESSION_KEY);
    inputRef.current?.focus();
  }


  useEffect(() => { startVoiceRef.current = handleVoiceQuestion; });
  useEffect(() => {
    if (!handsFree || workspaceView !== "qa" || !sessionUser || isSending || voice.isRecording || voice.isTranscribing || voice.isSpeechPending) return;
    const timer = window.setTimeout(() => { void startVoiceRef.current(); }, 550);
    return () => window.clearTimeout(timer);
  }, [handsFree, workspaceView, sessionUser, isSending, voice.isRecording, voice.isTranscribing, voice.isSpeechPending]);
  useEffect(() => { if (voice.error) setHandsFree(false); }, [voice.error]);

  async function handleVoiceQuestion() {
    setInputError("");
    voice.clearError();
    voice.stopSpeaking();
    const turn = ++voiceTurnRef.current;
    try {
      const text = await voice.recordUntilSilence({
        language: "mixed",
        context: `测绘专业外语AI教师问答；当前学习模式：${selectedMode.label}。`,
        hotwords: ["surveying", "geodesy", "GNSS", "RTK", "total station", "photogrammetry", "GIS", "测绘", "全站仪"],
      });
      if (turn !== voiceTurnRef.current) return;
      setQuestion(text);
      await sendQuestion(text);
    } catch {
      setHandsFree(false);
      // Speech errors are shown next to the input; stop continuous mode on failure.
    }
  }

  function openKeyAnalysisWorkspace() {
    speechRequestRef.current?.abort();
    setHandsFree(false);
    voiceTurnRef.current += 1;
    voice.stopSpeaking();
    voice.cancelRecording();
    setWorkspaceView("analysis");
  }

  return (
    <main className={`${styles.pageShell} ${styles.v18Shell} ${motionEnabled ? styles.motionOn : styles.motionOff} ${avatarExpanded ? styles.avatarExpanded : ""}`}>
      <aside className={styles.courseNav}><Link href="/student" className={styles.navBrand}><span>经</span><div>经纬拾光<small>SURVEYING STUDIO</small></div></Link><small className={styles.navCaption}>LEARNING WORKSPACE</small><nav aria-label="课程导航"><Link href="/" aria-current="page">◈　AI 教师问答</Link><Link href="/student">◫　学生实训中心</Link><Link href="/student/terrain-3d">◇　地形与城市 3D</Link><Link href="/student/smart-learning">▤　文献与专业术语</Link><Link href="/student/presentation">▥　课堂交互 PPT</Link><Link href="/student/chapter-tests">▦　章节测试 · 20题</Link><Link href="/student/scenarios">◉　情境任务与反馈</Link></nav><div className={styles.navFoot}><b>学有所据 · 问有所获</b><p>专业词汇 / 原理讲解<br/>中英翻译 / 教材溯源</p><span>VERSION 21.6</span></div></aside>
      <div className={styles.techBackdrop} aria-hidden="true">
        <div className={styles.geoGrid} />
        <div className={styles.contourField} />
        <div className={styles.worldGlow} />
        <div className={styles.backgroundScan} />
        <div className={styles.backgroundOrbit}><span /></div>
        <div className={styles.backgroundPoints}>
          {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
        </div>
      </div>
      <div className={styles.pageInner}>
        <header className={styles.header}>
          <div className={styles.brandBlock}>
            <div className={styles.brandMark} aria-hidden="true">测</div>
            <div className={styles.brandCopy}>
              <div className={styles.headerKicker}>
                <span>SMART SURVEYING CLASSROOM</span>
                <em>VERSION 21.6 · PRIVATE COURSE CLOUD</em>
              </div>
              <h1>AI 教师问答</h1>
              <p>Surveying Professional English AI Teacher</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link className={styles.portalLink} href="/student/chapter-tests">章节测试</Link>
            <Link className={styles.portalLink} href="/student">学生中心</Link>
            <button aria-pressed={workspaceView === "analysis"} className={`${styles.portalLink} ${styles.portalButton} ${workspaceView === "analysis" ? styles.portalActive : ""}`} onClick={openKeyAnalysisWorkspace} type="button">PPT重点解析</button>
            <MotionSwitch /><Link className={styles.portalLink} href="/digital-teacher">数字教师对话</Link>
            <a
              aria-label="联系电话 13623409954"
              className={`${styles.portalLink} ${styles.contactLink}`}
              href="tel:13623409954"
              title="拨打联系电话 13623409954"
            >
              <span aria-hidden="true">☎</span> 联系电话 13623409954
            </a>
            <div
              aria-live="polite"
              className={`${styles.healthBadge} ${styles[`health_${health}`]}`}
              role="status"
            >
              <span aria-hidden="true" />
              {health === "checking" ? "正在检查" : health === "ready" ? "问答服务就绪" : "服务需要检查"}
            </div>
          </div>
        </header>

        {workspaceView === "analysis" && sessionUser ? (
          <KeyAnalysisWorkspace onBack={() => setWorkspaceView("qa")} />
        ) : (
          <>
        <div className={styles.systemRibbon} aria-label="课程知识库状态">
          <div><strong>54</strong><span>课程知识块</span></div>
          <div><strong>384</strong><span>教材资料页</span></div>
          <div><strong>54</strong><span>教材Unit</span></div>
          <div><strong>RAG</strong><span>智能检索核验</span></div>
          <p><span aria-hidden="true" /> 公网云端 · 演示知识库 · 页码可追溯</p>
        </div>

        {sessionChecked && !sessionUser ? (
          <section className={styles.publicLoginGate}>
            <div><span>PRIVATE COURSE PORTAL · VERSION 21.6</span><h2>登录后进入AI教师问答</h2><p>学生使用教师导入名单后生成的学号和临时密码；教师使用管理员账号。登录后可访问问答、章节测试、语音、PPT重点解析，以及带专业词汇自动高亮的只读课堂交互PPT。</p></div>
            <div><Link href="/student/login">学生登录</Link></div>
          </section>
        ) : <section className={styles.workspace}>
          <aside className={`${styles.teacherPanel} ${styles[`teacherState_${teacherVisualState}`]}`}>
            <div className={styles.teacherStage} aria-label="知性女教师对话舞台">
              <div className={styles.stageTopline}>
                <span>YOUR LEARNING PARTNER</span>
                <span className={styles.stageSignal}><i /><i /><i /><i /></span>
              </div>
              <div className={styles.stageVisual}>
                <div className={styles.stageGrid} />
                <div className={styles.stageContours} />
                <div className={`${styles.stageOrbit} ${styles.stageOrbitOne}`} />
                <div className={`${styles.stageOrbit} ${styles.stageOrbitTwo}`} />
                <div className={styles.stageReticle}><i /><i /></div>
                <div className={styles.satelliteTrack}><span>GNSS</span><i /></div>
                <div className={styles.stagePointCloud}>
                  {Array.from({ length: 16 }, (_, index) => <i key={index} />)}
                </div>
                <div className={styles.teacherAura} />
                <div className={styles.conversationAvatar}>
                  <PhotoAvatarStage motion={voice.isRecording ? "listening" : voice.isSpeaking ? "speaking" : isSending ? "thinking" : "idle"} audioSignals={voice.audioSignals} gesture={voice.isSpeaking ? "open-palm" : "neutral"} compact />
                </div>
                <div className={styles.teacherScan} />
                <div className={`${styles.coordinateTag} ${styles.coordinateTagLeft}`}>
                  <span>X</span> 423765.82
                </div>
                <div className={`${styles.coordinateTag} ${styles.coordinateTagRight}`}>
                  <span>Y</span> 3978241.06
                </div>
                <div className={styles.totalStation} title="全站仪扫描示意">
                  <span className={styles.instrumentHead} />
                  <span className={styles.instrumentBeam} />
                  <i /><i /><i />
                </div>
              </div>
              <div className={styles.teacherStatus}>
                <span className={styles.teacherStatusDot} aria-hidden="true" />
                <strong>{teacherStateLabel[teacherVisualState]}</strong>
                <span className={styles.voiceWave} aria-hidden="true"><i /><i /><i /><i /><i /></span>
              </div>
              <p className={styles.teacherSubtitle} aria-live="polite">{teacherSubtitle}</p>
              <button type="button" className={styles.avatarSizeButton} aria-pressed={avatarExpanded} onClick={() => setAvatarExpanded(v => !v)}>{avatarExpanded ? "收起舞台" : "放大数字教师"}</button>
            </div>

            <p className={styles.eyebrow}>COURSE INTELLIGENCE ASSISTANT</p>
            <h2>测绘专业外语教师</h2>
            <p className={styles.teacherIntro}>
              依据已审核的课程教材、大纲、周历和教案回答，并为知识性结论提供可追溯页码。
            </p>
            <div className={styles.voiceServiceCard}>
              <strong>文字与语音 · 同步讲解</strong>
              <span>中英双语 · 逐句朗读 · 当前句同步字幕</span>
              <button onClick={() => voice.setAutoSpeak((value) => !value)} type="button">
                {voice.autoSpeak ? "✓ AI答案自动朗读" : "开启AI答案自动朗读"}
              </button>
            </div>
            <div className={styles.capabilityList}>
              <span><i>ABC</i>专业词汇</span>
              <span><i>TXT</i>教材原文</span>
              <span><i>中⇄EN</i>中英翻译</span>
              <span><i>WHY</i>原理讲解</span>
              <span><i>TEST</i>章节测试</span>
            </div>
            <div className={styles.sessionNote}>
              <strong>当前会话已自动保留</strong>
              <span>刷新本页后仍可继续；关闭此浏览器标签页后自动清除。</span>
            </div>
          </aside>

          <section className={styles.chatPanel} aria-label="课程问答区">
            <div className={styles.modeBar}>
              <div className={styles.modeHeaderCopy}>
                <span className={styles.modeEyebrow}>LEARNING CONSOLE</span>
                <p className={styles.modeTitle}>六大学习工作台</p>
                <p className={styles.modeHint}>{selectedMode.hint}</p>
              </div>
              <div className={styles.modeButtons} role="group" aria-label="学习模式">
                {CHAT_MODE_OPTIONS.map((item) => (
                  <button
                    aria-pressed={mode === item.id}
                    className={mode === item.id ? styles.modeButtonActive : styles.modeButton}
                    disabled={isSending}
                    key={item.id}
                    onClick={() => setMode(item.id)}
                    title={item.hint}
                    type="button"
                  >
                    <span className={styles.modeCode}>{MODE_CODES[item.id]}</span>
                    <span>{item.label}</span><small className={styles.modeDescription}>{item.hint}</small>
                  </button>
                ))}
              </div>
            </div>

            {mode !== "auto" ? (
              <Workstation key={mode} mode={mode} />
            ) : (
              <>
            <div className={styles.conversation} aria-live="polite" aria-relevant="additions">
              {messages.map((message) => (
                <article
                  className={`${styles.messageRow} ${message.role === "user" ? styles.userRow : styles.assistantRow}`}
                  key={message.id}
                >
                  <div className={styles.messageIdentity} aria-hidden="true">
                    {message.role === "user" ? "我" : "AI"}
                  </div>
                  <div
                    className={`${styles.messageBubble} ${message.role === "user" ? styles.userBubble : styles.assistantBubble} ${message.state === "error" ? styles.errorBubble : ""} ${message.state === "insufficient" ? styles.insufficientBubble : ""}`}
                  >
                    <div className={styles.messageMeta}>
                      <strong>{message.role === "user" ? "学生" : "AI虚拟教师"}</strong>
                      {message.mode ? <span>{modeLabel(message.mode)}</span> : null}
                      {message.confidence ? <span>{confidenceLabel(message.confidence)}</span> : null}
                      {message.verbatimVerified ? <span className={styles.verifiedBadge}>原文已核验</span> : null}
                      {formatMessageTime(message.createdAt) ? <time>{formatMessageTime(message.createdAt)}</time> : null}
                    </div>
                    <AnswerText message={message} />
                    {message.role === "assistant" && message.id !== WELCOME_MESSAGE.id && message.state !== "error" ? <button className={styles.copyAnswer} type="button" onClick={()=>{void navigator.clipboard.writeText(displayCitations(message.content,message.sources)).then(()=>setCopied(message.id)).catch(()=>setInputError("复制未成功，请选中文字手动复制。"));}}>{copied===message.id?"已复制":"复制答案"}</button>:null}
                    {message.role === "assistant" && message.id !== WELCOME_MESSAGE.id && message.state !== "error" ? (
                      <button
                        className={styles.messageVoiceButton}
                        disabled={voice.isSpeechPending}
                        onClick={() => {speechRequestRef.current?.abort();void voice.speak(displayCitations(message.content,message.sources), { language: "mixed" });}}
                        type="button"
                      >
                        {voice.isSpeaking ? "AI教师正在讲解…" : "🔊 AI教师朗读本答案"}
                      </button>
                    ) : null}
                    {message.state === "error" && message.retryQuestion ? (
                      <button
                        className={styles.retryButton}
                        onClick={() => {
                          setQuestion(message.retryQuestion || "");
                          inputRef.current?.focus();
                        }}
                        type="button"
                      >
                        将原问题放回输入框
                      </button>
                    ) : null}
                    {message.sources && message.sources.length > 0 ? (
                      <SourceList messageId={message.id} sources={message.sources} />
                    ) : null}
                  </div>
                </article>
              ))}

              {isSending ? (
                <div className={`${styles.messageRow} ${styles.assistantRow}`} role="status">
                  <div className={styles.messageIdentity} aria-hidden="true">AI</div>
                  <div className={`${styles.messageBubble} ${styles.assistantBubble} ${styles.thinkingBubble}`}>
                    <span className={styles.thinkingDots} aria-hidden="true"><i /><i /><i /></span>
                    正在检索课程资料并核对引用，请稍候……
                  </div>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>

            <div className={styles.suggestionRow} aria-label="示例问题">
              <span>示例：</span>
              <button
                disabled={isSending}
                onClick={() => {
                  setQuestion(selectedMode.example);
                  setInputError("");
                  inputRef.current?.focus();
                }}
                type="button"
              >
                {selectedMode.example}
              </button>
            </div>

            <form className={styles.composer} onSubmit={handleSubmit}>
              <label className={styles.srOnly} htmlFor="course-question">请输入课程问题</label>
              <textarea
                aria-describedby={inputError ? "question-error question-help" : "question-help"}
                aria-invalid={Boolean(inputError)}
                disabled={isSending || voice.isRecording || voice.isTranscribing}
                id="course-question"
                maxLength={4_000}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  if (inputError) setInputError("");
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="请输入您的问题……"
                ref={inputRef}
                rows={3}
                value={question}
              />
              <div className={styles.composerActions}>
                {isSending?<button type="button" className={styles.clearButton} onClick={()=>{setHandsFree(false);userStoppedRef.current=true;requestControllerRef.current?.abort();speechRequestRef.current?.abort();voice.stopSpeaking();}}>停止等待</button>:null}
                <div className={styles.inputStatus}>
                  <span id="question-help">Enter发送，Shift＋Enter换行</span>
                  <span className={question.length > 3_800 ? styles.characterWarning : ""}>
                    {question.length}/4000
                  </span>
                </div>
                <button
                  aria-pressed={voice.isRecording}
                  className={voice.isRecording ? styles.voiceButtonActive : styles.voiceButton}
                  disabled={isSending || voice.isTranscribing || voice.isRecording}
                  onClick={() => void handleVoiceQuestion()}
                  type="button"
                >
                  {voice.isTranscribing ? "正在高精度识别并自动发送…" : voice.isRecording ? "正在聆听 · 停顿后自动发送…" : "🎤 智能语音提问 · 说完自动发送"}
                </button>
                <button type="button" className={handsFree ? styles.voiceButtonActive : styles.voiceButton} aria-pressed={handsFree} disabled={!handsFree && (isSending || voice.isRecording || voice.isTranscribing)} onClick={() => { if (handsFree) { setHandsFree(false); voiceTurnRef.current += 1; voice.cancelRecording(); voice.stopSpeaking(); } else { voice.setAutoSpeak(true); setHandsFree(true); } }}>{handsFree ? "结束连续对话" : "开启连续对话"}</button>
                {voice.isSpeechPending ? (
                  <button className={styles.clearButton} onClick={()=>{setHandsFree(false);speechRequestRef.current?.abort();voice.stopSpeaking();}} type="button">停止朗读</button>
                ) : null}
                <button
                  className={styles.clearButton}
                  disabled={isSending || messages.length <= 1}
                  onClick={clearConversation}
                  type="button"
                >
                  清空对话
                </button>
                <button
                  className={styles.sendButton}
                  disabled={isSending || voice.isRecording || voice.isTranscribing || question.trim().length < 2}
                  type="submit"
                >
                  {isSending ? "回答中…" : "发送"}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
              {inputError ? <p className={styles.inputError} id="question-error" role="alert">{inputError}</p> : null}
              {(voice.isRecording || voice.isTranscribing) ? <div className={styles.recordingPanel} role="status"><span className={styles.listeningPulse} />{voice.isRecording ? "正在录音 · 停顿后自动识别" : "正在识别录音，随后显示提问文字并发送"}<button type="button" onClick={() => { setHandsFree(false); voiceTurnRef.current += 1; voice.cancelRecording(); }}>取消录音</button></div> : null}
              {voice.isSpeechPending ? <div className={styles.spokenCaption}><span>{voice.isSpeaking ? "正在朗读" : "语音准备中"}</span><p>{voice.spokenText || "文字持续显示，声音就绪后逐句播报。"}</p></div> : null}
              {voice.error ? <p className={styles.voiceError} role="alert">{voice.error}</p> : null}
            </form>
            <p className={styles.aiNotice}>回答与朗读由AI生成，请结合课程原始资料核对；录音只用于本次识别，不在网页端保存。</p>
              </>
            )}
          </section>
        </section>}
          </>
        )}
      </div>
      {sessionUser?.role === "teacher" ? <BarrageLiveDisplay /> : null}
    </main>
  );
}
