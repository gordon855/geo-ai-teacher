"use client";

import { useEffect, useState } from "react";
import styles from "./classroom.module.css";

type Status = {
  knowledgeBase: boolean;
  bailian: boolean;
  deepseek: boolean;
  liveavatar: boolean;
  defaultAvatar: boolean;
  voice: boolean;
  aiProvider: string;
  chatModel: string;
};

type Fields = {
  AI_PROVIDER: string;
  DASHSCOPE_API_KEY: string;
  BAILIAN_WORKSPACE_ID: string;
  BAILIAN_BASE_URL: string;
  KB_CHAT_MODEL: string;
  DEEPSEEK_API_KEY: string;
  DEEPSEEK_MODEL: string;
  LIVEAVATAR_API_KEY: string;
  LIVEAVATAR_DEFAULT_AVATAR_ID: string;
  VOICE_ASR_MODEL: string;
  VOICE_TTS_MODEL: string;
  VOICE_TTS_VOICE: string;
  VOICE_TTS_RATE: string;
};

const defaults: Fields = {
  AI_PROVIDER: "bailian",
  DASHSCOPE_API_KEY: "",
  BAILIAN_WORKSPACE_ID: "",
  BAILIAN_BASE_URL: "",
  KB_CHAT_MODEL: "qwen-plus",
  DEEPSEEK_API_KEY: "",
  DEEPSEEK_MODEL: "deepseek-chat",
  LIVEAVATAR_API_KEY: "",
  LIVEAVATAR_DEFAULT_AVATAR_ID: "",
  VOICE_ASR_MODEL: "qwen-audio-3.0-asr-flash",
  VOICE_TTS_MODEL: "qwen-audio-3.0-tts-plus",
  VOICE_TTS_VOICE: "longanlingxin",
  VOICE_TTS_RATE: "0.95",
};

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "服务器处理失败。");
  return payload;
}

