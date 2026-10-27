"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsLeftRight,
  BookOpenText,
  ChatCircleText,
  ClipboardText,
  GraduationCap,
  House,
  MapTrifold,
  PresentationChart,
  UserCircle,
} from "@phosphor-icons/react";
import { useSmartVoice } from "@/components/voice/use-smart-voice";
import StudentAssignmentPanel from "@/components/assignments/student-assignment-panel";
import StudentBarragePanel from "@/components/classroom/student-barrage-panel";
import { StudentTrainingHubV172 } from "@/components/v172/training-hubs";
import styles from "./classroom.module.css";

type StudentUser = {
  id: string;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
};

type StudentOverview = {
  course: { id: string; name: string; courseCode: string; term: string; currentLessonOrdinal: number };
  studentNo: string;
  currentLesson: { ordinal: number; title: string; detail: string; unit_range: string } | null;
  attendance: Array<{ ordinal: number; title: string; status: string | null; note: string | null }>;
  questionRecords: Array<{ score: number; teacher_note: string; created_at: string; prompt: string; source: string }>;
  grades: {
    scores: Record<"homework" | "seminar" | "practice" | "final_project", number | null>;
    total: number;
  } | null;
  officialWeights: Array<{ category: string; label: string; weight: number }>;
};

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "服务器处理失败。");
  return payload;
}

