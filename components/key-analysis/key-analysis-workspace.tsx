"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./key-analysis-workspace.module.css";

type CatalogItem = {
  originalName: string;
  size: number;
  version: string;
  updatedAt: string;
  updatedBy: string;
  isCurrent: boolean;
  analysis: { slideCount: number; underlineCount: number; termCount: number; analyzedAt: string } | null;
};

type UnderlineItem = {
  id: string;
  slideNumber: number;
  text: string;
  highlightedText: string;
  sourceLabel: string;
};

type TermItem = {
  id: string;
  slideNumber: number;
  slideNumbers: number[];
  term: string;
  surveyingTranslation: string;
  academicTranslation: string;
  generalTranslation: string;
  sourceLabel: string;
};

type DeckAnalysis = {
  slideCount: number;
  underlineCount: number;
  termCount: number;
  slides: Array<{ slideNumber: number; title: string; underlines: UnderlineItem[] }>;
  terms: TermItem[];
};

type SelectedDeck = { presentation: CatalogItem; analysis: DeckAnalysis | null };

type SentenceDetail = {
  kind: "sentence";
  original: string;
  highlightedText: string;
  slideNumber: number;
  translation: string;
  principle: string;
  grammar: string;
  keyPhrases: Array<{ phrase: string; translation: string; usage: string }>;
  citations: string[];
  aiGenerated: boolean;
};

type TermDetail = {
  kind: "term";
  term: string;
  slideNumber: number;
  meanings: Array<{ label: string; value: string; primary: boolean }>;
  principle: string;
  usageExample: string;
  citation: string;
  aiGenerated: boolean;
};

type Detail = SentenceDetail | TermDetail;

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function payload(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "重点解析数据读取失败。");
  return data;
}

