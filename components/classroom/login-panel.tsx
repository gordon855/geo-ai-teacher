"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./classroom.module.css";

type LoginRole = "teacher" | "student";

export default function LoginPanel({ role }: { role: LoginRole }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/classroom/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.configured) setStatusMessage(payload.message || "班级管理服务尚未配置。");
      })
      .catch(() => setStatusMessage("暂时无法读取班级管理服务状态。"));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/classroom/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, expectedRole: role }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "登录失败。");
      router.replace(role === "teacher" ? "/teacher" : "/student");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败。");
    } finally {
      setPending(false);
    }
  }

  const isTeacher = role === "teacher";
  return (
    <main className={styles.loginShell}>
      <section className={styles.loginShow}>
        <Link className={styles.brand} href="/">
          <i>测</i>
          <span><b>测绘专业外语AI虚拟教师</b><em>PERSONAL NON-OFFICIAL · VERSION 21</em></span>
        </Link>
        <div className={styles.loginCopy}>
          <span>{isTeacher ? "TEACHER CONSOLE" : "STUDENT LEARNING SPACE"}</span>
          <h1>{isTeacher ? "把每一次课堂记录，变成" : "让专业英语"}<br /><mark>{isTeacher ? "可追溯的教学证据" : "看得懂、说得准、用得上"}</mark></h1>
          <p>{isTeacher ? "管理班级、课次、点名、上一课随机提问和学习反馈。" : "使用教师提供的学习编号和个人密码，查看课程进度、出勤、课堂提问与学习反馈。"}</p>
        </div>
        <div className={styles.loginTeacher}>
          <Image alt="测绘专业外语AI虚拟教师" fill priority sizes="430px" src="/images/digital-teacher-step7-trimmed.svg" />
        </div>
      </section>
      <section className={styles.loginFormSide}>
        <div className={styles.loginCard}>
          <span>{isTeacher ? "TEACHER LOGIN" : "STUDENT LOGIN"}</span>
          <h2>{isTeacher ? "教师登录" : "学生登录"}</h2>
          <p>{isTeacher ? "请输入教师管理员账号和密码；首次登录后必须立即更换初始密码。" : "首次登录使用教师导入名单后生成的临时密码。请勿在个人站点填写身份证号或手机号。"}</p>
          <form onSubmit={submit}>
            <label>
              <span>{isTeacher ? "教师账号" : "学号"}</span>
              <input autoComplete="username" maxLength={40} onChange={(event) => setUsername(event.target.value)} placeholder={isTeacher ? "默认账号 teacher" : "请输入学号"} required value={username} />
            </label>
            <label>
              <span>密码</span>
              <input autoComplete="current-password" maxLength={128} minLength={1} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" required type="password" value={password} />
            </label>
            {statusMessage ? <div className={styles.error}>{statusMessage}</div> : null}
            {error ? <div className={styles.error}>{error}</div> : null}
            <button className={styles.primary} disabled={pending}>{pending ? "正在登录……" : "登录课程空间 →"}</button>
          </form>
          <p className={styles.loginHint}>独立部署的教学工具。密码在本实例服务端使用PBKDF2-SHA256加盐哈希保存；登录Cookie为HttpOnly。</p>
          <Link className={styles.secondary} href="/" style={{ display: "grid", placeItems: "center", marginTop: 10 }}>← 返回AI教师问答</Link>
        </div>
      </section>
    </main>
  );
}
