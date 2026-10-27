"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { PptxViewer } from "@aiden0z/pptx-renderer";
import { launchClassroom } from "@/lib/step21-7/classroom-client";
import type { PresentationLectureRequest } from "@/lib/step11-9/presentation-lecture-types";
import {
  applyProfessionalTermHighlights,
  clearProfessionalTermHighlights,
  type PresentationHighlightTerm,
} from "@/lib/step14-2/presentation-term-highlighter";
import FullscreenLocalDigitalTeacher from "../avatar/fullscreen-local-digital-teacher";
import { fitSlideWidth, translationSpeech } from "@/lib/step21-5/presentation.mjs";
import presentationStyles from "./teacher-presentation-fullscreen.module.css";
import styles from "./student-presentation-workspace.module.css";

type PresentationMetadata = {
  originalName: string;
  size: number;
  version: string;
  updatedAt: string;
  updatedBy: string;
};

type Translation = {
  translation: string;
  contextMeaning: string;
  otherMeanings: Array<{ meaning: string; usage: string }>;
  explanation: string;
  sourceKind: "textbook" | "ai";
  sourceLabel: string;
  citation: string;
};

type CaretPoint = { node: Text; offset: number };

const SURVEYING_PHRASES = [
  "geographic information system", "global navigation satellite system", "coordinate reference system",
  "digital elevation model", "closed loop traverse", "remote sensing", "total station", "control point",
  "horizontal datum", "vertical datum", "map projection", "coordinate system", "point cloud",
  "aerial triangulation", "photogrammetric surveying", "engineering surveying", "cadastral surveying",
  "leveling survey", "survey specifications", "angular closure", "baseline processing", "spatial resolution",
  "ground control point", "real-time kinematic", "accuracy", "precision", "traverse", "geodesy",
].sort((left, right) => right.length - left.length);

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function caretFromPoint(x: number, y: number): CaretPoint | null {
  const documentWithCaret = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = documentWithCaret.caretPositionFromPoint?.(x, y);
  if (position?.offsetNode.nodeType === Node.TEXT_NODE) return { node: position.offsetNode as Text, offset: position.offset };
  const range = documentWithCaret.caretRangeFromPoint?.(x, y);
  if (range?.startContainer.nodeType === Node.TEXT_NODE) return { node: range.startContainer as Text, offset: range.startOffset };
  return null;
}

function sentenceAt(text: string, offset: number) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (!normalized) return "";
  const boundedOffset = Math.max(0, Math.min(normalized.length, offset));
  const left = Math.max(-1, ...[...normalized.slice(0, boundedOffset).matchAll(/[。！？!?；;]\s*/gu)].map((match) => (match.index || 0) + match[0].length - 1));
  const rightMatch = normalized.slice(boundedOffset).match(/[。！？!?；;]/u);
  const right = rightMatch?.index === undefined ? normalized.length : boundedOffset + rightMatch.index + 1;
  return normalized.slice(left + 1, right).trim().slice(0, 1_600);
}

function textContext(caret: CaretPoint) {
  const text = caret.node.data;
  let element = caret.node.parentElement;
  let context = text;
  while (element && element.textContent && element.textContent.length <= 1_600) {
    context = element.textContent;
    if (/^(P|DIV|LI|TD|TEXT)$/u.test(element.tagName) || /[。！？!?；;]$/u.test(context.trim())) break;
    element = element.parentElement;
  }
  const normalizedContext = context.replace(/\s+/gu, " ");
  const normalizedNode = text.replace(/\s+/gu, " ");
  const nodeStart = Math.max(0, normalizedContext.indexOf(normalizedNode));
  const contextOffset = nodeStart + Math.min(caret.offset, normalizedNode.length);
  return { context: normalizedContext, contextOffset, sentence: sentenceAt(normalizedContext, contextOffset) };
}

