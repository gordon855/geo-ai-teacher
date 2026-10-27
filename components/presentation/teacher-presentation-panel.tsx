"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TeacherPresentationWorkspace from "./teacher-presentation-workspace";
import styles from "./teacher-presentation-panel.module.css";

type Deck = { originalName: string; size: number; version: string; updatedAt: string; updatedBy: string;
  isCurrent: boolean; analysis?: { slideCount: number; underlineCount: number; termCount: number } | null };
type UploadItem = { file: File; status: "waiting" | "uploading" | "done" | "failed"; message: string; progress: number };
const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function uploadFile(file: File, progress: (n: number) => void) {
  return new Promise<{ presentation: Deck & { duplicate?: boolean } }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/presentation/catalog");
    xhr.timeout = 180000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new Error("网络中断；可重试此文件，已成功的文件会保留。"));
    xhr.ontimeout = () => reject(new Error("上传或解析超时，请刷新课件库确认；若未保存可重试。"));
    xhr.onload = () => {
      let payload;
      try { payload = JSON.parse(xhr.responseText); } catch { reject(new Error(`上传失败（HTTP ${xhr.status}），请检查文件大小与网络。`)); return; }
      if (xhr.status >= 200 && xhr.status < 300 && payload.ok) resolve(payload);
      else reject(new Error(payload.error || `上传失败（HTTP ${xhr.status}）`));
    };
    const form = new FormData(); form.set("file", file); xhr.send(form);
  });
}