export default function KeyAnalysisWorkspace({ onBack }: { onBack: () => void }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<SelectedDeck | null>(null);
  const [kind, setKind] = useState<"sentence" | "term">("sentence");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [activeId, setActiveId] = useState("");
  const [error, setError] = useState("");

  async function load(version?: string) {
    setLoading(true);
    setError("");
    setDetail(null);
    setActiveId("");
    try {
      const result = await payload(`/api/key-analysis${version ? `?version=${encodeURIComponent(version)}` : ""}`);
      setCatalog(result.catalog || []);
      setSelected(result.selected || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "重点解析目录读取失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    payload("/api/key-analysis")
      .then((result) => { if (active) { setCatalog(result.catalog || []); setSelected(result.selected || null); } })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "重点解析目录读取失败。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const sentences = useMemo(() => (selected?.analysis?.slides || []).flatMap((slide) => slide.underlines || []), [selected]);
  const terms = useMemo(() => selected?.analysis?.terms || [], [selected]);
  const filteredSentences = useMemo(() => sentences.filter((item) => !search.trim() || `${item.text} ${item.highlightedText}`.toLowerCase().includes(search.trim().toLowerCase())), [search, sentences]);
  const filteredTerms = useMemo(() => terms.filter((item) => !search.trim() || `${item.term} ${item.surveyingTranslation}`.toLowerCase().includes(search.trim().toLowerCase())), [search, terms]);

  async function openItem(item: UnderlineItem | TermItem, nextKind: "sentence" | "term") {
    if (!selected) return;
    setActiveId(item.id);
    setDetail(null);
    setDetailLoading(true);
    setError("");
    try {
      const result = await payload("/api/key-analysis/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: selected.presentation.version, kind: nextKind, itemId: item.id }),
      });
      setDetail(result.detail);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "重点内容解析失败。");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <section className={styles.shell} aria-label="PPT重点解析">
      <header className={styles.header}>
        <div><span>PPT KEY ANALYSIS · VERSION 21</span><h2>PPT重点解析</h2><p>按PPT目录汇总全部原始下划线句和测绘专业词汇；课堂交互PPT会自动以橙色/橙红色标记这些专业词汇，点击即可查看右侧解释。</p></div>
        <button onClick={onBack} type="button">返回AI教师问答</button>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}
      {loading ? <div className={styles.loading}><i />正在整理PPT重点目录…</div> : null}
      {!loading && !catalog.length ? (
        <div className={styles.empty}><b>重点解析目录尚未建立</b><p>教师在“教师工作台 → 课堂交互PPT”上传PPT后，系统会自动识别下划线句和测绘专业词汇。</p></div>
      ) : null}

      {!loading && catalog.length ? (
        <div className={styles.layout}>
          <aside className={styles.catalog}>
            <div className={styles.catalogHeading}><span>PPT DIRECTORY</span><b>课程PPT目录</b><em>{catalog.length}份</em></div>
            {catalog.map((item, index) => (
              <button className={selected?.presentation.version === item.version ? styles.activeDeck : ""} key={item.version} onClick={() => void load(item.version)} type="button">
                <i>{String(index + 1).padStart(2, "0")}</i>
                <span><b>{item.originalName}</b><em>{item.analysis?.slideCount || 0}页 · {formatSize(item.size)}</em></span>
                {item.isCurrent ? <strong>当前课件</strong> : null}
              </button>
            ))}
          </aside>

          <section className={styles.listPane}>
            <div className={styles.deckSummary}>
              <div><span>SELECTED PRESENTATION</span><h3>{selected?.presentation.originalName}</h3><p>{selected?.presentation.updatedBy}上传 · 共{selected?.analysis?.slideCount || 0}页</p></div>
              <dl><div><dt>划线句</dt><dd>{selected?.analysis?.underlineCount || 0}</dd></div><div><dt>专业词汇</dt><dd>{selected?.analysis?.termCount || 0}</dd></div></dl>
            </div>
            <div className={styles.filters}>
              <div><button className={kind === "sentence" ? styles.activeFilter : ""} onClick={() => { setKind("sentence"); setDetail(null); }} type="button">原始划线句 <b>{sentences.length}</b></button><button className={kind === "term" ? styles.activeFilter : ""} onClick={() => { setKind("term"); setDetail(null); }} type="button">测绘专业词汇 <b>{terms.length}</b></button></div>
              <input aria-label="搜索重点内容" onChange={(event) => setSearch(event.target.value)} placeholder="搜索英文、中文译法或页码" value={search} />
            </div>

            <div className={styles.items}>
              {kind === "sentence" ? filteredSentences.map((item) => (
                <button className={activeId === item.id ? styles.activeItem : ""} key={item.id} onClick={() => void openItem(item, "sentence")} type="button">
                  <span>SLIDE {item.slideNumber} · UNDERLINED</span><p>{item.text}</p><em>原下划线：{item.highlightedText}</em>
                </button>
              )) : filteredTerms.map((item) => (
                <button className={activeId === item.id ? styles.activeItem : ""} key={item.id} onClick={() => void openItem(item, "term")} type="button">
                  <span>SLIDE {item.slideNumbers?.join(" / ") || item.slideNumber} · SURVEYING TERM</span><p>{item.term}</p><em><b>测绘行业译法</b> · {item.surveyingTranslation}</em>
                </button>
              ))}
              {kind === "sentence" && !filteredSentences.length ? <div className={styles.listEmpty}><b>没有识别到下划线格式的句子</b><p>系统只收集PPT文件中真正设置了“下划线”格式的文字，不把普通正文误判为重点句。</p></div> : null}
              {kind === "term" && !filteredTerms.length ? <div className={styles.listEmpty}><b>没有匹配到测绘专业词汇</b><p>可以让教师检查PPT中的英文是否为可编辑文字，而不是整页图片。</p></div> : null}
            </div>
          </section>

          <aside className={styles.detailPane}>
            <header><span>CLICK-TO-LEARN</span><h3>点击解析</h3><p>选择左侧句子或词汇，查看翻译、测绘原理、重点短语和多语境含义。</p></header>
            {detailLoading ? <div className={styles.detailLoading}><i />正在结合演示课程知识生成解析…</div> : null}
            {!detailLoading && !detail ? <div className={styles.detailHint}><i>析</i><b>请选择一条重点内容</b><p>划线句会显示专业译文、原理、短语和句法；术语会分别标注测绘、学术与生活译法。</p></div> : null}
            {detail?.kind === "sentence" ? (
              <div className={styles.detailBody}>
                <section><small>原句 · 第{detail.slideNumber}页</small><h4>{detail.original}</h4><mark>{detail.highlightedText}</mark></section>
                <section className={styles.primaryCard}><small>中文／专业译文</small><p>{detail.translation}</p></section>
                <section><small>测绘专业原理</small><p>{detail.principle}</p></section>
                <section><small>句法主干与翻译顺序</small><p>{detail.grammar}</p></section>
                <section><small>重点短语</small>{detail.keyPhrases.length ? <ul>{detail.keyPhrases.map((phrase) => <li key={phrase.phrase}><b>{phrase.phrase}</b><span>{phrase.translation}</span><em>{phrase.usage}</em></li>)}</ul> : <p>当前未识别出需要单列的固定短语。</p>}</section>
                {detail.citations.length ? <footer>课程依据：{detail.citations.join("；")}</footer> : null}
              </div>
            ) : null}
            {detail?.kind === "term" ? (
              <div className={styles.detailBody}>
                <section><small>专业词汇 · 第{detail.slideNumber}页</small><h4>{detail.term}</h4></section>
                <div className={styles.meanings}>{detail.meanings.map((meaning) => <section className={meaning.primary ? styles.primaryMeaning : ""} key={meaning.label}><small>{meaning.label}{meaning.primary ? " · 本PPT优先" : ""}</small><p>{meaning.value}</p></section>)}</div>
                <section><small>测绘原理与本页用法</small><p>{detail.principle}</p></section>
                {detail.usageExample ? <section><small>用法示例</small><p>{detail.usageExample}</p></section> : null}
                <footer>术语依据：{detail.citation}</footer>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