export default function CloudSettingsPanel() {
  const [fields, setFields] = useState<Fields>(defaults);
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void jsonRequest("/api/cloud/settings")
      .then((payload) => {
        setStatus(payload.status);
        setFields((current) => ({ ...current, ...payload.values, DASHSCOPE_API_KEY: "", DEEPSEEK_API_KEY: "", LIVEAVATAR_API_KEY: "" }));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "无法读取云服务配置。"));
  }, []);

  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setPending(true); setNotice(""); setError("");
    try {
      const payload = await jsonRequest("/api/cloud/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      setStatus(payload.status);
      setFields((current) => ({ ...current, ...payload.values, DASHSCOPE_API_KEY: "", DEEPSEEK_API_KEY: "", LIVEAVATAR_API_KEY: "" }));
      setNotice("云服务配置已加密保存；新请求会立即使用。密钥不会回传到浏览器。 ");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally { setPending(false); }
  }

  async function clearSecret(key: "DASHSCOPE_API_KEY" | "DEEPSEEK_API_KEY" | "LIVEAVATAR_API_KEY") {
    if (!window.confirm("确定清除该密钥吗？对应的付费能力会立即停用。")) return;
    setPending(true); setNotice(""); setError("");
    try {
      const payload = await jsonRequest("/api/cloud/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      setStatus(payload.status);
      setNotice("密钥已清除。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "清除失败。");
    } finally { setPending(false); }
  }

  const serviceCards = [
    ["演示课程知识库", true, "免费检索始终可用"],
    ["百炼问答与语音", Boolean(status?.bailian), status?.bailian ? "已配置" : "未配置"],
    ["DeepSeek问答", Boolean(status?.deepseek), status?.deepseek ? "已配置" : "未配置"],
    ["LiveAvatar真人教师", Boolean(status?.liveavatar), status?.liveavatar ? "已配置 · 全站单会话" : "未配置"],
  ] as const;

  return (
    <>
      <section className={styles.heading}>
        <div><small>VERSION 21 · CLOUD SERVICES</small><h1>公网云服务配置</h1><p>密钥只在服务端加密保存。学生浏览器看不到密钥；不填付费生成模型时，演示知识库摘述与内置PPT术语译法仍可使用。2.5D和LiveAvatar全屏数字教师只在教师工作台开放；AI作业初评使用这里配置的百炼或DeepSeek。</p></div>
        <button className={styles.primary} disabled={pending} onClick={() => void save()}>{pending ? "正在保存……" : "加密保存配置"}</button>
      </section>
      {notice ? <div className={styles.notice} style={{ marginBottom: 13 }}>{notice}</div> : null}
      {error ? <div className={styles.error} style={{ marginBottom: 13 }}>{error}</div> : null}
      <section className={styles.grid4}>
        {serviceCards.map(([label, ready, note]) => <article className={styles.metric} key={label}><span>{label}</span><b style={{ color: ready ? "#16a085" : "#b06b1f", fontSize: 22 }}>{ready ? "可用" : "待配置"}</b><em>{note}</em></article>)}
      </section>

      <section className={styles.manageGrid} style={{ marginTop: 14 }}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>AI MODEL</span><h3>课程问答模型</h3></div><em>建议先只选一个，便于控费</em></header>
          <div className={styles.formGrid}>
            <label><span>默认AI服务</span><select value={fields.AI_PROVIDER} onChange={(event) => update("AI_PROVIDER", event.target.value)}><option value="bailian">阿里云百炼</option><option value="deepseek">DeepSeek</option></select></label>
            <label><span>百炼模型</span><input value={fields.KB_CHAT_MODEL} onChange={(event) => update("KB_CHAT_MODEL", event.target.value)} /></label>
            <label className={styles.wideField}><span>百炼 API Key（留空不改变）</span><input autoComplete="off" placeholder={status?.bailian ? "已配置 · 输入新值可替换" : "sk-..."} type="password" value={fields.DASHSCOPE_API_KEY} onChange={(event) => update("DASHSCOPE_API_KEY", event.target.value)} /></label>
            <label><span>百炼业务空间 ID（可选）</span><input value={fields.BAILIAN_WORKSPACE_ID} onChange={(event) => update("BAILIAN_WORKSPACE_ID", event.target.value)} /></label>
            <label><span>百炼兼容接口地址（可选）</span><input placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" value={fields.BAILIAN_BASE_URL} onChange={(event) => update("BAILIAN_BASE_URL", event.target.value)} /></label>
            <label className={styles.wideField}><span>DeepSeek API Key（留空不改变）</span><input autoComplete="off" placeholder={status?.deepseek ? "已配置 · 输入新值可替换" : "sk-..."} type="password" value={fields.DEEPSEEK_API_KEY} onChange={(event) => update("DEEPSEEK_API_KEY", event.target.value)} /></label>
            <label><span>DeepSeek模型</span><input value={fields.DEEPSEEK_MODEL} onChange={(event) => update("DEEPSEEK_MODEL", event.target.value)} /></label>
            <div className={styles.panelHeaderActions}><button className={styles.dangerGhost} disabled={pending || !status?.bailian} onClick={() => void clearSecret("DASHSCOPE_API_KEY")}>清除百炼密钥</button><button className={styles.dangerGhost} disabled={pending || !status?.deepseek} onClick={() => void clearSecret("DEEPSEEK_API_KEY")}>清除DeepSeek密钥</button></div>
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>LIVE AVATAR & VOICE</span><h3>真人教师与连续语音</h3></div><em>真人教师每次最多5分钟</em></header>
          <div className={styles.formGrid}>
            <label className={styles.wideField}><span>LiveAvatar API Key（留空不改变）</span><input autoComplete="off" placeholder={status?.liveavatar ? "已配置 · 输入新值可替换" : "LiveAvatar API Key"} type="password" value={fields.LIVEAVATAR_API_KEY} onChange={(event) => update("LIVEAVATAR_API_KEY", event.target.value)} /></label>
            <label className={styles.wideField}><span>默认人物 UUID（可在人物选择页设置）</span><input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={fields.LIVEAVATAR_DEFAULT_AVATAR_ID} onChange={(event) => update("LIVEAVATAR_DEFAULT_AVATAR_ID", event.target.value)} /></label>
            <label><span>语音识别模型</span><input value={fields.VOICE_ASR_MODEL} onChange={(event) => update("VOICE_ASR_MODEL", event.target.value)} /></label>
            <label><span>语音合成模型</span><input value={fields.VOICE_TTS_MODEL} onChange={(event) => update("VOICE_TTS_MODEL", event.target.value)} /></label>
            <label><span>教师音色</span><input value={fields.VOICE_TTS_VOICE} onChange={(event) => update("VOICE_TTS_VOICE", event.target.value)} /></label>
            <label><span>语速（0.5—2）</span><input max="2" min="0.5" step="0.05" type="number" value={fields.VOICE_TTS_RATE} onChange={(event) => update("VOICE_TTS_RATE", event.target.value)} /></label>
            <div className={styles.panelHeaderActions}><button className={styles.dangerGhost} disabled={pending || !status?.liveavatar} onClick={() => void clearSecret("LIVEAVATAR_API_KEY")}>清除LiveAvatar密钥</button></div>
          </div>
        </article>
      </section>
      <section className={styles.panel} style={{ marginTop: 14 }}><div className={styles.upload}><i>￥</i><div><b>低成本默认策略</b><span>学生使用AI问答、语音与PPT重点解析；2.5D和LiveAvatar全屏数字教师只在教师工作台开放。全站LiveAvatar仍为1路480P LITE真人会话，最长5分钟。AI回答先检索813条课程资料，只有配置模型后才产生模型调用费。</span></div></div></section>
    </>
  );
}
