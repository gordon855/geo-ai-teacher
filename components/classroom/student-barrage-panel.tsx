"use client";

import { useState, type FormEvent } from "react";
import styles from "./student-barrage-panel.module.css";

export default function StudentBarragePanel({ classId }: { classId: string }) {
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = content.replace(/\s+/gu, " ").trim();
    if (!message) return;
    setPending(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/classroom/barrage", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, content: message }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "匿名弹幕发送失败。");
      setContent("");
      setNotice("已提交待审核。教师审核通过后，课堂大屏才会匿名展示。");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "匿名弹幕发送失败。");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.copy}>
        <span>ANONYMOUS CLASS BARRAGE · VERSION 19</span>
        <h2>课堂匿名弹幕</h2>
        <p>可发送疑问、听课反馈或希望教师再次讲解的内容；大屏只显示“匿名学生”，不显示姓名和学号。</p>
      </div>
      <form onSubmit={submit}>
        <textarea
          aria-label="匿名弹幕内容"
          maxLength={80}
          onChange={(event) => { setContent(event.target.value); setNotice(""); setError(""); }}
          placeholder="例如：老师，可以再解释一下 accuracy 和 precision 的区别吗？"
          rows={2}
          value={content}
        />
        <div><small>{content.length}/80 · 每5秒最多1条</small><button disabled={pending || !content.trim()} type="submit">{pending ? "发送中…" : "提交教师审核"}</button></div>
      </form>
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <p className={styles.safety}>匿名仅指课堂显示匿名；系统会保留发送账号用于防刷屏和安全审计，课堂大屏不显示身份，安全审核人员可追溯发送者。</p>
    <p><a href="/classroom/barrage">静态记录与我的审核进度</a> · <a href="/reports">投诉举报与申诉</a></p>
    </section>
  );
}
