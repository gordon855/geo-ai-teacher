"use client";

import { useEffect, useState } from "react";
import styles from "./assignment-panel.module.css";

type Submission = { id: string; originalName: string; size: number; submittedAt: string; score: number | null; feedback: string; gradedAt: string | null };
type Assignment = { id: string; className: string; title: string; instructions: string; dueAt: string | null; attachmentName: string | null; maxScore: number; status: string; createdAt: string; submission: Submission | null };

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "作业服务处理失败。");
  return data;
}

function time(value: string | null) {
  if (!value) return "未设置截止时间";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export default function StudentAssignmentPanel() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [pendingId, setPendingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await request("/api/assignments");
      setAssignments(data.assignments || []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "作业列表读取失败。");
    }
  }

  useEffect(() => {
    let active = true;
    request("/api/assignments")
      .then((data) => { if (active) { setAssignments(data.assignments || []); setError(""); } })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "作业列表读取失败。"); });
    return () => { active = false; };
  }, []);

  async function submit(assignment: Assignment) {
    const file = files[assignment.id];
    if (!file) { setError("请先选择要提交的Word .docx作业。"); return; }
    setPendingId(assignment.id); setNotice(""); setError("");
    try {
      const form = new FormData(); form.set("file", file);
      const result = await request(`/api/assignments/${assignment.id}/submit`, { method: "POST", body: form });
      setFiles((value) => ({ ...value, [assignment.id]: null }));
      const input = document.getElementById(`student-assignment-${assignment.id}`) as HTMLInputElement | null;
      if (input) input.value = "";
      setNotice(result.gradingError ? `“${assignment.title}”已保存，AI初评暂不可用，请等待教师复核或重试。` : `“${assignment.title}”已保存并完成AI初评，请查看反馈；最终结果由教师复核。`);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Word作业提交失败。");
    } finally { setPendingId(""); }
  }

  return (
    <section className={styles.studentShell} id="assignments">
      <header><div><span>WORD ASSIGNMENTS · STEP 15.0</span><h2>课程作业与AI批改反馈</h2><p>下载教师要求，提交含可编辑文字的.docx作业，并查看AI初评及教师复核后的100分制结果。</p></div><b>{assignments.length}<em>项作业</em></b></header>
      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      {!assignments.length ? <div className={styles.empty}><b>教师尚未发布作业</b><p>新作业发布后会自动显示在这里。</p></div> : null}
      <div className={styles.studentGrid}>{assignments.map((assignment) => <article key={assignment.id}>
        <div className={styles.studentAssignmentTop}><span>{assignment.className}</span><em>{assignment.status === "published" ? "可提交" : "已关闭"}</em></div>
        <h3>{assignment.title}</h3><p>{assignment.instructions || "教师未填写补充说明。"}</p>
        <div className={styles.studentMeta}><span>截止：{time(assignment.dueAt)}</span><span>满分：100分</span>{assignment.attachmentName ? <a href={`/api/assignments/${assignment.id}/file`}>下载教师附件：{assignment.attachmentName}</a> : null}</div>
        <div className={styles.studentSubmit}>
          <label htmlFor={`student-assignment-${assignment.id}`}><i>W</i><span><b>{files[assignment.id]?.name || (assignment.submission ? "重新选择Word作业" : "选择Word作业")}</b><em>仅.docx，最大20MB</em></span></label>
          <input accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" id={`student-assignment-${assignment.id}`} onChange={(event) => setFiles((value) => ({ ...value, [assignment.id]: event.target.files?.[0] || null }))} type="file" />
          <button disabled={pendingId === assignment.id || assignment.status !== "published"} onClick={() => void submit(assignment)} type="button">{pendingId === assignment.id ? "正在提交…" : assignment.submission ? "重新提交并覆盖旧版" : "提交Word作业"}</button>
        </div>
        {assignment.submission ? <div className={styles.studentResult}><div><span>已提交</span><b>{assignment.submission.originalName}</b><em>{time(assignment.submission.submittedAt)}</em><a href={`/api/submissions/${assignment.submission.id}/file`}>下载我提交的Word</a></div>{assignment.submission.score === null ? <div className={styles.waiting}><b>等待AI批改或教师复核</b><p>批改结果会显示在此处。</p></div> : <div className={styles.graded}><b>{assignment.submission.score}<small>/100</small></b><span>{assignment.submission.feedback.startsWith("【AI自动批改") ? "AI初评（教师可继续复核）" : "教师批改意见"}</span><p>{assignment.submission.feedback || "教师已评分，未填写补充意见。"}</p></div>}</div> : null}
      </article>)}</div>
    </section>
  );
}