export default function TeacherPresentationPanel({ teacherName }: { teacherName: string }) {
  const [catalog, setCatalog] = useState<Deck[]>([]);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const current = catalog.find((deck) => deck.isCurrent) || null;

  const refresh = useCallback(async () => {
    const response = await fetch("/api/presentation/catalog", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "课件库读取失败。");
    setCatalog(payload.presentations);
    setSelected((value) => value || payload.presentations.find((p: Deck) => p.isCurrent)?.version || payload.presentations[0]?.version || "");
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((e) => setError(e.message)).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  function chooseFiles(files: FileList | null) {
    if (!files || busyRef.current) return;
    setQueue(Array.from(files).map((file) => ({ file, status: "waiting", progress: 0, message: "等待上传" })));
    setError(""); setNotice("");
  }
  async function upload() {
    if (busyRef.current) return;
    busyRef.current = true; setUploading(true); setError(""); setNotice("");
    let successes = 0; let failures = 0;
    const update = (index: number, patch: Partial<UploadItem>) => setQueue((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
    try {
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i]; if (item.status === "done") continue;
        try {
          if (!/\.pptx$/iu.test(item.file.name)) throw new Error("请在PowerPoint或WPS中另存为 .pptx 后上传。");
          if (!item.file.size || item.file.size > 80 * 1024 * 1024) throw new Error("文件为空或超过80MB，请拆分或压缩媒体。");
          update(i, { status: "uploading", progress: 0, message: "正在上传" });
          const result = await uploadFile(item.file, (progress) => update(i, { progress, message: progress === 100 ? "上传完成，正在解析课件…" : `正在上传 ${progress}%` }));
          successes++; update(i, { status: "done", progress: 100, message: result.presentation.duplicate ? "已在课件库中，无需重复上传" : "已保存到课件库" });
        } catch (e) { failures++; update(i, { status: "failed", message: e instanceof Error ? e.message : "上传失败" }); }
      }
      await refresh();
      setNotice(`本次成功 ${successes} 份，失败 ${failures} 份。选择课件并点击“在讲授台展示”后才会切换课堂内容。`);
    } catch (e) { setError(e instanceof Error ? e.message : "刷新失败，请点击刷新课件库。"); }
    finally { busyRef.current = false; setUploading(false); }
  }
  async function displayDeck() {
    if (!selected || busyRef.current) return;
    busyRef.current = true; setSwitching(true); setError(""); setNotice("");
    try {
      if (selected !== current?.version) {
        const response = await fetch("/api/presentation/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: selected }) });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "课件切换失败。");
      }
      await refresh();
      setNotice("已切换课堂课件。下方讲授台正在加载，学生端也会同步当前课件。请等页面载入后再启动数字人讲解。");
      window.setTimeout(() => stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) { setError(e instanceof Error ? e.message : "课件切换失败。"); }
    finally { busyRef.current = false; setSwitching(false); }
  }
  const visible = catalog.filter((p) => p.originalName.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const chosen = catalog.find((p) => p.version === selected);
  return <>
    <section className={styles.heading}>
      <div><small>VERSION 21.4 · COURSE PRESENTATIONS</small><h1>课堂交互PPT · 课件库</h1><p>集中上传课程课件，选择一份在讲授台展示，再让数字教师讲解当前页。</p></div>
      {current && <a href={`/api/presentation/file?v=${current.version}`} rel="noreferrer" target="_blank">下载当前课件 ↗</a>}
    </section>
    {notice && <div className={styles.notice} role="status">{notice}</div>}
    {error && <div className={styles.error} role="alert">{error}</div>}
    <section className={styles.grid}>
      <article className={styles.uploadCard}>
        <span className={styles.eyebrow}>1 · UPLOAD</span><h2>批量上传课程PPT</h2>
        <p>可以一次选择多份 .pptx；每份不超过80MB，按顺序上传。上传不会切换正在讲授的课件；相同内容自动去重。旧版 .ppt 请先另存为 .pptx。</p>
        <label htmlFor="teacher-presentation-file"><i>PPTX</i><span><b>{queue.length ? `已选择 ${queue.length} 份课件` : "选择一份或多份PPTX"}</b><em>按 Ctrl 或 Shift 可多选文件</em></span></label>
        <input ref={inputRef} disabled={uploading || switching} multiple accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" id="teacher-presentation-file" onChange={(e) => chooseFiles(e.target.files)} type="file" />
        <button disabled={uploading || switching || !queue.some((item) => item.status !== "done")} onClick={() => void upload()} type="button">{uploading ? "正在逐份上传，请保持本页打开…" : queue.some((item) => item.status === "failed") ? "重试未成功的课件" : "上传到课件库"}</button>
        {!!queue.length && <ul className={styles.uploadList} aria-live="polite">{queue.map((item, i) => <li key={`${item.file.name}-${i}`} data-status={item.status}><b>{item.file.name}</b><span>{size(item.file.size)} · {item.message}</span>{item.status === "uploading" && <progress max={100} value={item.progress} />}</li>)}</ul>}
      </article>
      <article className={`${styles.currentCard} ${styles.libraryCard}`}>
        <span className={styles.eyebrow}>2 · SELECT</span><h2>选择要讲授的课件</h2>
        <p>当前课堂：<strong>{current?.originalName || "尚未选择"}</strong></p>
        <label htmlFor="presentation-search">搜索课件名称</label><input id="presentation-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例如：Unit 2 或 水准测量" />
        <label htmlFor="presentation-choice">课件库（{catalog.length}份）</label>
        <select id="presentation-choice" value={visible.some((p) => p.version === selected) ? selected : ""} onChange={(e) => setSelected(e.target.value)} disabled={loading || uploading || switching}>
          <option value="">{loading ? "正在读取…" : visible.length ? "请选择课件" : "暂无匹配课件"}</option>
          {visible.map((p) => <option key={p.version} value={p.version}>{p.isCurrent ? "【当前】" : ""}{p.originalName} · {p.analysis?.slideCount || "?"}页 · {p.version.slice(0, 6)}</option>)}
        </select>
        {chosen && <p>{size(chosen.size)} · {chosen.analysis?.slideCount || "—"}页 · 上传于 {new Date(chosen.updatedAt).toLocaleString("zh-CN")}</p>}
        <div className={styles.libraryActions}><button disabled={!selected || !visible.some((p) => p.version === selected) || uploading || switching || loading} onClick={() => void displayDeck()} type="button">{switching ? "正在切换…" : "在讲授台展示 ↓"}</button><button disabled={uploading || switching} onClick={() => void refresh().catch((e) => setError(e.message))} type="button">刷新课件库</button></div>
        <p className={styles.libraryHint}>沿用全课程共享的“当前课件”。切换后，其他教师和学生的交互PPT页面也会同步；批量上传期间不受影响。开始讲解后，请先结束数字人讲解再切换课件。</p>
      </article>
    </section>
    <div ref={stageRef} className={styles.stageAnchor}>
      {current ? <TeacherPresentationWorkspace key={current.version} teacherName={teacherName} /> : <div className={styles.empty}><b>上传课件后，选择它并点击“在讲授台展示”</b><p>已有历史课件会自动出现在上方列表，无需重新上传。</p></div>}
    </div>
  </>;
}
