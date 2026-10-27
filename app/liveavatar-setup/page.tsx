"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const AVATAR_ID_KEY = "surveying-ai-teacher.liveavatar-avatar-id";
const AVATAR_NAME_KEY = "surveying-ai-teacher.liveavatar-avatar-name";

type Avatar = {
  id: string;
  name: string;
  previewUrl: string;
  status: string;
  source: "user" | "public";
  is1080p: boolean;
};

type Payload = {
  ok?: boolean;
  configured?: boolean;
  avatars?: Avatar[];
  defaultAvatarId?: string;
  error?: { message?: string };
};

export default function LiveAvatarSetupPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    void fetch("/api/liveavatar/avatars", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as Payload | null;
        setConfigured(payload?.configured !== false);
        if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || "无法读取LiveAvatar人物列表。");
        const list = Array.isArray(payload.avatars) ? payload.avatars : [];
        setAvatars(list);
        const stored = window.localStorage.getItem(AVATAR_ID_KEY) || "";
        const preferred = stored || payload.defaultAvatarId || "";
        if (preferred && list.some((item) => item.id === preferred)) setSelectedId(preferred);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "无法读取LiveAvatar人物列表。"))
      .finally(() => setLoading(false));
  }, [refreshToken]);

  function reloadAvatars() {
    setLoading(true);
    setError("");
    setSaved(false);
    setRefreshToken((value) => value + 1);
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return avatars
      .filter((avatar) => !keyword || avatar.name.toLowerCase().includes(keyword) || avatar.id.toLowerCase().includes(keyword))
      .sort((a, b) => Number(b.source === "user") - Number(a.source === "user") || a.name.localeCompare(b.name));
  }, [avatars, query]);

  function saveAvatar() {
    const selected = avatars.find((item) => item.id === selectedId);
    if (!selected) return;
    window.localStorage.setItem(AVATAR_ID_KEY, selected.id);
    window.localStorage.setItem(AVATAR_NAME_KEY, selected.name);
    setSaved(true);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><b>VERSION 21 · LIVEAVATAR LITE</b><span>真人AI教师人物配置</span></div>
        <Link href="/">返回课程主页</Link>
      </header>

      <section className={styles.intro}>
        <span className={styles.eyebrow}>单路真人视频 · 480P · H.264</span>
        <h1>从账户人物列表中<br />选择已经确定的女教师</h1>
        <p>API Key只由北京地域服务端读取，不会显示在人物列表或发送到浏览器。这里仅保存所选人物的公开编号和名称。</p>
        <div className={styles.steps}>
          <div className={configured ? styles.done : styles.wait}><i>1</i><strong>填写密钥</strong><span>{configured ? "已检测到LiveAvatar密钥" : "请让教师在云服务配置中填写"}</span></div>
          <div className={selectedId ? styles.done : styles.wait}><i>2</i><strong>选择人物</strong><span>{selectedId ? "已选择一名人物" : "在下方人物卡片中选择"}</span></div>
          <div className={saved ? styles.done : styles.wait}><i>3</i><strong>保存并测试</strong><span>{saved ? "已保存，可进入课程主页" : "点击保存选择"}</span></div>
        </div>
      </section>

      {!configured ? (
        <section className={styles.keyHelp}>
          <div><span>API KEY</span><h2>先完成教师端云密钥配置</h2></div>
          <ol>
            <li>使用教师账号登录，打开“教师工作台 → 云服务配置”。</li>
            <li>把 LiveAvatar Developers 页面复制的密钥粘贴到LiveAvatar API Key字段。</li>
            <li>点击“加密保存配置”，再回到本页重新检测。</li>
          </ol>
          <a href="https://app.liveavatar.com/developers" rel="noreferrer" target="_blank">打开LiveAvatar Developers</a>
          <button onClick={reloadAvatars} type="button">我已保存，重新检测</button>
        </section>
      ) : null}

      <section className={styles.browser}>
        <div className={styles.browserHead}>
          <div><span>AVATAR LIBRARY</span><h2>人物列表</h2><p>“我的人物”排在前面，公共人物随后显示。点击卡片预览并选择。</p></div>
          <label>搜索人物<input onChange={(event) => setQuery(event.target.value)} placeholder="输入人物名称…" value={query} /></label>
        </div>

        {loading ? <div className={styles.loading}>正在从LiveAvatar读取人物列表…</div> : null}
        {error ? <div className={styles.error}><strong>人物列表暂时不可用</strong><p>{error}</p><button onClick={reloadAvatars} type="button">重新读取</button></div> : null}
        {!loading && !error && filtered.length === 0 ? <div className={styles.loading}>没有找到匹配的人物。</div> : null}

        <div className={styles.grid}>
          {filtered.map((avatar) => {
            const selected = avatar.id === selectedId;
            return (
              <button aria-pressed={selected} className={`${styles.card} ${selected ? styles.selected : ""}`} key={avatar.id} onClick={() => { setSelectedId(avatar.id); setSaved(false); }} type="button">
                <div className={styles.preview}>
                  {avatar.previewUrl ? <video autoPlay={selected} loop muted playsInline preload="metadata" src={avatar.previewUrl} /> : <div className={styles.noPreview}>暂无预览</div>}
                  <span>{avatar.source === "user" ? "我的人物" : "公共人物"}</span>
                </div>
                <div className={styles.meta}><strong>{avatar.name}</strong><small>{avatar.status || "可用"} · {avatar.is1080p ? "支持1080P" : "实时人物"}</small><code>{avatar.id}</code></div>
                <i className={styles.check}>{selected ? "✓" : ""}</i>
              </button>
            );
          })}
        </div>
      </section>

      <footer className={styles.footer}>
        <div><strong>{selectedId ? `已选择：${avatars.find((item) => item.id === selectedId)?.name || selectedId}` : "尚未选择人物"}</strong><span>保存后只在当前浏览器中生效，不会改变LiveAvatar后台人物。</span></div>
        <button disabled={!selectedId} onClick={saveAvatar} type="button">保存人物选择</button>
        {saved ? <Link href="/">进入课程主页测试</Link> : null}
      </footer>
    </main>
  );
}
