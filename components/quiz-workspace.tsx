"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeGeneratedQuiz,
  normalizeQuizCatalog,
  normalizeQuizResult,
  quizErrorFromPayload,
  QuizUiError,
  type QuizCatalog,
  type QuizFocus,
  type QuizResult,
  type QuizSession,
} from "@/lib/step6/quiz-client";
import styles from "./chat-workspace.module.css";
import { useSmartVoice } from "./voice/use-smart-voice";

const FOCUS_LABELS: Record<QuizFocus, string> = {
  mixed: "混合题",
  vocabulary: "专业词汇",
  concept: "原理理解",
};

const KIND_LABELS = {
  vocabulary: "专业词汇",
  concept: "原理理解",
  translation: "中英翻译",
};

async function readJsonSafely(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

function questionSpeech(stem: string, options: string[], questionIndex: number) {
  return `第${questionIndex + 1}题。${stem}。${options.map((option, index) => `选项${String.fromCharCode(65 + index)}，${option}`).join("。")}`;
}

function choiceFromTranscript(transcript: string, options: string[]) {
  const normalized = transcript.trim().toLowerCase();
  const letter = /(?:选择|选项|答案|选)?\s*([abcd])(?:\s|[，。,.]|$)/iu.exec(normalized)?.[1];
  if (letter) return letter.toUpperCase().charCodeAt(0) - 65;
  const chineseChoices: Array<[RegExp, number]> = [
    [/(?:第|选)?一(?:个|项)?|选项一/u, 0],
    [/(?:第|选)?二(?:个|项)?|选项二/u, 1],
    [/(?:第|选)?三(?:个|项)?|选项三/u, 2],
    [/(?:第|选)?四(?:个|项)?|选项四/u, 3],
  ];
  const matchedChinese = chineseChoices.find(([pattern]) => pattern.test(normalized));
  if (matchedChinese) return matchedChinese[1];
  const optionIndex = options.findIndex((option) => {
    const compact = option.toLowerCase().replace(/\s+/gu, " ").trim();
    return compact.length >= 3 && normalized.includes(compact);
  });
  return optionIndex >= 0 ? optionIndex : null;
}

export default function QuizWorkspace({ serviceReady }: { serviceReady: boolean }) {
  const [catalog, setCatalog] = useState<QuizCatalog | null>(null);
  const [unit, setUnit] = useState(1);
  const [count, setCount] = useState(5);
  const [focus, setFocus] = useState<QuizFocus>("mixed");
  const [quiz, setQuiz] = useState<QuizSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState<"catalog" | "generate" | "grade" | "reveal" | null>("catalog");
  const [error, setError] = useState("");
  const [voiceQuestionId, setVoiceQuestionId] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const voice = useSmartVoice();

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    fetch("/api/quiz", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => ({ response, payload: await readJsonSafely(response) }))
      .then(({ response, payload }) => {
        if (!response.ok) throw quizErrorFromPayload(payload, response.status);
        const next = normalizeQuizCatalog(payload);
        setCatalog(next);
        setUnit(next.units[0]?.unit || 1);
        setCount(next.countOptions.includes(5) ? 5 : next.countOptions[0]);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          setError("章节列表加载超时，请刷新页面重试。");
        } else {
          setError(reason instanceof QuizUiError ? reason.publicMessage : "章节列表加载失败。");
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
        setLoading(null);
      });
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const resultByQuestion = useMemo(
    () => new Map((result?.results || []).map((item) => [item.questionId, item])),
    [result],
  );
  const answeredCount = Object.keys(answers).length;

  async function postQuiz(action: Record<string, unknown>, state: "generate" | "grade" | "reveal") {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 65_000);
    setLoading(state);
    setError("");
    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(action),
        signal: controller.signal,
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) throw quizErrorFromPayload(payload, response.status);
      return payload;
    } catch (reason) {
      const message = reason instanceof DOMException && reason.name === "AbortError"
        ? "章节测试等待时间过长，请检查网络后重试。"
        : reason instanceof QuizUiError
          ? reason.publicMessage
          : "章节测试网络连接失败，请确认服务器仍在运行。";
      setError(message);
      return null;
    } finally {
      window.clearTimeout(timer);
      if (controllerRef.current === controller) controllerRef.current = null;
      setLoading(null);
    }
  }

  async function generateQuiz() {
    const payload = await postQuiz({ action: "generate", unit, count, focus }, "generate");
    if (!payload) return;
    try {
      const next = normalizeGeneratedQuiz(payload);
      setQuiz(next);
      setAnswers({});
      setResult(null);
    } catch (reason) {
      setError(reason instanceof QuizUiError ? reason.publicMessage : "随机试题格式校验失败。");
    }
  }

  async function grade() {
    if (!quiz) return;
    const payload = await postQuiz({
      action: "grade",
      quiz_id: quiz.quizId,
      answers: Object.entries(answers).map(([question_id, selected_index]) => ({
        question_id,
        selected_index,
      })),
    }, "grade");
    if (!payload) return;
    try {
      const nextResult = normalizeQuizResult(payload);
      setResult(nextResult);
      if (voice.autoSpeak) {
        void voice.speak(`本次章节测试已完成。你的得分是${nextResult.score}分，答对${nextResult.correct}题，共${nextResult.total}题。请继续核对每道题的教材解析。`, { language: "zh" });
      }
    } catch (reason) {
      setError(reason instanceof QuizUiError ? reason.publicMessage : "判分结果格式校验失败。");
    }
  }

  async function reveal() {
    if (!quiz) return;
    const payload = await postQuiz({ action: "reveal", quiz_id: quiz.quizId }, "reveal");
    if (!payload) return;
    try {
      setResult(normalizeQuizResult(payload));
    } catch (reason) {
      setError(reason instanceof QuizUiError ? reason.publicMessage : "答案格式校验失败。");
    }
  }

  async function toggleVoiceAnswer(item: QuizSession["questions"][number], questionIndex: number) {
    setVoiceNotice("");
    voice.clearError();
    try {
      if (!voice.isRecording) {
        setVoiceQuestionId(item.id);
        await voice.startRecording();
        return;
      }
      if (voiceQuestionId !== item.id) return;
      const transcript = await voice.stopRecording({
        language: "mixed",
        context: questionSpeech(item.stem, item.options, questionIndex),
        hotwords: item.options.flatMap((option) => option.split(/[^A-Za-z\u4e00-\u9fff-]+/u)).filter(Boolean).slice(0, 36),
      });
      setVoiceQuestionId("");
      const selected = choiceFromTranscript(transcript, item.options);
      if (selected === null || selected >= item.options.length) {
        setVoiceNotice(`已识别：“${transcript}”，但未判断出A/B/C/D，请再说“选A/选B/选C/选D”。`);
        return;
      }
      setAnswers((current) => ({ ...current, [item.id]: selected }));
      setVoiceNotice(`已识别：“${transcript}”，已为第${questionIndex + 1}题选择 ${String.fromCharCode(65 + selected)}。`);
    } catch {
      setVoiceQuestionId("");
    }
  }

  return (
    <div className={styles.quizShell} aria-live="polite">
      <section className={styles.quizControls} aria-label="章节测试设置">
        <div className={styles.quizControlField}>
          <label htmlFor="quiz-unit">教材章节</label>
          <select
            disabled={Boolean(loading)}
            id="quiz-unit"
            onChange={(event) => setUnit(Number(event.target.value))}
            value={unit}
          >
            {(catalog?.units || []).map((item) => (
              <option key={item.unit} value={item.unit}>
                Unit {item.unit}｜{item.title}（系统页{item.start_page}-{item.end_page}）
              </option>
            ))}
          </select>
        </div>
        <div className={styles.quizControlField}>
          <label htmlFor="quiz-count">题目数量</label>
          <select
            disabled={Boolean(loading)}
            id="quiz-count"
            onChange={(event) => setCount(Number(event.target.value))}
            value={count}
          >
            {(catalog?.countOptions || [3, 5, 10]).map((item) => (
              <option key={item} value={item}>{item}题</option>
            ))}
          </select>
        </div>
        <div className={styles.quizControlField}>
          <label htmlFor="quiz-focus">测试重点</label>
          <select
            disabled={Boolean(loading)}
            id="quiz-focus"
            onChange={(event) => setFocus(event.target.value as QuizFocus)}
            value={focus}
          >
            {(catalog?.focusOptions || ["mixed", "vocabulary", "concept"]).map((item) => (
              <option key={item} value={item}>{FOCUS_LABELS[item]}</option>
            ))}
          </select>
        </div>
        <button
          className={styles.generateQuizButton}
          disabled={!catalog || !serviceReady || Boolean(loading)}
          onClick={() => void generateQuiz()}
          type="button"
        >
          {loading === "generate" ? "正在从教材随机出题…" : quiz ? "换一组随机试题" : "开始随机出题"}
        </button>
      </section>

      <div className={styles.quizAssurance}>
        <strong>答案提交前由服务器保管</strong>
        <span>试题只依据所选Unit教材原文生成；提交或点击“查看答案”后才显示正确答案、解析和系统页码。</span>
        <button className={styles.quizVoiceToggle} onClick={() => voice.setAutoSpeak((value) => !value)} type="button">
          {voice.autoSpeak ? "✓ AI教师自动语音反馈" : "开启AI教师自动语音反馈"}
        </button>
      </div>

      {loading === "catalog" ? <p className={styles.quizEmpty}>正在读取54个教材Unit……</p> : null}
      {error ? <p className={styles.quizError} role="alert">{error}</p> : null}
      {voice.error ? <p className={styles.quizError} role="alert">{voice.error}</p> : null}
      {voiceNotice ? <p className={styles.quizVoiceNotice}>{voiceNotice}</p> : null}
      {!quiz && loading !== "catalog" ? (
        <div className={styles.quizEmpty}>
          请选择Unit、题量和测试重点，然后点击“开始随机出题”。每次都会重新抽取教材证据并生成一组新题。
        </div>
      ) : null}

      {quiz ? (
        <section className={styles.quizPaper} aria-label={`Unit ${quiz.unit}章节测试`}>
          <div className={styles.quizPaperHeader}>
            <div>
              <p>Unit {quiz.unit} 章节测试</p>
              <h3>{quiz.unitTitle}</h3>
            </div>
            <span>{answeredCount}/{quiz.count} 已作答</span>
          </div>

          {result ? (
            <div className={styles.quizScoreCard}>
              {result.revealed ? (
                <><strong>答案已显示</strong><span>本次未计分，可核对每题解析与教材页码。</span></>
              ) : (
                <><strong>{result.score}分</strong><span>答对{result.correct}题，共{result.total}题。</span></>
              )}
            </div>
          ) : null}

          <div className={styles.quizQuestions}>
            {quiz.questions.map((item, questionIndex) => {
              const answerResult = resultByQuestion.get(item.id);
              return (
                <fieldset className={styles.quizQuestion} key={item.id}>
                  <legend>
                    <span>{questionIndex + 1}</span>
                    <em>{KIND_LABELS[item.kind]}</em>
                    {item.stem}
                  </legend>
                  <div className={styles.quizVoiceActions}>
                    <button disabled={voice.isSpeaking} onClick={() => void voice.speak(questionSpeech(item.stem, item.options, questionIndex), { language: "mixed", rate: 0.94 })} type="button">🔊 AI教师朗读本题</button>
                    <button
                      aria-pressed={voice.isRecording && voiceQuestionId === item.id}
                      disabled={Boolean(result) || Boolean(loading) || voice.isTranscribing || (voice.isRecording && voiceQuestionId !== item.id)}
                      onClick={() => void toggleVoiceAnswer(item, questionIndex)}
                      type="button"
                    >
                      {voice.isTranscribing && voiceQuestionId === item.id ? "正在识别…" : voice.isRecording && voiceQuestionId === item.id ? "■ 结束并识别答案" : "🎤 语音选择答案"}
                    </button>
                  </div>
                  <div className={styles.quizOptions}>
                    {item.options.map((option, optionIndex) => {
                      const correct = answerResult?.correctIndex === optionIndex;
                      const selectedWrong =
                        answerResult?.selectedIndex === optionIndex && answerResult.isCorrect === false;
                      return (
                        <label
                          className={`${styles.quizOption} ${correct ? styles.quizOptionCorrect : ""} ${selectedWrong ? styles.quizOptionWrong : ""}`}
                          key={`${item.id}-${optionIndex}`}
                        >
                          <input
                            checked={answers[item.id] === optionIndex}
                            disabled={Boolean(result) || Boolean(loading)}
                            name={item.id}
                            onChange={() => setAnswers((current) => ({ ...current, [item.id]: optionIndex }))}
                            type="radio"
                            value={optionIndex}
                          />
                          <span className={styles.optionLetter}>{String.fromCharCode(65 + optionIndex)}</span>
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                  {answerResult ? (
                    <div className={styles.quizExplanation}>
                      <strong>正确答案：{String.fromCharCode(65 + answerResult.correctIndex)}．{answerResult.correctAnswer}</strong>
                      <p>{answerResult.explanation}</p>
                      <button className={styles.quizExplanationVoice} onClick={() => void voice.speak(`正确答案是${String.fromCharCode(65 + answerResult.correctIndex)}。${answerResult.correctAnswer}。解析：${answerResult.explanation}`, { language: "mixed" })} type="button">🔊 AI教师朗读解析</button>
                      {answerResult.sources.map((source) => (
                        <details key={`${item.id}-${source.id}`}>
                          <summary>{source.id}｜{source.citation}</summary>
                          <p>{source.excerpt}</p>
                        </details>
                      ))}
                    </div>
                  ) : null}
                </fieldset>
              );
            })}
          </div>

          <div className={styles.quizActions}>
            <button
              className={styles.clearButton}
              disabled={Boolean(result) || Boolean(loading)}
              onClick={() => void reveal()}
              type="button"
            >
              {loading === "reveal" ? "正在读取答案…" : "查看答案"}
            </button>
            <button
              className={styles.sendButton}
              disabled={Boolean(result) || Boolean(loading) || answeredCount === 0}
              onClick={() => void grade()}
              type="button"
            >
              {loading === "grade" ? "正在判分…" : `提交并判分（${answeredCount}/${quiz.count}）`}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
