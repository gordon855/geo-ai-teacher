"use client";

import { useEffect, useState, type FormEvent } from "react";
import { randomTask } from "@/lib/step19/task-drafts";
import styles from "./assignment-panel.module.css";

type Submission = { id: string; studentName: string; studentNo: string; originalName: string; size: number; submittedAt: string; score: number | null; feedback: string; gradedAt: string | null };
type Assignment = { id: string; title: string; instructions: string; dueAt: string | null; attachmentName: string | null; attachmentSize: number; maxScore: number; status: string; createdAt: string; submissions: Submission[] };

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

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function TeacherAssignmentPanel({ classId, taskModule = "literature" }: { classId: string; taskModule?: "literature" | "terms" }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { score: string; feedback: string }>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [gradingId, setGradingId] = useState("");
  const [batchAssignmentId, setBatchAssignmentId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await request(`/api/assignments?classId=${encodeURIComponent(classId)}`);
      const rows = data.assignments || [];
      setAssignments(rows);
      setDrafts(Object.fromEntries(rows.flatMap((assignment: Assignment) => assignment.submissions.map((submission) => [submission.id, { score: submission.score === null ? "" : String(submission.score), feedback: submission.feedback || "" }]))));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "作业列表读取失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    request(`/api/assignments?classId=${encodeURIComponent(classId)}`)
      .then((data) => {
        if (!active) return;
        const rows = data.assignments || [];
        setAssignments(rows);
        setDrafts(Object.fromEntries(rows.flatMap((assignment: Assignment) => assignment.submissions.map((submission) => [submission.id, { score: submission.score === null ? "" : String(submission.score), feedback: submission.feedback || "" }]))));
        setError("");
      })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "作业列表读取失败。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [classId]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setNotice(""); setError("");
    try {
      const form = new FormData();
      form.set("classId", classId);
      form.set("taskModule", taskModule);
      form.set("title", title);
      form.set("instructions", instructions);
      if (dueAt) form.set("dueAt", dueAt);
      if (file) form.set("file", file);
      await request("/api/assignments", { method: "POST", body: form });
      setTitle(""); setInstructions(""); setDueAt(""); setFile(null);
      const input = document.getElementById("teacher-assignment-file") as HTMLInputElement | null;
      if (input) input.value = "";
      setNotice("作业已发布，学生端现在可以查看要求并提交Word作业。");
      await load();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "作业发布失败。");
    } finally { setPending(false); }
  }

  async function grade(submission: Submission) {
    const draft = drafts[submission.id] || { score: "", feedback: "" };
    const score = Number(draft.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) { setError("批改分数必须在0—100分之间。"); return; }
    setPending(true); setNotice(""); setError("");
    try {
      await request(`/api/submissions/${encodeURIComponent(submission.id)}/grade`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score, feedback: draft.feedback }) });
      setNotice(`${submission.studentName}的作业已按100分制完成批改。`);
      await load();
    } catch (gradeError) {
      setError(gradeError instanceof Error ? gradeError.message : "作业批改保存失败。");
    } finally { setPending(false); }
  }

  async function autoGrade(submission: Submission) {
    setGradingId(submission.id); setNotice(""); setError("");
    try {
      const data = await request(`/api/submissions/${encodeURIComponent(submission.id)}/auto-grade`, { method: "POST" });
      setNotice(`${submission.studentName}的Word作业已完成AI初评（${data.result?.score ?? "—"}/100），请教师复核后保存。`);
      await load();
    } catch (gradeError) {
      setError(gradeError instanceof Error ? gradeError.message : "AI自动批改失败。");
    } finally { setGradingId(""); }
  }

  async function autoGradeAll(assignment: Assignment) {
    const waiting = assignment.submissions.filter((submission) => submission.score === null);
    if (!waiting.length) { setNotice("本项作业没有待批提交。"); return; }
    setBatchAssignmentId(assignment.id); setNotice(""); setError("");
    let completed = 0;
    const failures: string[] = [];
    for (const submission of waiting) {
      setNotice(`正在依次AI批改：${completed + 1}/${waiting.length}（${submission.studentName}）`);
      try {
        await request(`/api/submissions/${encodeURIComponent(submission.id)}/auto-grade`, { method: "POST" });
        completed += 1;
      } catch (gradeError) {
        failures.push(`${submission.studentName}：${gradeError instanceof Error ? gradeError.message : "批改失败"}`);
      }
    }
    await load();
    setBatchAssignmentId("");
    if (failures.length) setError(`已完成${completed}份，${failures.length}份失败。${failures.join("；")}`);
    else setNotice(`“${assignment.title}”的${completed}份待批Word作业已完成AI初评，请逐份复核。`);
  }

  return (
    <div className={styles.teacherShell}>
      <section className={styles.heading}><div><span>ASSIGNMENT WORKFLOW · STEP 15.0</span><h1>作业发布与AI自动批改</h1><p>教师发布要求，学生提交可编辑文字的.docx；教师可单份或批量AI初评，并复核、修改100分制成绩与意见。</p></div><div className={styles.scoreBadge}><b>100</b><span>AI初评＋教师复核</span></div></section>
      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      <section className={styles.publishGrid}>
        <form className={styles.publishForm} onSubmit={publish}>
          <span>NEW ASSIGNMENT</span><h2>{taskModule === "terms" ? "术语任务" : "文献任务"} · 随机出题与发布</h2><button type="button" onClick={()=>{const draft=randomTask(taskModule);setTitle(draft.title);setInstructions(draft.instructions);}}>随机抽取题目草稿</button><p>从内置任务库随机抽题，修改要求后发布。学生上传Word后自动初评；失败时保留作业，教师可重试。</p>
          <label>作业标题<input maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="例如：Unit 15 GNSS术语与段落翻译" required value={title} /></label>
          <label>作业要求<textarea maxLength={5_000} onChange={(event) => setInstructions(event.target.value)} placeholder="写明翻译范围、格式、评价要求和提交说明。" rows={6} value={instructions} /></label>
          <label>截止时间（可不填）<input onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} /></label>
          <label className={styles.fileLabel} htmlFor="teacher-assignment-file"><i>W</i><span><b>{file?.name || "上传作业要求或模板（可选）"}</b><em>{file ? size(file.size) : "仅支持.docx，最大20MB"}</em></span></label>
          <input accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className={styles.hiddenInput} id="teacher-assignment-file" onChange={(event) => setFile(event.target.files?.[0] || null)} type="file" />
          <button className={styles.primary} disabled={pending}>{pending ? "正在发布…" : "发布给本班学生"}</button>
        </form>
        <article className={styles.rules}><span>WORKFLOW</span><h2>AI批改闭环</h2><ol><li><b>1</b><p><strong>教师发布</strong>标题、要求、截止时间和可选Word模板</p></li><li><b>2</b><p><strong>学生提交</strong>含可编辑文字的.docx；扫描图片暂不支持自动批改</p></li><li><b>3</b><p><strong>AI初评</strong>按专业内容40、测绘术语25、语言20、完整格式15评分</p></li><li><b>4</b><p><strong>教师复核</strong>修改分数与评语并保存；AI结果不能替代教师判断</p></li></ol></article>
      </section>

      <section className={styles.assignmentList}>
        <header><div><span>PUBLISHED ASSIGNMENTS</span><h2>已发布作业</h2></div><em>{assignments.length}项</em></header>
        {loading ? <div className={styles.loading}>正在读取作业与提交记录…</div> : null}
        {!loading && !assignments.length ? <div className={styles.empty}><b>本班尚未发布作业</b><p>使用上方表单发布第一项Word作业。</p></div> : null}
        {assignments.map((assignment) => {
          const graded = assignment.submissions.filter((submission) => submission.score !== null).length;
          const waiting = assignment.submissions.length - graded;
          return <article className={styles.assignmentCard} key={assignment.id}>
            <div className={styles.assignmentTop}><div><span>{assignment.status === "published" ? "收集中" : "已关闭"}</span><h3>{assignment.title}</h3><p>{assignment.instructions || "教师未填写补充说明。"}</p></div><dl><div><dt>已提交</dt><dd>{assignment.submissions.length}</dd></div><div><dt>已批改</dt><dd>{graded}</dd></div><div><dt>满分</dt><dd>100</dd></div></dl></div>
            <div className={styles.meta}><span>截止：{time(assignment.dueAt)}</span><span>发布：{time(assignment.createdAt)}</span>{assignment.attachmentName ? <a href={`/api/assignments/${assignment.id}/file`} target="_blank" rel="noreferrer">下载教师附件：{assignment.attachmentName}</a> : <span>无教师附件</span>}{waiting ? <button className={styles.primary} disabled={Boolean(batchAssignmentId || gradingId || pending)} onClick={() => void autoGradeAll(assignment)} style={{ marginLeft: "auto", padding: "10px 16px" }} type="button">{batchAssignmentId === assignment.id ? "正在依次AI批改…" : `AI批改全部待批（${waiting}）`}</button> : null}</div>
            {assignment.submissions.length ? <div className={styles.submissions}>{assignment.submissions.map((submission) => <div className={styles.submission} key={submission.id}>
              <div className={styles.student}><i>{submission.studentName.slice(-1)}</i><span><b>{submission.studentName}</b><em>{submission.studentNo} · {time(submission.submittedAt)}</em></span></div>
              <a className={styles.download} href={`/api/submissions/${submission.id}/file`} target="_blank" rel="noreferrer">下载Word<br /><small>{submission.originalName} · {size(submission.size)}</small></a>
              <label className={styles.scoreInput}>得分（0—100）<input max={100} min={0} onChange={(event) => setDrafts((value) => ({ ...value, [submission.id]: { ...(value[submission.id] || { feedback: "" }), score: event.target.value } }))} step="0.1" type="number" value={drafts[submission.id]?.score || ""} /></label>
              <label className={styles.feedbackInput}>批改意见{submission.feedback.startsWith("【AI自动批改") ? <small style={{ color: "#187b70", display: "block", marginTop: 4 }}>AI初评结果，请教师逐项复核</small> : null}<textarea maxLength={3_000} onChange={(event) => setDrafts((value) => ({ ...value, [submission.id]: { ...(value[submission.id] || { score: "" }), feedback: event.target.value } }))} placeholder="指出术语、语法、翻译和专业表达问题。" rows={3} value={drafts[submission.id]?.feedback || ""} /></label>
              <div style={{ display: "grid", gap: 8 }}><button className={styles.primary} disabled={Boolean(pending || batchAssignmentId || gradingId)} onClick={() => void autoGrade(submission)} style={{ padding: "10px 12px" }} type="button">{gradingId === submission.id ? "AI正在批改…" : submission.score === null ? "AI自动批改" : "重新AI批改"}</button><button className={styles.gradeButton} disabled={Boolean(pending || batchAssignmentId || gradingId)} onClick={() => void grade(submission)} type="button">{submission.gradedAt ? "保存教师复核" : "人工完成批改"}</button></div>
            </div>)}</div> : <div className={styles.noSubmission}>暂无学生提交，系统会持续保留该作业通道。</div>}
          </article>;
        })}
      </section>
    </div>
  );
}
