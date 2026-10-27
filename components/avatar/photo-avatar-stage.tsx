"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { TextViseme } from "@/lib/step11-5/viseme-timeline";
import styles from "./photo-avatar-stage.module.css";

export type PhotoAvatarMotion = "idle" | "listening" | "thinking" | "speaking";
export type PhotoAvatarGesture = "neutral" | "open-palm" | "two-hands" | "emphasis";

export type PhotoAvatarAudioSignals = {
  open: number;
  wide: number;
  round: number;
  viseme: TextViseme;
};

type LayerRefs = {
  open: HTMLImageElement | null;
  round: HTMLImageElement | null;
  wide: HTMLImageElement | null;
  teeth: HTMLImageElement | null;
  tongue: HTMLImageElement | null;
};

const EMPTY_WEIGHTS = { open: 0, round: 0, wide: 0, teeth: 0, tongue: 0 };

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function targetWeights(signal: PhotoAvatarAudioSignals) {
  const intensity = clamp(signal.open);
  if (intensity < 0.025 || signal.viseme === "rest" || signal.viseme === "closed") return EMPTY_WEIGHTS;
  const strength = clamp(0.2 + intensity * 0.8);
  if (signal.viseme === "open") return { ...EMPTY_WEIGHTS, open: strength };
  if (signal.viseme === "round") return { ...EMPTY_WEIGHTS, round: strength * 0.9 };
  if (signal.viseme === "wide") return { ...EMPTY_WEIGHTS, wide: strength * 0.88 };
  if (signal.viseme === "teeth") return { ...EMPTY_WEIGHTS, teeth: clamp(0.52 + intensity * 0.38) };
  if (signal.viseme === "tongue") return { ...EMPTY_WEIGHTS, tongue: clamp(0.5 + intensity * 0.4) };

  const wide = clamp(signal.wide);
  const round = clamp(signal.round);
  const open = clamp(1 - Math.max(wide * 0.82, round * 0.88), 0.16, 1);
  const total = Math.max(0.01, open + wide + round);
  return {
    ...EMPTY_WEIGHTS,
    open: strength * open / total,
    wide: strength * wide / total,
    round: strength * round / total,
  };
}

export default function PhotoAvatarStage({
  motion,
  gesture = "neutral",
  audioSignals,
  compact = false,
}: {
  motion: PhotoAvatarMotion;
  gesture?: PhotoAvatarGesture;
  audioSignals: RefObject<PhotoAvatarAudioSignals>;
  compact?: boolean;
}) {
  const [blinking, setBlinking] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const layerRefs = useRef<LayerRefs>({ open: null, round: null, wide: null, teeth: null, tongue: null });

  useEffect(() => {
    let stopped = false;
    let blinkTimer = 0;
    let reopenTimer = 0;
    const scheduleBlink = () => {
      blinkTimer = window.setTimeout(() => {
        if (stopped) return;
        setBlinking(true);
        reopenTimer = window.setTimeout(() => setBlinking(false), 118);
        scheduleBlink();
      }, 3_100 + Math.random() * 3_100);
    };
    scheduleBlink();
    return () => {
      stopped = true;
      window.clearTimeout(blinkTimer);
      window.clearTimeout(reopenTimer);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const current = { ...EMPTY_WEIGHTS };
    const animateMouth = () => {
      frame = window.requestAnimationFrame(animateMouth);
      const signal = audioSignals.current || { open: 0, wide: 0, round: 0, viseme: "rest" as const };
      const target = targetWeights(signal);
      (Object.keys(current) as Array<keyof typeof current>).forEach((key) => {
        current[key] += (target[key] - current[key]) * (target[key] > current[key] ? 0.46 : 0.62);
        const element = layerRefs.current[key];
        if (element) element.style.opacity = String(clamp(current[key]));
      });
    };
    frame = window.requestAnimationFrame(animateMouth);
    return () => window.cancelAnimationFrame(frame);
  }, [audioSignals]);

  const gestureClass = (name: Exclude<PhotoAvatarGesture, "neutral">) =>
    `${styles.image} ${styles.gestureLayer} ${gesture === name ? styles.gestureVisible : ""}`;

  return (
    <div
      className={`${styles.stage} ${styles[`motion_${motion}`]} ${compact ? styles.compact : ""}`}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setLook({
          x: ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2,
          y: ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2,
        });
      }}
      onPointerLeave={() => setLook({ x: 0, y: 0 })}
      style={{ "--look-x": look.x, "--look-y": look.y } as React.CSSProperties}
    >
      <div className={styles.ambient} aria-hidden="true"><i /><i /></div>
      <div className={styles.floor} aria-hidden="true" />
      <div className={styles.figure}>
        <Image
          alt="白色西装、灰蓝衬衫的高挑写实AI女教师"
          className={`${styles.image} ${styles.base}`}
          height={1620}
          priority
          sizes="(max-width: 760px) 50vh, 470px"
          src="/avatar25d/teacher-base.svg"
          width={971}
        />
        <Image alt="" aria-hidden="true" className={gestureClass("open-palm")} height={1620} priority src="/avatar25d/teacher-gesture-open-palm.svg" width={971} />
        <Image alt="" aria-hidden="true" className={gestureClass("two-hands")} height={1620} priority src="/avatar25d/teacher-gesture-two-hands.svg" width={971} />
        <Image alt="" aria-hidden="true" className={gestureClass("emphasis")} height={1620} priority src="/avatar25d/teacher-gesture-emphasis.svg" width={971} />
        <Image
          alt=""
          aria-hidden="true"
          className={`${styles.image} ${styles.eyeLayer} ${blinking ? styles.visible : ""}`}
          height={1620}
          priority
          src="/avatar25d/teacher-blink-source.svg"
          width={971}
        />
        <Image ref={(node) => { layerRefs.current.open = node; }} alt="" aria-hidden="true" className={`${styles.image} ${styles.mouthLayer}`} height={1620} priority src="/avatar25d/teacher-mouth-a-source.svg" width={971} />
        <Image ref={(node) => { layerRefs.current.round = node; }} alt="" aria-hidden="true" className={`${styles.image} ${styles.mouthLayer}`} height={1620} priority src="/avatar25d/teacher-mouth-o-source.svg" width={971} />
        <Image ref={(node) => { layerRefs.current.wide = node; }} alt="" aria-hidden="true" className={`${styles.image} ${styles.mouthLayer}`} height={1620} priority src="/avatar25d/teacher-mouth-ei-source.svg" width={971} />
        <Image ref={(node) => { layerRefs.current.teeth = node; }} alt="" aria-hidden="true" className={`${styles.image} ${styles.mouthLayer}`} height={1620} priority src="/avatar25d/teacher-mouth-fv-source.svg" width={971} />
        <Image ref={(node) => { layerRefs.current.tongue = node; }} alt="" aria-hidden="true" className={`${styles.image} ${styles.mouthLayer}`} height={1620} priority src="/avatar25d/teacher-mouth-ln-source.svg" width={971} />
      </div>
      <div className={`${styles.voiceWave} ${motion === "listening" || motion === "speaking" ? styles.waveActive : ""}`} aria-hidden="true">
        {Array.from({ length: 13 }).map((_, index) => <i key={index} style={{ animationDelay: `${index * -0.052}s` }} />)}
      </div>
      <span className={styles.renderBadge}>多口型 · 讲解手势 · 本机渲染</span>
    </div>
  );
}
