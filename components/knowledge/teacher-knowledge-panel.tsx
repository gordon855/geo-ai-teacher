"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./teacher-knowledge-panel.module.css";

type Source = {
  id: string;
  originalName: string;
  displayName: string;
  size: number;
  documentCount: number;
  chunkCount: number;
  extractedCharacters: number;
  status: "ready" | "paused";
  createdAt: string;
  updatedAt: string;
};

type Stats = { sourceCount: number; chunkCount: number; documentCount: number };

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "服务器处理失败。");
  return payload;
}

function size(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export default function TeacherKnowledgePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Stats>({ sourceCount: 0, chunkCount: 0, documentCount: 0 });
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    requestJson("/api/knowledge/sources").then((payload) => {
      if (!active) return;
      setSources(payload.sources || []);
      setStats(payload.stats || { sourceCount: 0, chunkCount: 0, documentCount: 0 });
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "无法读取知识库状态。");
    });
    return () => { active = false; };
  }, []);

  async function upload() {
    if (!file) { setError("请先选择.txt、.md、.docx、.pptx或.zip文件。"); return; }
    setPending(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("displayName", displayName);
      const payload = await requestJson("/api/knowledge/sources", { method: "POST", body: form });
      setSources(payload.sources || []);
      setStats(payload.stats || stats);
      setNotice(payload.duplicate
        ? "该文件内容已经导入过；系统已保留原资料并重新启用。"
        : `导入完成：识别${payload.source.documentCount}个文档，新增${payload.source.chunkCount}个可追溯知识块。`);
      setFile(null); setDisplayName("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "知识库导入失败。");
    } finally { setPending(false); }
  }

  async function toggle(source: Source) {
    setPending(true); setError(""); setNotice("");
    try {
      const payload = await requestJson("/api/knowledge/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: source.id, active: source.status !== "ready" }),
      });
      setSources(payload.sources || []);
      setStats(payload.stats || stats);
      setNotice(source.status === "ready" ? "资料已停用；原文件和知识块仍保留，可随时重新启用。" : "资料已重新加入AI教师检索范围。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资料状态更新失败。");
    } finally { setPending(false); }
  }

  return <>
    <section className={styles.heading}>
      <div><small>TEACHER KNOWLEDGE STUDIO · VERSION 21</small><h1>本地知识库</h1><p>上传补充教材、测绘文献和GIS软件资料，系统安全提取文字并加入AI教师的来源可追溯检索。</p></div>
      <aside><b>813 + {stats.chunkCount}</b><span>内置知识块 + 教师自建</span></aside>
    </section>
    {notice ? <div className={styles.notice}>{notice}</div> : null}
    {error ? <div className={styles.error}>{error}</div> : null}
    <section className={styles.safety}><i>盾</i><div><b>不会覆盖原演示课程知识库</b><p>导入资料单独保存在私有OSS和PostgreSQL中；停用只退出检索，不会删除原文件。ZIP会检查路径、文件数、解压体积和危险类型。</p></div><span>仅教师可操作</span></section>
    <section className={styles.grid}>
      <article className={styles.uploader}>
        <header><i>库</i><div><small>ADD SOURCE</small><h2>导入本地资料</h2></div></header>
        <label className={styles.drop} htmlFor="teacher-knowledge-file"><input accept=".txt,.md,.docx,.pptx,.zip" id="teacher-knowledge-file" onChange={(event) => setFile(event.target.files?.[0] || null)} ref={inputRef} type="file" /><b>{file?.name || "点击选择文档或ZIP资料包"}</b><span>{file ? size(file.size) : "支持 TXT、Markdown、Word、PPTX、ZIP；单次最大25MB"}</span></label>
        <label className={styles.name}><span>资料显示名称（可选）</span><input maxLength={100} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：GNSS野外测量补充文献" value={displayName} /></label>
        <div className={styles.pipeline}>{["安全校验", "文字提取", "智能分块", "加入检索"].map((item, index) => <span key={item}><i>{index + 1}</i>{item}</span>)}</div>
        <button className={styles.primary} disabled={pending} onClick={() => void upload()}>{pending ? "正在校验、提取并写入……" : "导入并建立索引"}</button>
      </article>
      <aside className={styles.rules}>
        <small>IMPORT POLICY</small><h2>首发支持范围</h2>
        <dl><div><dt>单文件</dt><dd>.txt / .md / .docx / .pptx</dd></div><div><dt>ZIP资料包</dt><dd>最多60个允许类型文档</dd></div><div><dt>文字上限</dt><dd>一次最多65万可识别字符</dd></div><div><dt>安全限制</dt><dd>拒绝嵌套ZIP、脚本、异常路径与压缩比</dd></div></dl>
        <div className={styles.pdf}><b>关于PDF</b><p>当前版本不直接解析扫描PDF。请先转成可编辑Word或UTF-8文本并人工校对，避免OCR误识别被AI当成课程依据。</p></div>
      </aside>
    </section>
    <section className={styles.library}>
      <header><div><small>ACTIVE SOURCES</small><h2>教师自建资料</h2></div><span>{stats.sourceCount}个启用资料源 · {stats.documentCount}个文档 · {stats.chunkCount}个知识块</span></header>
      {sources.length ? <div className={styles.tableWrap}><table><thead><tr><th>资料</th><th>文档</th><th>知识块</th><th>可识别文字</th><th>更新时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{sources.map((source) => <tr key={source.id}><td><b>{source.displayName}</b><small>{source.originalName} · {size(source.size)}</small></td><td>{source.documentCount}</td><td>{source.chunkCount}</td><td>{source.extractedCharacters.toLocaleString("zh-CN")}</td><td>{dateTime(source.updatedAt)}</td><td><em className={source.status === "ready" ? styles.ready : styles.paused}>{source.status === "ready" ? "可检索" : "已停用"}</em></td><td><button disabled={pending} onClick={() => void toggle(source)}>{source.status === "ready" ? "停用" : "重新启用"}</button></td></tr>)}</tbody></table></div> : <div className={styles.empty}><b>尚未导入教师资料</b><p>原演示课程知识库仍然正常工作；你可以从上方导入第一份补充资料。</p></div>}
    </section>
  </>;
}