export default function StudentDashboard({ user }: { user: StudentUser }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [data, setData] = useState<StudentOverview | null>(null);
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const voice = useSmartVoice();

  useEffect(() => {
    requestJson("/api/classroom/student/overview")
      .then((payload) => setData(payload.data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "无法读取课程数据。"));
  }, []);

  const attendanceRate = useMemo(() => {
    if (!data) return null;
    const recorded = data.attendance.filter((row) => row.status);
    if (!recorded.length) return null;
    const attended = recorded.filter((row) => row.status === "present" || row.status === "late").length;
    return Math.round(attended / recorded.length * 100);
  }, [data]);

  async function logout() {
    await fetch("/api/classroom/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/student/login");
    router.refresh();
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await requestJson("/api/classroom/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      router.refresh();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "密码修改失败。");
    } finally {
      setPending(false);
    }
  }

  if (user.mustChangePassword && !passwordSaved) {
    return (
      <main className={styles.shell}>
        <section className={styles.passwordPanel}>
          <small>FIRST LOGIN SECURITY</small>
          <h2>首次登录必须修改密码</h2>
          <p>临时密码只用于首次登录。新密码至少10位，并同时包含英文字母和数字。</p>
          {error ? <div className={styles.error} style={{ marginBottom: 10 }}>{error}</div> : null}
          <form onSubmit={changePassword}>
            <input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} placeholder="当前临时密码" required type="password" value={currentPassword} />
            <input autoComplete="new-password" minLength={10} onChange={(event) => setNewPassword(event.target.value)} placeholder="新密码" required type="password" value={newPassword} />
            <button className={styles.primary} disabled={pending}>{pending ? "正在保存……" : "保存新密码并进入课程"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell student-theme v172-production-shell v18-student">
      <aside className="sidebar">
        <Link className="brand-lockup" href="/">
          <Image alt="测绘专业外语平台标志" height={49} priority src="/v16/brand-logo.svg" width={49} />
          <div><strong>测绘专业外语</strong><span>智能实训平台 · V20</span></div>
        </Link>
        <nav aria-label="学生端导航"><Link className="v172-sidebar-link" href="/student/messages"><ChatCircleText size={21}/><span>给老师留言 · 匿名</span></Link><Link href="/student/checkin">课堂签到</Link>
          <button className="active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><MapTrifold size={21} weight="fill" /><span>智能实训</span></button>
          <button onClick={() => document.getElementById("student-records")?.scrollIntoView({ behavior: "smooth" })}><House size={21} /><span>学习档案</span></button>
          <Link className="v172-sidebar-link" href="/student/presentation"><PresentationChart size={21} /><span>课堂交互PPT</span></Link>
          <a className="v172-sidebar-link" href="#assignments"><ClipboardText size={21} /><span>课程作业</span></a>
          <Link className="v172-sidebar-link" href="/student/smart-learning"><BookOpenText size={21} /><span>完整智能实训</span></Link>
          <Link className="v172-sidebar-link" href="/student/terrain-3d"><MapTrifold size={21} /><span>3D地形独立页</span></Link>
          <Link className="v172-sidebar-link" href="/"><ChatCircleText size={21} /><span>AI教师问答</span></Link>
          <button onClick={() => document.getElementById("student-profile")?.scrollIntoView({ behavior: "smooth" })}><UserCircle size={21} /><span>个人中心</span></button>
        </nav>
        <div className="v172-kb-card"><span>课程知识库<b>ONLINE</b></span><div><span>813 知识块</span><span>384 教材页</span><span>54 Units</span></div></div>
        <div className="sidebar-motto"><GraduationCap size={24} /><span>以地理之眼<br />读世界之文</span></div>
        <div className="sidebar-footer"><span className="status-dot" /><div><strong>{user.displayName}</strong><small>学生 · {user.username}</small></div><button className="v172-sidebar-logout" onClick={() => void logout()}>退出</button></div>
      </aside>
      <section className="app-main"><section className="v21-banner"><div><small>LEARNING JOURNEY / 21</small><h2>从理解原文，到解决问题</h2><p>查资料、练词汇、做测试；用证据说明你的思考。</p></div><div><Link href="/">六大学习工作台</Link><Link href="/student/scenarios">情境任务与反馈</Link></div></section>
        <header className="topbar">
          <div className="top-title"><strong>智能实训中心</strong><span>真实数据 · 专业任务 · GIS实践</span></div>
          <form className="global-search" onSubmit={event=>{event.preventDefault();if(search.trim())router.push('/?q='+encodeURIComponent(search.trim()));}}><BookOpenText size={18}/><input aria-label="向AI教师提问" maxLength={4000} placeholder="向AI教师提问，探索课程知识…" value={search} onChange={event=>setSearch(event.target.value)}/><button type="submit" aria-label="发送课程问题">↗</button></form>
          <div className="top-actions"><Link className="v172-top-link" href="/student/messages">匿名留言</Link><a className="v172-top-link" href="#assignments"><ClipboardText size={20}/>作业</a><Link className="v172-top-link" href="/student/chapter-tests"><ArrowsLeftRight size={17} />章节测试 · 20题</Link><span className="profile-badge">{user.displayName.slice(-1)}</span><div className="profile-copy"><strong>{user.displayName}</strong><span>测绘工程专业</span></div></div>
        </header>
        <section className="v18-course-brief"><div><small>JINGWEI / LEARNING STUDIO</small><h1>以地理之眼，读世界之文。</h1><p>{data?.currentLesson?.title || "在真实地形与专业语境中，建立你的测绘知识体系。"}</p><div><span>{data?.course.term || "课程数据读取中"}</span><span>{data ? `${data.questionRecords.length} 次课堂提问` : "连接课程档案"}</span><span>教材依据可追溯</span></div></div><Link href="/">开启 AI 辅导 <b>↗</b></Link></section>
        <StudentTrainingHubV172
          courseName={data?.course.name || "测绘专业外语"}
          onShowRecords={() => document.getElementById("student-records")?.scrollIntoView({ behavior: "smooth" })}
          userName={user.displayName}
        />
        <div className={`${styles.content} v172-records v172-skip-target`} id="student-records">
          {error ? <div className={styles.error} style={{ marginBottom: 13 }}>{error}</div> : null}
          {voice.error ? <div className={styles.error} style={{ marginBottom: 13 }}>{voice.error}</div> : null}
          <section className={`${styles.heading} v172-records-heading`} id="student-profile"><div><small>LEARNING RECORD · VERSION 21</small><h1>{user.displayName}的学习档案</h1><p>{data ? data.course.name + " · " + data.course.term : "正在读取课程数据……"}</p></div></section>
          {data ? (
            <>
              <section className={styles.grid4}>
                <article className={styles.metric}><span>课程进度</span><b>{data.course.currentLessonOrdinal}/12</b><em>总学时24</em></article>
                <article className={styles.metric}><span>个人出勤率</span><b>{attendanceRate === null ? "未点名" : `${attendanceRate === null ? "暂无记录" : attendanceRate+"%"}`}</b><em>迟到计入已到</em></article>
                <article className={styles.metric}><span>课堂提问</span><b>{data.questionRecords.length}</b><em>教师确认后记分</em></article>
                <article className={styles.metric}><span>当前总评</span><b>{data.grades?.total?.toFixed(1) ?? "待评"}</b><em>按2025版大纲</em></article>
              </section>
              <section className={styles.hero}>
                <div className={styles.heroCopy}><span>CURRENT LESSON · {String(data.currentLesson?.ordinal || 0).padStart(2, "0")}</span><h2>{data.currentLesson?.title || "课程尚未开始"}</h2><p>{data.currentLesson?.detail || "请等待教师更新教学进度。"}</p><div className={styles.heroMeta}><i>{data.currentLesson?.unit_range || "—"}</i><i>上一课随机复习</i><i>教材原文可追溯</i></div><div className={styles.heroActions}><Link className={styles.primary} href="/student/terrain-3d">进入地形与城市3D实训 →</Link><Link className={styles.secondary} href="/student/presentation">课堂交互PPT</Link><Link className={styles.secondary} href="/">AI教师问答与重点解析</Link><Link className={styles.secondary} href="/student/smart-learning">其他智能实训</Link><button className={styles.secondary} onClick={() => void voice.speak(`你好，${user.displayName}。当前课程进度是第${data.course.currentLessonOrdinal}课，共12课。当前学习内容：${data.currentLesson?.title || "课程尚未开始"}。${data.currentLesson?.detail || "请等待教师更新教学进度"}。你的出勤率是${attendanceRate === null ? "未点名" : `${attendanceRate === null ? "暂无记录" : attendanceRate+"%"}`}。课堂提问记录${data.questionRecords.length}次。当前总评${data.grades?.total?.toFixed(1) ?? "待评"}分。`, { language: "mixed", rate: 0.95 })} type="button">{voice.isSpeaking ? "AI教师正在播报…" : "🔊 AI教师朗读学习概览"}</button>{voice.isSpeaking ? <button className={styles.secondary} onClick={voice.stopSpeaking} type="button">停止</button> : null}</div></div>
                <div className={styles.heroTeacher}><Image alt="测绘专业外语AI虚拟教师" fill priority sizes="300px" src="/images/digital-teacher-step7-trimmed.svg" /></div>
              </section>
              <div id="discussion"><StudentBarragePanel classId={data.course.id} /></div>
              <section className={styles.twoCol}>
                <article className={styles.panel}><header className={styles.panelHeader}><div><span>ATTENDANCE</span><h3>个人出勤记录</h3></div><em>{data.attendance.filter((row) => row.status).length}次已记录</em></header><div className={styles.schedule}>{data.attendance.map((row) => <article key={row.ordinal}><i>{row.ordinal}</i><div><b>{row.title}</b><span>{row.note || "无备注"}</span></div><em>{row.status ? ({ present: "正常", late: "迟到", leave: "请假", absent: "缺勤" } as Record<string, string>)[row.status] : "未点名"}</em></article>)}</div></article>
                <article className={styles.panel}><header className={styles.panelHeader}><div><span>GRADE FEEDBACK</span><h3>2025版成绩结构</h3></div><em>总评 {data.grades?.total?.toFixed(1) ?? "待评"}</em></header><div className={styles.weights}>{data.officialWeights.map((weight) => <div key={weight.category}><span>{weight.label}</span><b>{data.grades?.scores[weight.category as keyof typeof data.grades.scores] ?? "—"} / 100</b><i><em style={{ width: String(weight.weight * 2) + "%" }} /></i></div>)}</div></article>
              </section>
              <div id="assignments"><StudentAssignmentPanel /></div>
              <section className={styles.panel} style={{ marginTop: 14 }}><header className={styles.panelHeader}><div><span>COLD CALL RECORDS</span><h3>课堂提问反馈</h3></div><em>{data.questionRecords.length}条记录</em></header>{data.questionRecords.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>题目</th><th>教材依据</th><th>得分</th><th>教师备注</th></tr></thead><tbody>{data.questionRecords.map((record, index) => <tr key={record.created_at + index}><td>{record.prompt}</td><td>{record.source}</td><td><b>{record.score}/10</b></td><td>{record.teacher_note || "—"}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><b>暂无课堂提问记录</b><p>教师确认得分后会在这里显示。</p></div>}</section>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