function termAt(text: string, offset: number, targetText: string, professionalTerms: readonly string[]) {
  const lower = text.toLowerCase();
  for (const phrase of professionalTerms) {
    const normalizedPhrase = phrase.toLowerCase();
    let start = lower.indexOf(normalizedPhrase);
    while (start >= 0) {
      if (offset >= start && offset <= start + phrase.length) return text.slice(start, start + phrase.length);
      start = lower.indexOf(normalizedPhrase, start + 1);
    }
  }
  const compactTarget = targetText.replace(/\s+/gu, " ").trim();
  if (compactTarget.length <= 80 && compactTarget.split(/\s+/u).length <= 6 && !/[。！？!?；;]$/u.test(compactTarget)) {
    return compactTarget;
  }
  const ascii = /[A-Za-z0-9][A-Za-z0-9+_.-]*/gu;
  for (const match of text.matchAll(ascii)) {
    const start = match.index || 0;
    if (offset >= start && offset <= start + match[0].length) return match[0];
  }
  const han = /[\p{Script=Han}]{1,20}/gu;
  for (const match of text.matchAll(han)) {
    const start = match.index || 0;
    if (offset >= start && offset <= start + match[0].length) return match[0];
  }
  return compactTarget.slice(0, 80);
}

export default function TeacherPresentationWorkspace({ teacherName }: { teacherName: string }) {
  const stageRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const autoSpeakRef = useRef(false);
  const speechIdRef = useRef(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [captionVisible, setCaptionVisible] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechNotice, setSpeechNotice] = useState("");
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const viewerRef = useRef<PptxViewer | null>(null);
  const versionRef = useRef("");
  const loadGenerationRef = useRef(0);
  const loadBusyRef = useRef(false);
  const zoomRef = useRef(100);
  const translationAbortRef = useRef<AbortController | null>(null);
  const termHighlightAbortRef = useRef<AbortController | null>(null);
  const slideTermsRef = useRef<readonly string[]>(SURVEYING_PHRASES);
  const [metadata, setMetadata] = useState<PresentationMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadNotice, setLoadNotice] = useState("正在读取教师发布的课堂PPT…");
  const [error, setError] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [viewerReady, setViewerReady] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [selectedText, setSelectedText] = useState("");
  const [selectedSentence, setSelectedSentence] = useState("");
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [lectureRequest, setLectureRequest] = useState<PresentationLectureRequest | null>(null);
  const [lectureOpen, setLectureOpen] = useState(false);
  const [renderRevision, setRenderRevision] = useState(0);
  const [highlighting, setHighlighting] = useState(false);
  const [highlightCount, setHighlightCount] = useState(0);

  const stopSpeech = useCallback(() => {
    speechIdRef.current++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speakTranslation = useCallback((result: Translation) => {
    stopSpeech();
    if (!("speechSynthesis" in window)) { setSpeechNotice("当前浏览器不支持朗读，请使用字幕或Edge/Chrome。"); return; }
    const id = speechIdRef.current;
    const speech = new SpeechSynthesisUtterance(translationSpeech(result));
    speech.lang = "zh-CN"; speech.rate = 1;
    const voice = window.speechSynthesis.getVoices().find((v) => /^zh[-_]CN/i.test(v.lang));
    if (voice) speech.voice = voice;
    speech.onstart = () => { if (id === speechIdRef.current) setSpeaking(true); };
    speech.onend = () => { if (id === speechIdRef.current) setSpeaking(false); };
    speech.onerror = () => { if (id === speechIdRef.current) { setSpeaking(false); setSpeechNotice("朗读未完成，请点击“朗读译文”重试或查看字幕。"); } };
    setSpeechNotice(""); window.speechSynthesis.speak(speech);
  }, [stopSpeech]);

  useEffect(() => {
    const speechToken = speechIdRef;
    const changed = () => {
      const active = document.fullscreenElement === stageRef.current;
      setFullscreen(active);
      zoomRef.current = 100; setZoom(100);
      void viewerRef.current?.setZoom(100).catch(() => {});
    };
    document.addEventListener("fullscreenchange", changed);
    return () => { document.removeEventListener("fullscreenchange", changed); speechToken.current++; window.speechSynthesis?.cancel(); };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !viewerReady) return;
    const resize = () => {
      const viewer = viewerRef.current, canvas = canvasRef.current;
      if (!viewer || !canvas) return;
      const width = fitSlideWidth(viewport.clientWidth, viewport.clientHeight, viewer.slideWidth, viewer.slideHeight);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${width * viewer.slideHeight / viewer.slideWidth}px`;
    };
    resize(); const observer = new ResizeObserver(resize); observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewerReady, fullscreen]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === stageRef.current) await document.exitFullscreen();
      else if (stageRef.current?.requestFullscreen) { await stageRef.current.requestFullscreen(); stageRef.current.focus(); }
      else setError("当前浏览器不支持全屏，请使用桌面版Edge或Chrome。");
    } catch { setError("无法进入全屏，请允许浏览器全屏并再次点击按钮。"); }
  }

  const loadPresentation = useCallback(async (force = false) => {
    if (loadBusyRef.current && !force) return;
    const generation = ++loadGenerationRef.current;
    loadBusyRef.current = true;
    try {
    const metadataResponse = await fetch(`/api/presentation?time=${Date.now()}`, { cache: "no-store" });
    const metadataPayload = await metadataResponse.json().catch(() => null);
    if (metadataResponse.status === 401) {
      throw new Error("教师登录已失效，请重新登录教师工作台。");
    }
    if (!metadataResponse.ok) throw new Error(metadataPayload?.error || "无法读取课堂PPT信息。");
    if (generation !== loadGenerationRef.current) return;
    const nextMetadata = metadataPayload.presentation as PresentationMetadata | null;
    setMetadata(nextMetadata);
    if (!nextMetadata) {
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setViewerReady(false);
      versionRef.current = "";
      if (canvasRef.current) canvasRef.current.replaceChildren();
      setSlideCount(0);
      setLoading(false);
      setLoadNotice("教师尚未上传课堂PPT。此页面会自动等待并检查更新。");
      return;
    }
    if (!force && nextMetadata.version === versionRef.current) return;
    translationAbortRef.current?.abort();
    setTranslation(null); setSelectedText(""); setTranslating(false);
    stopSpeech();
    setLoading(true);
    setViewerReady(false);
    setError("");
    setLoadNotice(versionRef.current ? "检测到教师更换了PPT，正在自动载入新版…" : "正在解析课堂PPT…");
    const response = await fetch(`/api/presentation/file?v=${encodeURIComponent(nextMetadata.version)}`, { cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "课堂PPT下载失败。");
    }
    const container = canvasRef.current;
    if (!container) return;
    const buffer = await response.arrayBuffer();
    if (generation !== loadGenerationRef.current) return;
    const { PptxViewer: Viewer, RECOMMENDED_ZIP_LIMITS } = await import("@aiden0z/pptx-renderer/browser");
    if (generation !== loadGenerationRef.current) return;
    viewerRef.current?.destroy();
    container.replaceChildren();
    const viewer = await Viewer.open(buffer, container, {
      renderMode: "slide",
      fitMode: "contain",
      zoomPercent: zoomRef.current,
      lazyMedia: true,
      lazySlides: true,
      pdfjs: false,
      zipLimits: RECOMMENDED_ZIP_LIMITS,
      onSlideChange: (index) => setSlideIndex(index),
      onSlideRendered: (index) => {
        setSlideIndex(index);
        setRenderRevision((revision) => revision + 1);
      },
      onSlideError: (_index, reason) => setError(reason instanceof Error ? reason.message : "这一页PPT暂时无法显示。"),
    });
    if (generation !== loadGenerationRef.current) { viewer.destroy(); return; }
    viewerRef.current = viewer;
    setViewerReady(true);
    versionRef.current = nextMetadata.version;
    setSlideIndex(viewer.currentSlideIndex);
    setSlideCount(viewer.slideCount);
    setLoading(false);
    setLoadNotice(versionRef.current ? "PPT已同步到教师发布的最新版本。" : "PPT已载入。");
    } finally { if (generation === loadGenerationRef.current) loadBusyRef.current = false; }
  }, [stopSpeech]);

  useEffect(() => {
    let active = true;
    const generationToken = loadGenerationRef;
    const highlightContainer = canvasRef.current;
    const refresh = async (force = false) => {
      try {
        await loadPresentation(force);
      } catch (loadError) {
        if (!active) return;
        setLoading(false);
        setError(loadError instanceof Error ? loadError.message : "课堂PPT加载失败。");
      }
    };
    void refresh(true);
    const timer = window.setInterval(() => void refresh(false), 15_000);
    return () => {
      active = false;
      generationToken.current++;
      loadBusyRef.current = false;
      window.clearInterval(timer);
      translationAbortRef.current?.abort();
      termHighlightAbortRef.current?.abort();
      clearProfessionalTermHighlights(highlightContainer);
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [loadPresentation]);

  useEffect(() => {
    const container = canvasRef.current;
    termHighlightAbortRef.current?.abort();
    clearProfessionalTermHighlights(container);
    slideTermsRef.current = SURVEYING_PHRASES;
    if (!container || !metadata || !viewerReady) return;

    const controller = new AbortController();
    termHighlightAbortRef.current = controller;
    const frame = window.requestAnimationFrame(() => {
      if (controller.signal.aborted) return;
      setHighlightCount(0);
      setHighlighting(true);
      void (async () => {
      try {
        const response = await fetch(`/api/presentation/highlights?version=${encodeURIComponent(metadata.version)}&slideNumber=${slideIndex + 1}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as { terms?: PresentationHighlightTerm[] } | null;
        if (!response.ok) throw new Error("专业词汇标记暂时不可用。");
        const terms = Array.isArray(payload?.terms) ? payload.terms : [];
        slideTermsRef.current = [...terms.map((item) => item.term), ...SURVEYING_PHRASES]
          .filter(Boolean)
          .sort((left, right) => right.length - left.length);
        if (controller.signal.aborted || !canvasRef.current) return;
        const result = applyProfessionalTermHighlights(canvasRef.current, terms);
        setHighlightCount(result.matchCount);
      } catch (highlightError) {
        if (!(highlightError instanceof DOMException && highlightError.name === "AbortError")) setHighlightCount(0);
      } finally {
        if (termHighlightAbortRef.current === controller) {
          termHighlightAbortRef.current = null;
          setHighlighting(false);
        }
      }
      })();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      controller.abort();
      clearProfessionalTermHighlights(container);
    };
  }, [metadata, slideIndex, viewerReady, renderRevision]);

  const requestTranslation = useCallback(async (selection: string, sentence: string) => {
    const normalized = selection.replace(/\s+/gu, " ").trim();
    if (!normalized) return;
    if (normalized.length > 4000) { setTranslationError("一次最多选择4000个字符，请缩小选区；不会截断翻译。"); return; }
    stopSpeech();
    translationAbortRef.current?.abort();
    const controller = new AbortController();
    translationAbortRef.current = controller;
    setSelectedText(normalized);
    setSelectedSentence(sentence || normalized);
    setTranslation(null);
    setTranslationError("");
    setTranslating(true);
    try {
      const response = await fetch("/api/presentation/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: normalized, sentence: sentence || normalized, slideNumber: slideIndex + 1 }),
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "PPT翻译暂时不可用。");
      if (translationAbortRef.current !== controller || controller.signal.aborted) return;
      if (payload.translation?.selectedText !== normalized) throw new Error("译文与当前选文不一致，请重新翻译。");
      setTranslation(payload.translation);
      if (autoSpeakRef.current) speakTranslation(payload.translation);
    } catch (translateError) {
      if (translationAbortRef.current === controller && !(translateError instanceof DOMException && translateError.name === "AbortError")) {
        setTranslationError(translateError instanceof Error ? translateError.message : "PPT翻译暂时不可用。");
      }
    } finally {
      if (translationAbortRef.current === controller) {
        translationAbortRef.current = null;
        setTranslating(false);
      }
    }
  }, [slideIndex, stopSpeech, speakTranslation]);

  function handleTextPointerUp() {
    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/gu, " ").trim() || "";
    const root = canvasRef.current;
    if (!selection || selection.isCollapsed || !text || !selection.anchorNode || !selection.focusNode || !root?.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return;
    // Capture now, before the click event or translation buttons can collapse the native range.
    const range = selection.getRangeAt(0);
    const start = range.startContainer;
    let context = text;
    if (start.nodeType === Node.TEXT_NODE) context = textContext({node:start as Text,offset:range.startOffset}).sentence || text;
    // Multi-node selections may exceed one DOM paragraph: never replace them with first-node text.
    if (!context.includes(text)) context = text;
    void requestTranslation(text, context);
  }

  function handleTextClick(event: ReactMouseEvent<HTMLDivElement>) {
    const nativeSelection = window.getSelection();
    if (nativeSelection && !nativeSelection.isCollapsed && nativeSelection.toString().trim()) return;
    const caret = caretFromPoint(event.clientX, event.clientY);
    if (!caret || !canvasRef.current?.contains(caret.node)) return;
    const { context, contextOffset, sentence } = textContext(caret);
    const target = event.target as HTMLElement;
    const targetText = target.textContent || "";
    const markedTerm = target.closest<HTMLElement>("[data-surveying-term]")?.dataset.surveyingTerm || "";
    const selected = markedTerm || termAt(context, contextOffset, targetText, slideTermsRef.current);
    if (selected) void requestTranslation(selected, sentence || context || selected);
  }

  async function changeSlide(direction: -1 | 1) {
    stopSpeech();
    setTranslationError(""); setSpeechNotice("");
    translationAbortRef.current?.abort();
    translationAbortRef.current = null;
    setTranslating(false);
    setSelectedText("");
    setSelectedSentence("");
    setTranslation(null);
    const viewer = viewerRef.current;
    if (!viewer) return;
    const next = Math.max(0, Math.min(viewer.slideCount - 1, viewer.currentSlideIndex + direction));
    await viewer.goToSlide(next);
    setSlideIndex(next);
  }

  async function changeZoom(nextZoom: number) {
    const bounded = Math.max(60, Math.min(160, nextZoom));
    zoomRef.current = bounded;
    setZoom(bounded);
    await viewerRef.current?.setZoom(bounded);
  }

  async function openCurrentSlideLecture() {
    if (!metadata || !viewerReady || !slideCount) return;
    launchClassroom();
    stopSpeech();
    if (document.fullscreenElement === stageRef.current) await document.exitFullscreen();
    setLectureRequest({
      requestId: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${metadata.version}-${slideIndex + 1}-${Date.now()}`,
      version: metadata.version,
      presentationName: metadata.originalName,
      slideNumber: slideIndex + 1,
      slideCount,
    });
    setLectureOpen(true);
  }

  return (
    <>
    <section aria-label="教师工作台中的课堂交互PPT" className={`${styles.shell} ${styles.embedded}`} ref={workspaceRef}>
      <header className={styles.embeddedHeader}>
        <div><span>TEACHER INTERACTIVE PRESENTATION</span><h2>课堂交互PPT讲授台</h2><p>{teacherName} · 浏览PPT、点选术语、逐句翻译，并让全屏AI数字教师深度讲解当前页</p></div>
        <a className={presentationStyles.launcher} href="/teacher/liteavatar">LiteAvatar课堂连接设置</a>
        <small>首次使用请注册21.7启动器；点击“数字人讲解本页”自动启动并讲解，电脑需开机联网。</small>
      </header>

      <section className={styles.toolbar}>
        <div><strong>{metadata?.originalName || "等待教师发布PPT"}</strong><span>{metadata ? `${formatBytes(metadata.size)} · ${metadata.updatedBy}更新` : loadNotice}</span></div>
        <div className={styles.slideControls}>
          <button disabled={!viewerReady || slideIndex <= 0} onClick={() => void changeSlide(-1)} type="button">← 上一页</button>
          <b>{slideCount ? `${slideIndex + 1} / ${slideCount}` : "— / —"}</b>
          <button disabled={!viewerReady || slideIndex >= slideCount - 1} onClick={() => void changeSlide(1)} type="button">下一页 →</button>
        </div>
        <div className={styles.zoomControls}>
          <button disabled={!viewerReady} onClick={() => void changeZoom(zoom - 10)} type="button">−</button><span>{zoom}%</span><button disabled={!viewerReady} onClick={() => void changeZoom(zoom + 10)} type="button">＋</button>
          <button disabled={!viewerReady} onClick={() => void toggleFullscreen()} type="button">全屏</button>
          <button className={styles.lectureButton} disabled={!viewerReady || !metadata} onClick={() => void openCurrentSlideLecture()} type="button">数字人讲解本页</button>
        </div>
      </section>

      <section className={styles.workspace}>
        <article className={`${styles.viewerPane} ${presentationStyles.stage}`} ref={stageRef} tabIndex={-1} onKeyDown={(event) => {
          if (!fullscreen || (event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")) return;
          if (["ArrowRight", "PageDown", "ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); void changeSlide(["ArrowRight", "PageDown"].includes(event.key) ? 1 : -1); }
        }}>
          <div className={`${styles.helpBar} ${presentationStyles.helpBar}`}><span className={styles.autoHighlightLegend}><i />{!viewerReady ? "等待载入PPT专业词汇…" : highlighting ? "正在自动识别专业词汇…" : highlightCount ? `橙色/橙红色：已标记${highlightCount}处专业词汇` : "本页暂无可自动标记词汇"}</span><span>点击标记词查看解释</span><span>拖选任意短语</span><span>AI教师讲解本页</span><em>本讲授台仅教师账号可访问</em></div>
          {error ? <div className={styles.error}>{error}<button onClick={() => void loadPresentation(true).catch((e) => { setLoading(false); setError(e.message); })} type="button">重新加载</button></div> : null}
          {loading ? <div className={styles.loading}><i /><b>{loadNotice}</b></div> : null}
          {!loading && !metadata ? <div className={styles.empty}><b>教师尚未上传课堂PPT</b><p>页面会保持等待，并自动检查教师发布的新PPT。</p></div> : null}
          <div className={presentationStyles.viewport} ref={viewportRef}>
            <div className={`${styles.canvas} ${presentationStyles.canvas}`} onClick={handleTextClick} onPointerUp={handleTextPointerUp} ref={canvasRef} />
          </div>
          {fullscreen && <span className={presentationStyles.fullscreenHint}>← → 翻页 · Esc退出 · 底部显示控制栏</span>}
          <div className={presentationStyles.controls} aria-label="PPT投屏控制">
            <button type="button" disabled={!viewerReady || slideIndex <= 0} onClick={() => void changeSlide(-1)}>上一页</button>
            <span>{slideIndex + 1} / {slideCount || "—"}</span>
            <button type="button" disabled={!viewerReady || slideIndex >= slideCount - 1} onClick={() => void changeSlide(1)}>下一页</button>
            <button type="button" aria-pressed={captionVisible} onClick={() => setCaptionVisible(!captionVisible)}>字幕{captionVisible ? "开" : "关"}</button>
            <button type="button" aria-pressed={autoSpeak} onClick={() => { const next = !autoSpeak; autoSpeakRef.current = next; setAutoSpeak(next); if (!next) stopSpeech(); else if (translation) speakTranslation(translation); }}>自动朗读{autoSpeak ? "开" : "关"}</button>
            <button type="button" disabled={!translation} onClick={() => translation && speakTranslation(translation)}>朗读译文</button>
            <button type="button" disabled={!speaking} onClick={stopSpeech}>停止朗读</button>
            {fullscreen && <button type="button" onClick={() => void openCurrentSlideLecture()}>AI讲解本页</button>}
            {fullscreen && <button type="button" onClick={() => void toggleFullscreen()}>退出全屏</button>}
          </div>
          {(translating || translationError || speechNotice || (captionVisible && translation)) && <div className={presentationStyles.caption} role="status" aria-live="polite">
            {translating ? <p>正在翻译所选内容…</p> : translationError ? <p>{translationError}</p> : captionVisible && translation ? <><small>{selectedText}</small><strong>{translation.translation}</strong><p>{translation.contextMeaning}</p>{translation.explanation && <p>{translation.explanation}</p>}<small>{translation.citation || translation.sourceLabel}</small></> : null}
            {speechNotice && <p>{speechNotice}</p>}
          </div>}

        </article>

        <aside className={styles.translationPane}>
          <header><span>CONTEXT TRANSLATION</span><h2>测绘语境翻译</h2><p>教材有明确译法时优先使用教材；否则由AI结合当前句和测绘专业语境翻译。</p></header>
          {selectedText ? (
            <div className={styles.selectionCard}>
              <small>当前所选</small><strong>{selectedText}</strong>
              {selectedSentence && selectedSentence !== selectedText ? <p>{selectedSentence}</p> : null}
              <div><button onClick={() => void requestTranslation(selectedText, selectedSentence)} type="button">翻译所选内容</button>{selectedSentence && selectedSentence !== selectedText ? <button onClick={() => void requestTranslation(selectedSentence, selectedSentence)} type="button">翻译完整句</button> : null}</div>
            </div>
          ) : <div className={styles.translationHint}><i>译</i><b>点击PPT中的内容</b><p>单击词汇、拖动选择短语或句子；双击可直接翻译当前完整句。</p></div>}
          {translating ? <div className={styles.translating}><i />正在检索演示课程知识并生成专业翻译…</div> : null}
          {translationError ? <div className={styles.translationError}>{translationError}</div> : null}
          {translation ? (
            <div className={styles.translationResult}>
              <span className={translation.sourceKind === "textbook" ? styles.textbookBadge : styles.aiBadge}>{translation.sourceLabel}</span>
              <section><small>推荐译法</small><h3>{translation.translation}</h3></section>
              <section><small>当前语境含义</small><p>{translation.contextMeaning}</p></section>
              {translation.explanation ? <section><small>专业说明</small><p>{translation.explanation}</p></section> : null}
              {translation.otherMeanings.length ? <section><small>其他常见含义</small><ul>{translation.otherMeanings.map((item, index) => <li key={`${item.meaning}-${index}`}><b>{item.meaning}</b>{item.usage ? <span>{item.usage}</span> : null}</li>)}</ul></section> : null}
              <footer>{translation.citation}</footer>
            </div>
          ) : null}
        </aside>
      </section>
    </section>
    <FullscreenLocalDigitalTeacher
      key={`${lectureRequest?.requestId}-${lectureOpen}`}
      preferredProvider="lite"
      mode="auto"
      onClose={() => setLectureOpen(false)}
      onFallbackVoice={() => {
        setLectureOpen(false);
      }}
      open={lectureOpen}
      presentationLecture={lectureRequest}
    />
    </>
  );
}
