"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PhotoAvatarStage, {
  type PhotoAvatarAudioSignals,
  type PhotoAvatarGesture,
  type PhotoAvatarMotion,
} from "@/components/avatar/photo-avatar-stage";
import { visemeAtProgress } from "@/lib/step11-5/viseme-timeline";
import styles from "./page.module.css";

type DemoState = "idle" | "listening" | "thinking" | "speakingZh" | "speakingEn";

const COPY: Record<DemoState, { label: string; title: string; caption: string }> = {
  idle: { label: "待机", title: "AI教师在线", caption: "自然呼吸、随机眨眼，并等待学生提问。" },
  listening: { label: "聆听", title: "请直接说出问题", caption: "停顿约0.7秒后自动提交中英文混合语音。" },
  thinking: { label: "思考", title: "正在检索课程资料", caption: "正在从演示课程知识块中匹配教材章节与页码。" },
  speakingZh: { label: "中文讲话", title: "正在讲解摄影测量", caption: "摄影测量是通过影像获取物体几何信息的技术。" },
  speakingEn: { label: "English", title: "Explaining photogrammetry", caption: "Photogrammetry obtains reliable measurements from photographs." },
};

const ZH_TEXT = "摄影测量是通过影像获取物体几何信息的技术。它把摄影与量测结合起来，广泛用于地形测图、三维重建和遥感应用。";
const EN_TEXT = "Photogrammetry is the science and technology of obtaining reliable measurements from photographs. It supports mapping, terrain modeling, and three-dimensional reconstruction.";

function stopSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export default function Avatar25DDemoPage() {
  const [demoState, setDemoState] = useState<DemoState>("idle");
  const [gesture, setGesture] = useState<PhotoAvatarGesture>("neutral");
  const [notice, setNotice] = useState("无需配置API Key即可预览人物动作；正式问答继续调用现有百炼与课程知识库。\n");
  const signals = useRef<PhotoAvatarAudioSignals>({ open: 0, wide: 0, round: 0, viseme: "rest" });
  const timers = useRef<number[]>([]);
  const mouthTimer = useRef<number | null>(null);
  const token = useRef(0);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    if (mouthTimer.current !== null) window.clearInterval(mouthTimer.current);
    mouthTimer.current = null;
    signals.current = { open: 0, wide: 0, round: 0, viseme: "rest" };
    setGesture("neutral");
  }, []);

  const speak = useCallback((language: "zh" | "en") => {
    clearTimers();
    stopSpeech();
    const currentToken = ++token.current;
    const text = language === "zh" ? ZH_TEXT : EN_TEXT;
    setDemoState(language === "zh" ? "speakingZh" : "speakingEn");
    setGesture("open-palm");
    setNotice(text);
    let tick = 0;
    mouthTimer.current = window.setInterval(() => {
      tick += 1;
      const open = tick % 4 === 0 ? 0.08 : 0.28 + Math.abs(Math.sin(tick * 1.7)) * 0.62;
      const progress = Math.min(0.999, tick / (language === "zh" ? 92 : 104));
      signals.current = {
        open,
        wide: 0.44 + Math.abs(Math.sin(tick * 0.73)) * 0.48,
        round: 0.24 + Math.abs(Math.cos(tick * 0.51)) * 0.62,
        viseme: visemeAtProgress(text, progress),
      };
      if (tick === 24) setGesture("two-hands");
      if (tick === 52) setGesture("emphasis");
    }, language === "zh" ? 105 : 122);

    const finish = () => {
      if (token.current !== currentToken) return;
      clearTimers();
      setDemoState("idle");
      setGesture("neutral");
      setNotice("讲解结束。可以继续查看另一种语言，或模拟学生打断。\n");
    };
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === "zh" ? "zh-CN" : "en-US";
      utterance.rate = language === "zh" ? 0.92 : 0.88;
      const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith(language));
      if (voice) utterance.voice = voice;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    }
    timers.current.push(window.setTimeout(finish, 12_000));
  }, [clearTimers]);

  const fullDemo = useCallback(() => {
    clearTimers();
    stopSpeech();
    token.current += 1;
    setDemoState("listening");
    setGesture("neutral");
    setNotice("学生：Please explain photogrammetry in Chinese and English.");
    timers.current.push(window.setTimeout(() => {
      setDemoState("thinking");
      setNotice("正在匹配教材中的 photogrammetry、摄影测量、stereopair 等关键词……");
    }, 1_900));
    timers.current.push(window.setTimeout(() => speak("zh"), 3_900));
  }, [clearTimers, speak]);

  const interrupt = useCallback(() => {
    clearTimers();
    stopSpeech();
    token.current += 1;
    setDemoState("listening");
    setGesture("neutral");
    setNotice("已打断AI教师，重新开始聆听。学生可以立即追问。\n");
  }, [clearTimers]);

  useEffect(() => () => {
    clearTimers();
    stopSpeech();
  }, [clearTimers]);

  const content = COPY[demoState];
  const motion: PhotoAvatarMotion = demoState === "listening"
    ? "listening"
    : demoState === "thinking"
      ? "thinking"
      : demoState === "speakingZh" || demoState === "speakingEn"
        ? "speaking"
        : "idle";
  const canInterrupt = motion === "thinking" || motion === "speaking";

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><b>VERSION 21 · ZERO-COST AVATAR</b><span>多口型与自然讲解手势 · 阿里云大陆部署版</span></div>
        <Link href="/">返回课程主页</Link>
      </header>
      <section className={styles.workspace}>
        <div className={styles.stageWrap}>
          <PhotoAvatarStage audioSignals={signals} gesture={gesture} motion={motion} compact />
          <div className={styles.statePill} aria-live="polite"><i /><span>{content.label}</span><strong>{content.title}</strong></div>
        </div>
        <aside className={styles.panel}>
          <span className={styles.kicker}>PHOTO-REAL LOCAL AVATAR</span>
          <h1>确认版女教师<br />自然动作验证</h1>
          <p>{content.caption}</p>
          <div className={styles.caption} aria-live="polite"><small>实时字幕</small><span>{notice}</span></div>
          <div className={styles.source}><small>教材来源演示</small><b>《测绘专业英语》· 摄影测量章节</b><span>正式版会继续显示对应章节、页码与知识块来源。</span></div>
          <div className={styles.controls}>
            <button className={styles.primary} onClick={fullDemo} type="button">▶ 完整演示</button>
            <button onClick={() => { clearTimers(); stopSpeech(); setDemoState("listening"); setNotice("正在聆听中英文混合提问……"); }} type="button">聆听</button>
            <button onClick={() => { clearTimers(); stopSpeech(); setDemoState("thinking"); setNotice("正在检索演示课程知识块……"); }} type="button">思考</button>
            <button onClick={() => speak("zh")} type="button">中文讲话</button>
            <button onClick={() => speak("en")} type="button">English</button>
            <button className={styles.interrupt} disabled={!canInterrupt} onClick={interrupt} type="button">打断老师</button>
          </div>
          <div className={styles.features}><span>五类口型</span><span>文字＋音频同步</span><span>三组讲解手势</span><span>学生插话</span></div>
        </aside>
      </section>
    </main>
  );
}
