"use client";

import { useEffect, useRef, useState } from "react";
import type { BarrageMessage } from "@/lib/step8a/types";
import styles from "./barrage-live-display.module.css";

type FeedState = { active: BarrageMessage | null; queue: BarrageMessage[] };

function promote(state: FeedState, paused: boolean): FeedState {
  if (paused || state.active || !state.queue.length) return state;
  return { active: state.queue[0], queue: state.queue.slice(1) };
}

function BarrageLiveDisplaySession({ classId }: { classId?: string }) {
  const [feed, setFeed] = useState<FeedState>({ active: null, queue: [] });
  const [staticMessages, setStaticMessages] = useState<BarrageMessage[]>([]);
  const [paused, setPaused] = useState(false);
  const seenRef = useRef(new Set<string>());
  const pausedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    const controller = new AbortController();
    const poll = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      try {
        const query = classId ? `?classId=${encodeURIComponent(classId)}` : "";
        const response = await fetch(`/api/classroom/barrage${query}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json().catch(() => null) as { messages?: BarrageMessage[] } | null;
        const visible = payload?.messages || [];
        if (!alive) return;
        setStaticMessages(visible);
        const ids = new Set(visible.map(message => message.id));
        const incoming = visible.filter((message) => {
          if (!message?.id || seenRef.current.has(message.id)) return false;
          seenRef.current.add(message.id);
          return Date.now() - new Date(message.createdAt).getTime() <= 90_000;
        });
        if (alive) {
          setFeed((current) => promote({
            active: current.active && ids.has(current.active.id) ? current.active : null,
            queue: [...current.queue.filter(message=>ids.has(message.id)), ...incoming].slice(-30),
          }, pausedRef.current));
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // 短时断线保持静默，下一轮自动恢复。
        }
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1_200);
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [classId]);

  useEffect(() => {
    if (!feed.active || paused) return;
    const timer = window.setTimeout(() => {
      setFeed((current) => promote({ active: null, queue: current.queue }, pausedRef.current));
    }, 6_800);
    return () => window.clearTimeout(timer);
  }, [feed.active, paused]);

  function togglePaused() {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (!next) setFeed((current) => promote(current, false));
  }

  async function clearCurrent() {
    const current = feed.active;
    setFeed((state) => promote({ active: null, queue: state.queue }, pausedRef.current));
    if (!current) return;
    await fetch("/api/classroom/barrage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: current.id }),
    }).catch(() => null);
  }

  async function clearClass() {
    if (!classId) return;
    setFeed({ active: null, queue: [] });
    await fetch("/api/classroom/barrage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId }),
    }).catch(() => null);
  }



  return (
    <section className={`${styles.layer} ${!feed.active && !paused ? styles.docked : ""}`} aria-label="匿名课堂弹幕" aria-live="polite">
      {feed.active ? (
        <div className={styles.message} key={feed.active.id}>
          <div className={styles.meta}><b>{feed.active.anonymousLabel}</b><span>{feed.active.className}</span></div>
          <p>{feed.active.content}</p>
        </div>
      ) : paused ? <div className={styles.paused}>匿名弹幕已暂停 · 队列中{feed.queue.length}条</div> : null}
      <details style={{pointerEvents:'auto',background:'#082834',padding:8,borderRadius:8,maxHeight:220,overflow:'auto'}}><summary>已审核弹幕 · 静态查看（{staticMessages.length}）</summary>{staticMessages.map(message=><p key={message.id}>{message.content} <a style={{color:'#7ee7d4'}} href={`/reports?target=${encodeURIComponent('barrage:'+message.id)}`}>举报</a></p>)}<a style={{color:'#7ee7d4'}} href="/classroom/barrage">查看历史记录</a></details>
      <div className={styles.controls}>
        <button onClick={togglePaused} type="button">{paused ? "继续显示" : "暂停"}</button>
        {feed.active ? <button onClick={() => void clearCurrent()} type="button">清除此条</button> : null}
        {classId ? <button onClick={() => void clearClass()} type="button">本班清屏</button> : null}
      </div>
    </section>
  );
}

export default function BarrageLiveDisplay({ classId }: { classId?: string }) {
  return <BarrageLiveDisplaySession classId={classId} key={classId || "all-classes"} />;
}
