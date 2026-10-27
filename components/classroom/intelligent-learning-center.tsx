"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SMART_CONTENT_TOTALS, SMART_LEARNING_MODULES, getSmartLessonModule } from "@/lib/step9/learning-content";
import {
  ENRICHMENT_TOTALS,
  getAuthenticMaterialsForLesson,
  getFiveLayerDetail,
  getHighlightCoverageForLesson,
  getHighlightedSentencesForLesson,
} from "@/lib/step10/enrichment-content";
import { useSmartVoice, type VoiceLanguage } from "@/components/voice/use-smart-voice";
import styles from "./classroom.module.css";

type StudentUser = { id: string; username: string; displayName: string };
type ModuleType = "speaking" | "career" | "translation";
type LearningView = ModuleType | "authentic";
type AttemptResult = { score: number; feedback: string };
type ProgressRow = { lessonOrdinal: number; moduleType: ModuleType; attempts: number; bestScore: number; averageScore: number; latestAt: string };
type ProgressPayload = { currentLessonOrdinal: number; summary: ProgressRow[]; recent: unknown[] };

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "服务器处理失败。");
  return payload;
}

function normalizeEnglish(value: string) {
  return value
    .toLowerCase()
    .replace(/[’‘]/gu, "'")
    .replace(/[^a-z0-9'-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function markSentencePauses(value: string) {
  return value.replace(/([,;:])\s*/gu, "$1 / ");
}

function scoreSpeaking(target: string, response: string, keywords: string[]): AttemptResult {
  const targetTokens = normalizeEnglish(target).split(" ").filter(Boolean);
  const responseTokens = normalizeEnglish(response).split(" ").filter(Boolean);
  if (!responseTokens.length) return { score: 0, feedback: "尚未识别到有效英文内容，请重新跟读或手动输入识别文本。" };
  const responseSet = new Set(responseTokens);
  const recalled = targetTokens.filter((token) => responseSet.has(token)).length;
  const wordRecall = recalled / Math.max(1, targetTokens.length);
  const keywordHits = keywords.filter((keyword) => normalizeEnglish(response).includes(normalizeEnglish(keyword)));
  const keywordRate = keywordHits.length / Math.max(1, keywords.length);
  const lengthRate = Math.min(1, responseTokens.length / Math.max(1, targetTokens.length * 0.8));
  const score = Math.round(Math.min(100, wordRecall * 65 + keywordRate * 25 + lengthRate * 10));
  const missing = keywords.filter((keyword) => !keywordHits.includes(keyword));
  const feedback = score >= 90
    ? "跟读完整度很好，重点术语均被识别。下一步可提高连读、重音和语调自然度。"
    : score >= 75
      ? "整体较完整。建议重点复读：" + (missing.length ? missing.join("、") : "长词重音和句末语调") + "。"
      : "识别完整度偏低。先使用慢速朗读，按停顿标记分段跟读；重点补足：" + (missing.length ? missing.join("、") : "句子主干") + "。";
  return { score, feedback };
}

function scoreCareer(response: string, requiredTerms: string[]): AttemptResult {
  const normalized = normalizeEnglish(response);
  const words = normalized.split(" ").filter(Boolean);
  if (!words.length) return { score: 0, feedback: "请先完成英文职业任务回答。" };
  const hitTerms = requiredTerms.filter((term) => normalized.includes(normalizeEnglish(term)));
  const termScore = hitTerms.length / Math.max(1, requiredTerms.length) * 60;
  const lengthScore = Math.min(20, words.length / 80 * 20);
  const markers = ["first", "then", "because", "however", "therefore", "finally", "should", "recommend", "result"];
  const markerHits = markers.filter((marker) => words.includes(marker)).length;
  const structureScore = Math.min(20, markerHits * 4);
  const score = Math.round(Math.min(100, termScore + lengthScore + structureScore));
  const missing = requiredTerms.filter((term) => !hitTerms.includes(term));
  const feedback = score >= 85
    ? "任务完成度较高，专业词汇和表达结构较完整。可进一步增加量化结果、限制条件或质量控制细节。"
    : "已完成基础表达。建议补充专业词汇：" + (missing.length ? missing.join("、") : "无明显缺失") + "；并使用First/However/Therefore等连接词增强逻辑。";
  return { score, feedback };
}

function scoreTranslation(response: string, keyTerms: string[]): AttemptResult {
  const compact = response.replace(/\s+/gu, "");
  if (!compact) return { score: 0, feedback: "请先输入你的中文译文。" };
  const hits = keyTerms.filter((term) => compact.includes(term.replace(/\s+/gu, "")));
  const termScore = hits.length / Math.max(1, keyTerms.length) * 80;
  const lengthScore = Math.min(10, compact.length / 35 * 10);
  const readabilityScore = /[，；。]/u.test(response) ? 10 : 5;
  const score = Math.round(Math.min(100, termScore + lengthScore + readabilityScore));
  const missing = keyTerms.filter((term) => !hits.includes(term));
  const feedback = score >= 88
    ? "核心术语与信息关系较完整。请对照规范译文检查中文节奏、术语一致性和增译边界。"
    : "译文已覆盖部分信息，但建议补充或调整：" + (missing.length ? missing.join("、") : "句子逻辑与中文表达") + "。";
  return { score, feedback };
}

export default function IntelligentLearningCenter({ user, initialLessonOrdinal }: { user: StudentUser; initialLessonOrdinal: number }) {
  const [lessonOrdinal, setLessonOrdinal] = useState(Math.max(1, Math.min(12, initialLessonOrdinal)));
  const [moduleType, setModuleType] = useState<LearningView>("authentic");
  const [speakingIndex, setSpeakingIndex] = useState(0);
  const [taskIndex, setTaskIndex] = useState(0);
  const [translationIndex, setTranslationIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [careerAnswer, setCareerAnswer] = useState("");
  const [translationAnswer, setTranslationAnswer] = useState("");
  const [speakingResult, setSpeakingResult] = useState<AttemptResult | null>(null);
  const [careerResult, setCareerResult] = useState<AttemptResult | null>(null);
  const [translationResult, setTranslationResult] = useState<AttemptResult | null>(null);
  const [showCareerSample, setShowCareerSample] = useState(false);
  const [showTranslationAnalysis, setShowTranslationAnalysis] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState<ModuleType | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const voice = useSmartVoice();

  const lesson = useMemo(() => getSmartLessonModule(lessonOrdinal), [lessonOrdinal]);
  const speaking = lesson.listening[Math.min(speakingIndex, lesson.listening.length - 1)];
  const task = lesson.careerTasks[Math.min(taskIndex, lesson.careerTasks.length - 1)];
  const highlightedSentences = useMemo(() => getHighlightedSentencesForLesson(lessonOrdinal), [lessonOrdinal]);
  const highlightCoverage = useMemo(() => getHighlightCoverageForLesson(lessonOrdinal), [lessonOrdinal]);
  const translation = highlightedSentences[Math.min(translationIndex, highlightedSentences.length - 1)];
  const authenticMaterials = useMemo(() => getAuthenticMaterialsForLesson(lessonOrdinal), [lessonOrdinal]);
  const fiveLayerDetail = getFiveLayerDetail(translation.id);
  const stressWords = translation.termNotes.map((note) => note.split(/[：:]/u)[0]).filter(Boolean).slice(0, 4);

  useEffect(() => {
    requestJson("/api/classroom/learning-progress")
      .then((payload) => setProgress(payload.data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "无法读取智能练习进度。"));
  }, []);

  function selectLesson(nextLessonOrdinal: number) {
    voice.cancelRecording();
    voice.stopSpeaking();
    setVoiceTarget(null);
    setLessonOrdinal(nextLessonOrdinal);
    setSpeakingIndex(0);
    setTaskIndex(0);
    setTranslationIndex(0);
    setTranscript("");
    setCareerAnswer("");
    setTranslationAnswer("");
    setSpeakingResult(null);
    setCareerResult(null);
    setTranslationResult(null);
    setShowCareerSample(false);
    setShowTranslationAnalysis(false);
    setNotice("");
    setError("");
  }

  function speakText(text: string, rate: number, language: VoiceLanguage = "en") {
    void voice.speak(text.replaceAll("/", ","), { rate, language });
  }

  async function toggleSpeakingRecognition() {
    setNotice("");
    voice.clearError();
    try {
      if (!voice.isRecording) {
        setVoiceTarget("speaking");
        await voice.startRecording();
        return;
      }
      if (voiceTarget !== "speaking") return;
      const recognized = await voice.stopRecording({
        language: "en",
        context: speaking.sentence,
        hotwords: speaking.keywords,
      });
      setVoiceTarget(null);
      setTranscript(recognized);
      const scored = scoreSpeaking(speaking.sentence, recognized, speaking.keywords);
      setSpeakingResult(scored);
      void persistAttempt("speaking", speaking.id, scored, recognized);
      if (voice.autoSpeak) void voice.speak(`跟读完成度${scored.score}分。${scored.feedback}`, { language: "zh" });
    } catch {
      setVoiceTarget(null);
    }
  }

  async function toggleCareerVoice() {
    setNotice("");
    voice.clearError();
    try {
      if (!voice.isRecording) {
        setVoiceTarget("career");
        await voice.startRecording();
        return;
      }
      if (voiceTarget !== "career") return;
      const recognized = await voice.stopRecording({
        language: "en",
        context: `${task.situation} ${task.task}`,
        hotwords: task.requiredTerms,
      });
      setVoiceTarget(null);
      setCareerAnswer(recognized);
      setNotice("高精度语音识别已填入英文回答，可先人工修正再提交评价。");
    } catch {
      setVoiceTarget(null);
    }
  }

  async function toggleTranslationVoice() {
    setNotice("");
    voice.clearError();
    try {
      if (!voice.isRecording) {
        setVoiceTarget("translation");
        await voice.startRecording();
        return;
      }
      if (voiceTarget !== "translation") return;
      const recognized = await voice.stopRecording({
        language: "zh",
        context: `请把这句测绘专业英语翻译成中文：${translation.original}`,
        hotwords: translation.keyChineseTerms,
      });
      setVoiceTarget(null);
      setTranslationAnswer(recognized);
      setNotice("高精度语音识别已填入中文译文，可先人工修正再提交评价。");
    } catch {
      setVoiceTarget(null);
    }
  }

  async function persistAttempt(type: ModuleType, itemId: string, result: AttemptResult, responseText: string) {
    try {
      await requestJson("/api/classroom/learning-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonOrdinal, moduleType: type, itemId, score: result.score, responseText, feedback: result.feedback }),
      });
      const payload = await requestJson("/api/classroom/learning-progress");
      setProgress(payload.data);
      setNotice("练习结果已保存到个人学习档案。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "练习结果保存失败。");
    }
  }

  function evaluateSpeaking() {
    const result = scoreSpeaking(speaking.sentence, transcript, speaking.keywords);
    setSpeakingResult(result);
    void persistAttempt("speaking", speaking.id, result, transcript);
    if (voice.autoSpeak) void voice.speak(`跟读完成度${result.score}分。${result.feedback}`, { language: "zh" });
  }

  function evaluateCareer() {
    const result = scoreCareer(careerAnswer, task.requiredTerms);
    setCareerResult(result);
    void persistAttempt("career", task.id, result, careerAnswer);
    if (voice.autoSpeak) void voice.speak(`职业任务完成度${result.score}分。${result.feedback}`, { language: "zh" });
  }

  function evaluateTranslation() {
    const result = scoreTranslation(translationAnswer, translation.keyChineseTerms);
    setTranslationResult(result);
    setShowTranslationAnalysis(true);
    void persistAttempt("translation", translation.id, result, translationAnswer);
    if (voice.autoSpeak) void voice.speak(`翻译核心信息覆盖${result.score}分。${result.feedback}`, { language: "zh" });
  }

  const lessonProgress = progress?.summary.filter((row) => row.lessonOrdinal === lessonOrdinal) || [];
  const progressFor = (type: ModuleType) => lessonProgress.find((row) => row.moduleType === type);
  const totalAttempts = progress?.summary.reduce((sum, row) => sum + row.attempts, 0) || 0;

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/"><i>测</i><span><b>测绘专业外语</b><em>AI SMART PRACTICE · ENRICHED</em></span></Link>
        <div className={styles.courseChip}><span>学生账号</span><b>{user.displayName}</b><em>{user.username}</em></div>
        <nav className={styles.nav}>
          <Link className={styles.navLink} href="/student"><i>▦</i>学习首页</Link>
          <Link className={`${styles.navLink} ${styles.active}`} href="/student/smart-learning"><i>智</i>智能实训</Link>
          <Link className={styles.navLink} href="/"><i>AI</i>AI教师问答</Link>
        </nav>
        <div className={styles.sideStats}><p><span>智能内容库</span><b>READY</b></p><div><span>{ENRICHMENT_TOTALS.authenticMaterials} 真实材料</span><span>{SMART_CONTENT_TOTALS.listening} 跟读句</span><span>{SMART_CONTENT_TOTALS.careerTasks} 职业任务</span><span>{ENRICHMENT_TOTALS.fiveLayerSentences} 五层讲解</span><span>{ENRICHMENT_TOTALS.textbookUnderlines} 教材原始划线</span></div></div>
        <div className={styles.sideFooter}><i>{user.displayName.slice(-1)}</i><span><b>{user.displayName}</b><em>个人练习累计 {totalAttempts} 次</em></span></div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}><p>学生课程空间 / <b>智能实训中心</b></p><div><span className={styles.online}><i />百炼高精度语音已接入</span><Link href="/">AI教师问答与重点解析</Link><Link href="/student">返回学习首页</Link></div></header>
        <div className={styles.content}>
          {notice ? <div className={styles.notice} style={{ marginBottom: 13 }}>{notice}</div> : null}
          {error ? <div className={styles.error} style={{ marginBottom: 13 }}>{error}</div> : null}
          {voice.error ? <div className={styles.error} style={{ marginBottom: 13 }}>{voice.error}</div> : null}

          <section className={styles.heading}>
            <div><small>READ · LISTEN · WORK · TRANSLATE</small><h1>专业英语智能实训中心</h1><p>教材原始Word下划线已全部纳入本课程对应课次，并保留原有教师精选重点句；每条均可进入五层讲解与翻译练习。</p></div>
            <label className={styles.lessonPicker}><span>选择课次</span><select value={lessonOrdinal} onChange={(event) => selectLesson(Number(event.target.value))}>{SMART_LEARNING_MODULES.map((item) => <option key={item.lessonOrdinal} value={item.lessonOrdinal}>第{item.lessonOrdinal}课 · {item.lessonTitle}</option>)}</select></label>
            <div className={styles.voiceControlGroup}><button className={styles.secondary} onClick={() => voice.setAutoSpeak((value) => !value)} type="button">{voice.autoSpeak ? "✓ AI评价自动朗读" : "开启AI评价自动朗读"}</button>{voice.isRecording ? <button className={styles.secondary} onClick={() => { voice.cancelRecording(); setVoiceTarget(null); }} type="button">取消当前录音</button> : null}{voice.isSpeaking ? <button className={styles.secondary} onClick={voice.stopSpeaking} type="button">停止AI朗读</button> : null}</div>
          </section>

          <section className={styles.grid4}>
            <article className={styles.metric}><span>本课真实材料</span><b>{authenticMaterials.length}</b><em>官方短摘录＋来源链接</em></article>
            <article className={styles.metric}><span>听说练习最佳</span><b>{progressFor("speaking")?.bestScore ?? "—"}</b><em>{progressFor("speaking")?.attempts || 0}次记录</em></article>
            <article className={styles.metric}><span>职业任务最佳</span><b>{progressFor("career")?.bestScore ?? "—"}</b><em>{progressFor("career")?.attempts || 0}次记录</em></article>
            <article className={styles.metric}><span>翻译对比最佳</span><b>{progressFor("translation")?.bestScore ?? "—"}</b><em>{progressFor("translation")?.attempts || 0}次记录</em></article>
          </section>

          <section className={styles.smartTabs}>
            <button className={moduleType === "authentic" ? styles.smartTabActive : ""} onClick={() => setModuleType("authentic")}><b>02</b><span>真实职业材料</span><em>官方原文 · 术语 · 阅读任务</em></button>
            <button className={moduleType === "speaking" ? styles.smartTabActive : ""} onClick={() => setModuleType("speaking")}><b>05</b><span>专业听说与跟读</span><em>朗读 · 麦克风识别 · 术语完整度</em></button>
            <button className={moduleType === "career" ? styles.smartTabActive : ""} onClick={() => setModuleType("career")}><b>06</b><span>真实测绘职业任务</span><em>角色 · 情境 · 专业表达</em></button>
            <button className={moduleType === "translation" ? styles.smartTabActive : ""} onClick={() => setModuleType("translation")}><b>11</b><span>划线句五层讲解</span><em>全部教材划线 · 朗读 · 术语 · 句法 · 三译 · 原理</em></button>
          </section>

          {moduleType === "authentic" ? (
            <section className={styles.smartPanel}>
              <header className={styles.smartPanelHeader}><div><span>AUTHENTIC PROFESSIONAL MATERIALS</span><h2>第{lessonOrdinal}课 · 官方真实职业材料</h2><p>每课2份；页面只保留教学所需的官方短摘录，完整上下文请打开官方原文核对。</p></div><span className={styles.verifiedSource}>来源核验 · 2026-08-08</span></header>
              <div className={styles.authenticGrid}>
                {authenticMaterials.map((material) => (
                  <article className={styles.authenticCard} key={material.id}>
                    <div className={styles.authenticMeta}><span>{material.materialType}</span><b>{material.publisher}</b></div>
                    <h3>{material.title}</h3>
                    <p className={styles.sourceTitle}>{material.sourceTitle}</p>
                    <blockquote>{material.excerpt}</blockquote>
                    <p className={styles.excerptTranslation}>{material.excerptTranslation}</p>
                    <div className={styles.actionRow}><button className={styles.secondary} onClick={() => speakText(material.excerpt, 0.92, "en")}>🔊 朗读英文原文</button><button className={styles.secondary} onClick={() => speakText(material.excerptTranslation, 0.94, "zh")}>🔊 朗读中文释义</button></div>
                    <a className={styles.officialLink} href={material.sourceUrl} target="_blank" rel="noreferrer">打开官方原文 ↗</a>
                    <h4>职业术语</h4>
                    <div className={styles.vocabGrid}>{material.vocabulary.map((entry) => <p key={entry.term}><b>{entry.term}</b><span>{entry.meaning}</span></p>)}</div>
                    <h4>阅读抓手</h4>
                    <ul>{material.readingFocus.map((focus) => <li key={focus}>{focus}</li>)}</ul>
                    <div className={styles.materialTask}><span>职业阅读任务</span><p>{material.task}</p></div>
                    <button className={styles.secondary} onClick={() => speakText(material.task, 0.94, "zh")}>🔊 AI教师朗读任务</button>
                    <details className={styles.answerGuide}><summary>完成后查看答案要点</summary><ul>{material.answerGuide.map((item) => <li key={item}>{item}</li>)}</ul></details>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {moduleType === "speaking" ? (
            <section className={styles.smartPanel}>
              <header className={styles.smartPanelHeader}><div><span>SPEAKING PRACTICE</span><h2>{speaking.title}</h2><p>{speaking.source}</p></div><select value={speakingIndex} onChange={(event) => { setSpeakingIndex(Number(event.target.value)); setTranscript(""); setSpeakingResult(null); }}>{lesson.listening.map((item, index) => <option key={item.id} value={index}>练习{index + 1} · {item.title}</option>)}</select></header>
              <div className={styles.speakingGrid}>
                <article className={styles.practicePrompt}>
                  <div className={styles.badgeRow}><i>{speaking.difficulty}</i>{speaking.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
                  <h3>{speaking.sentence}</h3>
                  <p className={styles.pauseLine}>{speaking.pauseMarked}</p>
                  <p className={styles.translationLine}>{speaking.translation}</p>
                  <div className={styles.actionRow}><button className={styles.primary} onClick={() => speakText(speaking.sentence, 0.92, "en")}>正常语速朗读</button><button className={styles.secondary} onClick={() => speakText(speaking.pauseMarked, 0.68, "en")}>教学慢速朗读</button><button className={styles.secondary} disabled={voice.isTranscribing || (voice.isRecording && voiceTarget !== "speaking")} onClick={() => void toggleSpeakingRecognition()}>{voice.isTranscribing && voiceTarget === "speaking" ? "正在高精度识别……" : voice.isRecording && voiceTarget === "speaking" ? "■ 结束跟读并识别" : "🎤 开始高精度跟读"}</button></div>
                  <div className={styles.tipList}>{speaking.pronunciationTips.map((tip) => <p key={tip}>• {tip}</p>)}</div>
                </article>
                <article className={styles.responseCard}>
                  <span>识别文本 / 手动修正</span>
                  <textarea placeholder="点击“开始高精度跟读”，结束录音后识别结果会显示在这里；也可以手动修正。" value={transcript} onChange={(event) => setTranscript(event.target.value)} />
                  <button className={styles.primary} onClick={evaluateSpeaking}>重新评分并保存</button>
                  {speakingResult ? <div className={styles.smartResult}><b>{speakingResult.score}</b><span>跟读完整度</span><p>{speakingResult.feedback}</p></div> : <div className={styles.smartEmpty}>百炼高精度识别结合测绘专业热词与本句上下文；当前分数按词汇覆盖、专业关键词和长度进行形成性评价，不等同于音素级发音考试评分。</div>}
                </article>
              </div>
            </section>
          ) : null}

          {moduleType === "career" ? (
            <section className={styles.smartPanel}>
              <header className={styles.smartPanelHeader}><div><span>AUTHENTIC WORKPLACE TASK</span><h2>{task.title}</h2><p>{task.source}</p></div><select value={taskIndex} onChange={(event) => { setTaskIndex(Number(event.target.value)); setCareerAnswer(""); setCareerResult(null); setShowCareerSample(false); }}>{lesson.careerTasks.map((item, index) => <option key={item.id} value={index}>任务{index + 1} · {item.title}</option>)}</select></header>
              <div className={styles.taskGrid}>
                <article className={styles.taskBrief}>
                  <div className={styles.taskMeta}><span><b>角色</b>{task.role}</span><span><b>形式</b>{task.outputMode}</span><span><b>时间</b>{task.timeLimit}</span></div>
                  <h3>职业情境</h3><p>{task.situation}</p>
                  <h3>任务要求</h3><p>{task.task}</p>
                  <h3>必须使用的专业表达</h3><div className={styles.badgeRow}>{task.requiredTerms.map((term) => <span key={term}>{term}</span>)}</div>
                  <h3>表达支架</h3><ul>{task.supportPhrases.map((phrase) => <li key={phrase}>{phrase}</li>)}</ul>
                  <h3>评价清单</h3><ul>{task.checklist.map((item) => <li key={item}>□ {item}</li>)}</ul>
                </article>
                <article className={styles.responseCard}>
                  <span>提交英文回答</span>
                  <textarea className={styles.largeTextarea} placeholder="请用英文完成任务。系统会检查专业术语、长度和逻辑连接词。" value={careerAnswer} onChange={(event) => setCareerAnswer(event.target.value)} />
                  <div className={styles.actionRow}><button className={styles.secondary} disabled={voice.isTranscribing || (voice.isRecording && voiceTarget !== "career")} onClick={() => void toggleCareerVoice()}>{voice.isTranscribing && voiceTarget === "career" ? "正在高精度识别……" : voice.isRecording && voiceTarget === "career" ? "■ 结束语音回答" : "🎤 语音回答"}</button><button className={styles.primary} onClick={evaluateCareer}>智能检查并保存</button><button className={styles.secondary} onClick={() => setShowCareerSample((value) => !value)}>{showCareerSample ? "隐藏参考答案" : "显示参考答案"}</button></div>
                  {careerResult ? <div className={styles.smartResult}><b>{careerResult.score}</b><span>任务完成度</span><p>{careerResult.feedback}</p></div> : null}
                  {showCareerSample ? <div className={styles.sampleAnswer}><b>参考表达</b><p>{task.sampleAnswer}</p><button className={styles.secondary} onClick={() => speakText(task.sampleAnswer, 0.92, "en")}>🔊 AI教师朗读参考表达</button></div> : null}
                </article>
              </div>
            </section>
          ) : null}

          {moduleType === "translation" ? (
            <section className={styles.smartPanel}>
              <header className={styles.smartPanelHeader}><div><span>FIVE-LAYER SENTENCE TEACHING · FULL UNDERLINE COVERAGE</span><h2>{translation.title}</h2><p>{translation.source}</p><p>本课共 {highlightCoverage.total} 条/组重点内容：教材原始划线 {highlightCoverage.textbookUnderlines} 条/组，另保留教师精选 {highlightCoverage.teacherCurated} 条；涉及教材 {highlightCoverage.textbookUnits.length ? highlightCoverage.textbookUnits.map((unit) => `Unit ${unit}`).join("、") : "课程综合材料"}。</p></div><select value={translationIndex} onChange={(event) => { setTranslationIndex(Number(event.target.value)); setTranslationAnswer(""); setTranslationResult(null); setShowTranslationAnalysis(false); }}>{highlightedSentences.map((item, index) => <option key={item.id} value={index}>重点{index + 1} · {item.origin === "textbook-underline" ? `教材划线 U${item.textbookUnit}` : "教师精选"} · {item.title}</option>)}</select></header>
              <div className={styles.translationWorkspace}>
                <article className={`${styles.originalCard} ${styles.layerCard}`}><div className={styles.layerHeading}><b>01</b><span>第一层 · 原文与朗读</span></div><div className={styles.badgeRow}><span>{translation.origin === "textbook-underline" ? "教材Word原始划线" : "教师精选重点句"}</span>{translation.textbookUnit ? <span>Unit {translation.textbookUnit}</span> : null}</div><h3>{translation.original}</h3><p className={styles.pauseLine}>{markSentencePauses(translation.original)}</p><div className={styles.badgeRow}>{stressWords.map((word) => <span key={word}>重读建议 · {word}</span>)}</div><div className={styles.actionRow}><button className={styles.primary} onClick={() => speakText(translation.original, 0.88, "en")}>朗读原句</button><button className={styles.secondary} onClick={() => speakText(markSentencePauses(translation.original), 0.68, "en")}>按停顿慢读</button></div><p>{translation.practicePrompt}</p></article>
                <article className={styles.responseCard}><span>你的译文</span><textarea className={styles.largeTextarea} placeholder="先独立翻译，再查看教材译文、专业直译、现代汉语意译和专业原理。" value={translationAnswer} onChange={(event) => setTranslationAnswer(event.target.value)} /><div className={styles.actionRow}><button className={styles.secondary} disabled={voice.isTranscribing || (voice.isRecording && voiceTarget !== "translation")} onClick={() => void toggleTranslationVoice()}>{voice.isTranscribing && voiceTarget === "translation" ? "正在高精度识别……" : voice.isRecording && voiceTarget === "translation" ? "■ 结束语音翻译" : "🎤 说出中文译文"}</button><button className={styles.primary} onClick={evaluateTranslation}>检查译文并保存</button><button className={styles.secondary} onClick={() => setShowTranslationAnalysis((value) => !value)}>{showTranslationAnalysis ? "收起五层讲解" : "展开五层讲解"}</button></div>{translationResult ? <div className={styles.smartResult}><b>{translationResult.score}</b><span>核心信息覆盖</span><p>{translationResult.feedback}</p></div> : null}</article>
                {showTranslationAnalysis ? <><div className={styles.actionRow}><button className={styles.secondary} onClick={() => void voice.speak(["第二层，专业词汇", ...translation.termNotes, "第三层，句法结构", ...translation.sentencePattern, "第四层，教材译文", translation.textbookTranslation, "专业直译", fiveLayerDetail?.professionalLiteralTranslation || translation.standardTranslation, "现代汉语意译", translation.standardTranslation, "第五层，专业原理", fiveLayerDetail?.professionalExplanation || "本句的专业原理说明待教师补充"].join("。"), { language: "mixed", rate: 0.94 })}>🔊 AI教师连续讲解第二至第五层</button></div><div className={styles.fiveLayerGrid}>
                  <article className={styles.layerCard}><div className={styles.layerHeading}><b>02</b><span>第二层 · 专业词汇</span></div><ul>{translation.termNotes.map((item) => <li key={item}>{item}</li>)}</ul><div className={styles.badgeRow}>{translation.keyChineseTerms.map((term) => <span key={term}>必须保留 · {term}</span>)}</div></article>
                  <article className={styles.layerCard}><div className={styles.layerHeading}><b>03</b><span>第三层 · 句法结构</span></div><ul>{translation.sentencePattern.map((item) => <li key={item}>{item}</li>)}</ul></article>
                  <article className={`${styles.layerCard} ${styles.layerWide}`}><div className={styles.layerHeading}><b>04</b><span>第四层 · 三种译文</span></div><div className={styles.translationTrio}><div><span>教材译文</span><p>{translation.textbookTranslation}</p></div><div><span>专业直译</span><p>{fiveLayerDetail?.professionalLiteralTranslation || translation.standardTranslation}</p></div><div className={styles.standardCard}><span>现代汉语意译</span><p>{translation.standardTranslation}</p></div></div><div className={styles.limitationNote}><b>教材译法的局限</b><p>{translation.limitation}</p></div></article>
                  <article className={`${styles.layerCard} ${styles.layerWide} ${styles.principleCard}`}><div className={styles.layerHeading}><b>05</b><span>第五层 · 专业原理</span></div><p>{fiveLayerDetail?.professionalExplanation || "本句的专业原理说明待教师补充。"}</p></article>
                </div></> : null}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
