"use client";

import LoopPanel from '@/components/remediation/loop-panel';
import Link from "next/link";
import TeacherMessages from '@/components/messages/teacher-messages';
import TeacherCheckin from "@/components/checkin/teacher";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Broadcast,
  ChartBar,
  ClipboardText,
  Cloud,
  Database,
  GraduationCap,
  House,
  MapTrifold,
  PresentationChart,
  Question,
  Robot,
  UsersThree,
} from "@phosphor-icons/react";
import styles from "./classroom.module.css";
import { SMART_CONTENT_TOTALS, SMART_LEARNING_MODULES, getSmartLessonModule } from "@/lib/step9/learning-content";
import {
  ENRICHMENT_TOTALS,
  getAuthenticMaterialsForLesson,
  getFiveLayerDetail,
  getHighlightCoverageForLesson,
  getHighlightedSentencesForLesson,
} from "@/lib/step10/enrichment-content";
import TeacherPresentationPanel from "@/components/presentation/teacher-presentation-panel";
import CloudSettingsPanel from "@/components/classroom/cloud-settings-panel";
import { launchClassroom } from "@/lib/step21-7/classroom-client";
import type { ColdCallBroadcast } from "@/lib/step8a/types";
import FullscreenLocalDigitalTeacher from "@/components/avatar/fullscreen-local-digital-teacher";
import ChapterTests from '@/components/assessments/chapter-tests';
import GradeHistory from '@/components/assessments/grade-history';
import TeacherAssignmentPanel from "@/components/assignments/teacher-assignment-panel";
import BarrageLiveDisplay from "@/components/classroom/barrage-live-display";
import TeacherKnowledgePanel from "@/components/knowledge/teacher-knowledge-panel";
import Terrain3dLab from "@/components/training/terrain-lab";
import { TeacherCommandCenterV172 } from "@/components/v172/training-hubs";

import TeacherStations from "@/components/workstations/teacher-stations";
import ScenarioPanel from "@/components/workstations/scenario-panel";
import {MotionSwitch} from "@/components/workstations/motion";

type Tab = "messages" | "workstations" | "scenarios" | "dashboard" | "roster" | "attendance" | "questions" | "assignments" | "grades" | "smart" | "terrain" | "presentation" | "knowledge" | "cloud";
type Lesson = { id: string; ordinal: number; weekLabel: string; dateLabel: string; title: string; detail: string; unitRange: string; hours: number };
type Student = { id: string; studentNo: string; name: string; attendanceRate: number; questionScore: number };
type ClassSummary = { id: string; name: string; courseCode: string; term: string; totalHours: number; currentLessonOrdinal: number; studentCount: number; isSystemDefault: boolean };
type Overview = {
  course: { id: string; name: string; courseCode: string; term: string; totalHours: number; currentLessonOrdinal: number; isSystemDefault: boolean };
  lessons: Lesson[];
  students: Student[];
  classes: ClassSummary[];
  previousQuestionCount: number;
  officialWeights: Array<{ category: string; label: string; weight: number }>;
};
type AttendanceRow = { studentUserId: string; studentNo: string; name: string; status: "present" | "late" | "leave" | "absent"; note: string };
type DrawResult = {
  attendanceSaved: boolean;
  sourceLessonOrdinal: number;
  student: { id: string; name: string; studentNo: string; attendanceStatus: string; priorQuestionCount: number };
  question: { id: string; kind: "terminology" | "syntax" | "concept"; prompt: string; rubric: string; source: string };
  broadcast?: ColdCallBroadcast;
};
type Answer = { answer: string; rubric: string; source: string };
type DeletionPreview = {
  classId: string;
  studentCount: number;
  attendanceRecords: number;
  questionRecords: number;
  gradeRecords: number;
  learningRecords: number;
  accountsDisabled: number;
  className?: string;
  lessonCount?: number;
};
type GradeRow = {
  id: string;
  name: string;
  studentNo: string;
  scores: Record<"homework" | "seminar" | "practice" | "final_project", number | null>;
  total: number;
};

const tabs: Array<{ id: Tab; Icon: typeof House; label: string }> = [
  { id: "workstations", Icon: BookOpenText, label: "六大学习工作台" },
  { id: "scenarios", Icon: ClipboardText, label: "情境任务与证据" },
  { id: "messages", Icon: ClipboardText, label: "学生匿名留言" },
  { id: "dashboard", Icon: Broadcast, label: "课堂指挥中心" },
  { id: "roster", Icon: UsersThree, label: "班级与账号" },
  { id: "attendance", Icon: ClipboardText, label: "课堂点名" },
  { id: "questions", Icon: Question, label: "随机提问" },
  { id: "smart", Icon: BookOpenText, label: "智能实训内容" },
  { id: "terrain", Icon: MapTrifold, label: "3D地形实训" },
  { id: "presentation", Icon: PresentationChart, label: "课堂交互PPT" },
  { id: "knowledge", Icon: Database, label: "本地知识库" },
  { id: "assignments", Icon: ClipboardText, label: "作业发布与批改" },
  { id: "cloud", Icon: Cloud, label: "云服务配置" },
  { id: "grades", Icon: ChartBar, label: "课程成绩" },
];
const statusLabels = { present: "正常", late: "迟到", leave: "请假", absent: "缺勤" };
const gradeCategories = [
  { id: "homework" as const, label: "课后作业", weight: 10 },
  { id: "seminar" as const, label: "专题研讨", weight: 20 },
  { id: "practice" as const, label: "检索与操作", weight: 20 },
  { id: "final_project" as const, label: "开放式大作业", weight: 50 },
];

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || "服务器处理失败。");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return payload;
}

function studentInitial(name: string) {
  return name.slice(-2);
}

export default function TeacherDashboard({ teacherName, mustChangePassword, initialModule = "dashboard" }: { teacherName: string; mustChangePassword: boolean; initialModule?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(["terrain","smart","presentation","assignments","workstations","scenarios","messages"].includes(initialModule) ? initialModule as Tab : "dashboard");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, Record<string, string>>>({});
  const [draw, setDraw] = useState<DrawResult | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [lessonDraft, setLessonDraft] = useState(1);
  const [newClass, setNewClass] = useState({ name: "", courseCode: "220501008", term: "2025—2026学年第1学期" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [smartLessonOrdinal, setSmartLessonOrdinal] = useState(1);
  const [passwordRequired, setPasswordRequired] = useState(mustChangePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarQuestion, setAvatarQuestion] = useState<ColdCallBroadcast | null>(null);
  const [useLiteQuestions, setUseLiteQuestions] = useState(true);

  const currentLesson = useMemo(
    () => overview?.lessons.find((lesson) => lesson.ordinal === overview.course.currentLessonOrdinal) || null,
    [overview],
  );
  const previousLesson = useMemo(
    () => overview?.lessons.find((lesson) => lesson.ordinal === (overview.course.currentLessonOrdinal - 1)) || null,
    [overview],
  );
  const smartLesson = useMemo(() => getSmartLessonModule(smartLessonOrdinal), [smartLessonOrdinal]);
  const smartMaterials = useMemo(() => getAuthenticMaterialsForLesson(smartLessonOrdinal), [smartLessonOrdinal]);
  const smartHighlights = useMemo(() => getHighlightedSentencesForLesson(smartLessonOrdinal), [smartLessonOrdinal]);
  const smartHighlightCoverage = useMemo(() => getHighlightCoverageForLesson(smartLessonOrdinal), [smartLessonOrdinal]);

  async function loadOverview(classId?: string) {
    try {
      const query = classId ? "?classId=" + encodeURIComponent(classId) : "";
      const payload = await requestJson("/api/classroom/overview" + query);
      setOverview(payload.data);
      setSelectedStudentIds([]);
      setLessonDraft(payload.data.course.currentLessonOrdinal);
      setSmartLessonOrdinal(payload.data.course.currentLessonOrdinal);
      setError("");
    } catch (loadError) {
      if ((loadError as Error & { status?: number }).status === 401) {
        router.replace("/teacher/login");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "无法读取班级数据。");
    }
  }

  useEffect(() => {
    let active = true;
    requestJson("/api/classroom/overview")
      .then((payload) => {
        if (active) {
          setOverview(payload.data);
          setSelectedStudentIds([]);
          setLessonDraft(payload.data.course.currentLessonOrdinal);
          setSmartLessonOrdinal(payload.data.course.currentLessonOrdinal);
          setError("");
        }
      })
      .catch((loadError) => {
        if (!active) return;
        if ((loadError as Error & { status?: number }).status === 401) {
          router.replace("/teacher/login");
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "无法读取班级数据。");
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function switchTab(next: Tab) {
    setTab(next);
    setNotice("");
    setError("");
    if (!overview || !currentLesson) return;
    try {
      if (next === "attendance") {
        const payload = await requestJson("/api/classroom/attendance?classId=" + encodeURIComponent(overview.course.id) + "&lessonId=" + encodeURIComponent(currentLesson.id));
        setAttendance(payload.entries);
      }
      if (next === "grades") {
        const payload = await requestJson("/api/classroom/grades?classId=" + encodeURIComponent(overview.course.id));
        setGrades(payload.rows);
        setGradeDrafts(Object.fromEntries(payload.rows.map((row: GradeRow) => [
          row.id,
          Object.fromEntries(gradeCategories.map((category) => [category.id, row.scores[category.id] === null ? "" : String(row.scores[category.id])])),
        ])));
      }
    } catch (tabError) {
      setError(tabError instanceof Error ? tabError.message : "无法读取数据。");
    }
  }

  async function logout() {
    await fetch("/api/classroom/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/teacher/login");
    router.refresh();
  }

  async function changeRequiredPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setNotice(""); setError("");
    try {
      await requestJson("/api/classroom/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordRequired(false);
      setCurrentPassword("");
      setNewPassword("");
      setNotice("新密码已保存。此后请使用新密码登录公网教师工作台。");
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "密码修改失败。");
    } finally { setPending(false); }
  }

  async function switchClass(classId: string) {
    setPending(true);
    setNotice("");
    setError("");
    setDraw(null);
    setAnswer(null);
    try {
      await loadOverview(classId);
      setTab("dashboard");
    } finally {
      setPending(false);
    }
  }

  async function createNewClass() {
    setPending(true);
    setNotice("");
    setError("");
    try {
      const payload = await requestJson("/api/classroom/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClass),
      });
      setOverview(payload.data);
      setLessonDraft(payload.data.course.currentLessonOrdinal);
      setNewClass((value) => ({ ...value, name: "" }));
      setNotice("新班级“" + payload.data.course.name + "”已建立，并自动复制12次课教学进度。");
    } catch (classError) {
      setError(classError instanceof Error ? classError.message : "新建班级失败。");
    } finally {
      setPending(false);
    }
  }

  async function saveTeachingProgress() {
    if (!overview) return;
    setPending(true);
    setNotice("");
    setError("");
    try {
      const payload = await requestJson("/api/classroom/classes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: overview.course.id, currentLessonOrdinal: lessonDraft }),
      });
      setOverview(payload.data);
      setNotice("“" + payload.data.course.name + "”的教学进度已调整到第" + lessonDraft + "次课。");
      setDraw(null);
      setAnswer(null);
    } catch (progressError) {
      setError(progressError instanceof Error ? progressError.message : "教学进度保存失败。");
    } finally {
      setPending(false);
    }
  }

  async function importStudents() {
    if (!file || !overview) {
      setError("请先选择.xlsx、.csv或.tsv名单文件。");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("classId", overview.course.id);
      const payload = await requestJson("/api/classroom/roster/import", { method: "POST", body: form });
      setNotice("名单导入完成：新建账号" + payload.created + "人，新增入班" + payload.enrolled + "人，更新资料" + payload.updated + "人，已存在未重复" + payload.unchanged + "人。");
      if (payload.credentialCsv) {
        const blob = new Blob([payload.credentialCsv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = payload.credentialFilename;
        link.click();
        URL.revokeObjectURL(url);
      }
      await loadOverview(overview.course.id);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "名单导入失败。");
    } finally {
      setPending(false);
    }
  }

  function impactText(preview: DeletionPreview) {
    return "将移除" + preview.studentCount + "名学生，并清理该班出勤" + preview.attendanceRecords + "条、课堂提问" + preview.questionRecords + "条、成绩" + preview.gradeRecords + "条、智能练习" + (preview.learningRecords || 0) + "条。" + (preview.accountsDisabled ? "其中" + preview.accountsDisabled + "个无其他班级的学生账号会被停用。" : "学生若仍在其他班级，账号会继续保留。");
  }

  async function removeRoster(studentUserIds?: string[], all = false) {
    if (!overview) return;
    setPending(true); setNotice(""); setError("");
    try {
      const base = { classId: overview.course.id, all, studentUserIds: all ? undefined : studentUserIds };
      const previewPayload = await requestJson("/api/classroom/roster", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...base, preview: true }) });
      const preview = previewPayload.preview as DeletionPreview;
      if (!preview.studentCount) { setNotice("当前没有可删除的学生。"); return; }
      if (all) {
        const typed = window.prompt(impactText(preview) + "\n\n这是不可撤销操作。请输入班级名称“" + overview.course.name + "”确认清空：", "");
        if (typed !== overview.course.name) { if (typed !== null) setError("班级名称输入不一致，已取消清空名单。"); return; }
      } else if (!window.confirm(impactText(preview) + "\n\n确定继续吗？")) return;
      const result = await requestJson("/api/classroom/roster", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...base, confirm: true }) });
      setSelectedStudentIds([]);
      setNotice("删除完成：已从“" + overview.course.name + "”移除" + result.data.removed + "名学生。");
      await loadOverview(overview.course.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除学生失败。");
    } finally { setPending(false); }
  }

  async function deleteCurrentClass() {
    if (!overview) return;
    if (overview.course.isSystemDefault) { setError("系统内置默认班级不能删除；可以使用“清空名单”移除其中学生。"); return; }
    setPending(true); setNotice(""); setError("");
    try {
      const previewPayload = await requestJson("/api/classroom/classes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId: overview.course.id, preview: true }) });
      const preview = previewPayload.preview as DeletionPreview;
      const typed = window.prompt("删除班级会同时删除" + (preview.lessonCount || 0) + "个课次、" + impactText(preview) + "\n\n请输入班级名称“" + overview.course.name + "”确认：", "");
      if (typed !== overview.course.name) { if (typed !== null) setError("班级名称输入不一致，已取消删除班级。"); return; }
      const result = await requestJson("/api/classroom/classes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId: overview.course.id, confirm: true }) });
      await loadOverview(result.data.nextClassId);
      setTab("roster");
      setNotice("班级“" + overview.course.name + "”及其关联数据已删除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除班级失败。");
    } finally { setPending(false); }
  }

  function toggleStudent(studentId: string, checked: boolean) {
    setSelectedStudentIds((ids) => checked ? [...new Set([...ids, studentId])] : ids.filter((id) => id !== studentId));
  }

  function toggleAllStudents(checked: boolean) {
    setSelectedStudentIds(checked ? overview?.students.map((student) => student.id) || [] : []);
  }

  async function saveAttendanceRecords() {
    if (!overview || !currentLesson || pending) return;
    if (useLiteQuestions) launchClassroom();
    setPending(true);
    try {
      const payload = await requestJson("/api/classroom/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: overview.course.id, lessonId: currentLesson.id, entries: attendance }),
      });
      setAttendance(payload.entries);
      setNotice("第" + currentLesson.ordinal + "次课点名记录已保存。");
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "点名保存失败。");
    } finally {
      setPending(false);
    }
  }

  async function drawQuestion(kind?: "terminology" | "syntax" | "concept") {
    if (!overview || !currentLesson || pending) return;
    if (useLiteQuestions) launchClassroom();
    setPending(true);
    setAnswer(null);
    setScore(null);
    setNotice("");
    try {
      const payload = await requestJson("/api/classroom/cold-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draw", classId: overview.course.id, lessonId: currentLesson.id, kind }),
      });
      setDraw(payload.data);
      if (useLiteQuestions && payload.data.broadcast) {setAvatarQuestion(payload.data.broadcast);setAvatarOpen(true);}
      const syncNotice = `已点名${payload.data.student.name}，题目已生成；启用LiteAvatar时将在连接就绪后语音点名提问。`;
      setNotice(payload.data.attendanceSaved
        ? syncNotice
        : `提示：本次点名尚未保存，系统暂按全班已到抽取。${syncNotice}`);
      setError("");
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : "无法随机抽取。");
    } finally {
      setPending(false);
    }
  }

  async function revealAnswer() {
    if (!draw) return;
    try {
      const payload = await requestJson("/api/classroom/cold-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal", questionId: draw.question.id }),
      });
      setAnswer(payload.answer);
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : "无法显示参考答案。");
    }
  }

  async function recordScore() {
    if (!overview || !currentLesson || !draw || score === null) return;
    setPending(true);
    try {
      await requestJson("/api/classroom/cold-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "score", classId: overview.course.id, lessonId: currentLesson.id, studentUserId: draw.student.id, questionId: draw.question.id, score }),
      });
      setNotice(draw.student.name + "的课堂提问成绩" + score + "/10已记入学生档案。");
      setDraw(null);
      setAnswer(null);
      setScore(null);
      await loadOverview(overview.course.id);
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : "课堂成绩保存失败。");
    } finally {
      setPending(false);
    }
  }

  async function saveGradeRow(studentId: string) {
    if (!overview) return;
    setPending(true);
    try {
      for (const category of gradeCategories) {
        const value = gradeDrafts[studentId]?.[category.id] || "";
        if (value === "") continue;
        await requestJson("/api/classroom/grades", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: overview.course.id, studentUserId: studentId, category: category.id, rawScore: Number(value) }),
        });
      }
      const payload = await requestJson("/api/classroom/grades?classId=" + encodeURIComponent(overview.course.id));
      setGrades(payload.rows);
      setNotice("该生课程成绩已按2025版大纲重新计算。");
    } catch (gradeError) {
      setError(gradeError instanceof Error ? gradeError.message : "成绩保存失败。");
    } finally {
      setPending(false);
    }
  }

  if (passwordRequired) {
    return (
      <main className={styles.shell}>
        <section className={styles.passwordPanel}>
          <small>FIRST PUBLIC LOGIN SECURITY · VERSION 21</small>
          <h2>首次公网登录必须修改教师密码</h2>
          <p>初始密码仅用于第一次登录。新密码至少10位，并同时包含英文字母和数字。</p>
          {error ? <div className={styles.error} style={{ marginBottom: 10 }}>{error}</div> : null}
          <form onSubmit={changeRequiredPassword}>
            <input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} placeholder="当前初始密码" required type="password" value={currentPassword} />
            <input autoComplete="new-password" minLength={10} onChange={(event) => setNewPassword(event.target.value)} placeholder="新的教师密码" required type="password" value={newPassword} />
            <button className={styles.primary} disabled={pending}>{pending ? "正在保存……" : "保存新密码并进入教师工作台"}</button>
          </form>
        </section>
      </main>
    );
  }

  if (!overview) {
    return <main className={styles.shell}><div className={styles.passwordPanel}><h2>正在加载第8A步班级系统……</h2>{error ? <div className={styles.error}>{error}</div> : null}</div></main>;
  }

  const presentCount = attendance.filter((row) => row.status === "present").length;

  return (
    <main className="app-shell teacher-theme v172-production-shell v21-console">
      <aside className="sidebar">
        <Link className="brand-lockup" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="测绘专业外语平台标志" src="/v16/brand-logo.svg" />
          <div><strong>测绘专业外语</strong><span>Geo Mission · VERSION 21</span></div>
        </Link>
        <div className="class-selector">
          <span>当前班级 · 共{overview.classes.length}个</span>
          <select disabled={pending} onChange={(event) => void switchClass(event.target.value)} value={overview.course.id}>
            {overview.classes.map((course) => <option key={course.id} value={course.id}>{course.name}（{course.studentCount}人）</option>)}
          </select>
          <small>{overview.course.term}</small>
        </div>
        <Link className="v172-top-link" href="/teacher/security">安全审核与投诉处理 ↗</Link><Link className="v172-top-link" href="/teacher/liteavatar">LiteAvatar 数字教师 · 一键启动 ↗</Link><nav aria-label="教师端导航">{tabs.map((item) => <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => void switchTab(item.id)}><item.Icon size={21} weight={tab === item.id ? "fill" : "regular"} /><span>{item.label}</span></button>)}</nav>
        <div className="v172-kb-card"><span>课程知识库 <b>ONLINE</b></span><div><span>813 内置知识块</span><span>教师资料增量存储</span></div></div>
        <div className="sidebar-motto"><GraduationCap size={24} /><span>以地理之眼<br />读世界之文</span></div>
        <div className="sidebar-footer"><span className="profile-badge">{teacherName.slice(-1)}</span><div><strong>{teacherName}</strong><small>课程教师 · 管理员</small></div><button className="v172-logout" onClick={() => void logout()}>退出</button></div>
      </aside>
      <section className="app-main">
        <header className="topbar"><div className="top-title"><strong>智能实训 · {tabs.find((item) => item.id === tab)?.label}</strong><span>发布任务 · 观察作答 · 同屏讲评 · 保存成绩</span></div><div className="top-actions"><MotionSwitch /><Link className="role-switch" href="/teacher/liteavatar">LiteAvatar 启动与配置</Link><a className="role-switch" href="liteavatar217://start/public">打开 LiteAvatar ↗</a><Link className="v172-top-link" href="/digital-teacher">数字教师对话</Link><Link className="role-switch" href="/digital-teacher"><Robot size={17} />开启AI数字教师</Link><Link className="v172-top-link" href="/student/login"><GraduationCap size={17} />学生端</Link><span className="profile-badge">{teacherName.slice(-1)}</span><div className="profile-copy"><strong>{teacherName}</strong><span>课程教师</span></div></div></header>
        <section className="v21-banner"><div><small>TEACHING STUDIO / 21</small><h2>让每次学习留下可用的证据</h2><p>{overview.course.name} · 当前班级 {overview.students.length} 位学生 · 共 {overview.classes.length} 个教学班</p></div><div><button onClick={()=>void switchTab("workstations")}>进入六大学习工作台 →</button><button onClick={()=>void switchTab("scenarios")}>准备情境任务</button></div></section>
        <div className={tab === "dashboard" ? "" : "v172-legacy-content"}>
          {notice ? <div className={styles.notice} style={{ marginBottom: 13 }}>{notice}</div> : null}
          {error ? <div className={styles.error} style={{ marginBottom: 13 }}>{error}</div> : null}

          {tab === "dashboard" ? <TeacherCommandCenterV172 classId={overview.course.id} courseName={overview.course.name} currentLessonTitle={currentLesson?.title || "课程尚未开始"} onNavigate={(destination) => void switchTab(destination)} onOpenAvatar={() => setAvatarOpen(true)} studentCount={overview.students.length} teacherName={teacherName} /> : null}

          {tab === "messages" ? <TeacherMessages key={overview.course.id} classId={overview.course.id}/> : null}
          {tab === "workstations" ? <TeacherStations key={overview.course.id} classId={overview.course.id}/> : null}
          {tab === "scenarios" ? <ScenarioPanel key={overview.course.id} role="teacher" classId={overview.course.id} classes={overview.classes}/> : null}
          {tab === "roster" ? (
            <>
              <section className={styles.heading}><div><small>CLASS & ROSTER</small><h1>班级与学生账号</h1><p>导入名单后生成一次性临时密码；已有学号只更新姓名，不重置密码。</p></div></section>
              <section className={styles.manageGrid}>
                <article className={styles.panel}>
                  <header className={styles.panelHeader}><div><span>MULTI-CLASS</span><h3>新建班级</h3></div><em>自动套用12次课大纲</em></header>
                  <div className={styles.formGrid}>
                    <label><span>班级名称</span><input maxLength={60} onChange={(event) => setNewClass((value) => ({ ...value, name: event.target.value }))} placeholder="例如：测绘2402" value={newClass.name} /></label>
                    <label><span>课程代码</span><input maxLength={30} onChange={(event) => setNewClass((value) => ({ ...value, courseCode: event.target.value }))} value={newClass.courseCode} /></label>
                    <label className={styles.wideField}><span>学期</span><input maxLength={60} onChange={(event) => setNewClass((value) => ({ ...value, term: event.target.value }))} value={newClass.term} /></label>
                    <button className={styles.primary} disabled={pending || !newClass.name.trim()} onClick={() => void createNewClass()}>建立班级</button>
                  </div>
                </article>
                <article className={styles.panel}>
                  <header className={styles.panelHeader}><div><span>COURSE PROGRESS</span><h3>当前教学进度</h3></div><em>{overview.course.name}</em></header>
                  <div className={styles.progressEditor}>
                    <label><span>选择正在进行的课次</span><select onChange={(event) => setLessonDraft(Number(event.target.value))} value={lessonDraft}>{overview.lessons.map((lesson) => <option key={lesson.id} value={lesson.ordinal}>第{lesson.ordinal}次课 · {lesson.title}</option>)}</select></label>
                    <p>随机提问会自动读取所选课次的上一节课范围；第2—12次课所调用的上一课题库均为10题，包含专业词汇翻译、短语用法和句式翻译。</p>
                    <button className={styles.secondary} disabled={pending || lessonDraft === overview.course.currentLessonOrdinal} onClick={() => void saveTeachingProgress()}>保存教学进度</button>
                  </div>
                </article>
              </section>
              <section className={styles.panel}><div className={styles.upload}><i>XLSX</i><div><b>导入学生名单</b><span>必填列：学号、姓名；可选列：班级。支持.xlsx、.csv、.tsv，最多500人。</span></div><input accept=".xlsx,.csv,.tsv" onChange={(event) => setFile(event.target.files?.[0] || null)} type="file" /><button className={styles.primary} disabled={pending} onClick={() => void importStudents()}>{pending ? "正在导入……" : "导入并生成账号"}</button></div></section>
              <section className={styles.panel} style={{ marginTop: 14 }}>
                <header className={styles.panelHeader}>
                  <div><span>STUDENT ROSTER</span><h3>{overview.course.name}</h3></div>
                  <div className={styles.panelHeaderActions}>
                    <em>{overview.students.length}名学生</em>
                    <button className={styles.dangerGhost} disabled={pending || !overview.students.length} onClick={() => void removeRoster(undefined, true)}>清空名单</button>
                    <button className={styles.danger} disabled={pending || overview.course.isSystemDefault} onClick={() => void deleteCurrentClass()} title={overview.course.isSystemDefault ? "系统默认班级不能删除" : "删除当前班级及其关联数据"}>删除班级</button>
                  </div>
                </header>
                {overview.students.length ? (
                  <>
                    <div className={styles.rosterToolbar}>
                      <span className={styles.selectionCount}>已选择 <b>{selectedStudentIds.length}</b> 人</span>
                      <button className={styles.dangerGhost} disabled={pending || !selectedStudentIds.length} onClick={() => void removeRoster(selectedStudentIds)}>批量删除所选学生</button>
                      {selectedStudentIds.length ? <button className={styles.secondary} onClick={() => setSelectedStudentIds([])}>取消选择</button> : null}
                      <span className={styles.rosterHint}>删除前会预览并提示关联的出勤、提问和成绩记录。</span>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead><tr><th className={styles.checkboxCell}><input aria-label="选择全部学生" checked={selectedStudentIds.length === overview.students.length && overview.students.length > 0} onChange={(event) => toggleAllStudents(event.target.checked)} type="checkbox" /></th><th>序号</th><th>学生</th><th>学号</th><th>历史出勤率</th><th>课堂提问均分</th><th>操作</th></tr></thead>
                        <tbody>{overview.students.map((student, index) => <tr key={student.id}><td className={styles.checkboxCell}><input aria-label={"选择" + student.name} checked={selectedStudentIds.includes(student.id)} onChange={(event) => toggleStudent(student.id, event.target.checked)} type="checkbox" /></td><td>{String(index + 1).padStart(2, "0")}</td><td><div className={styles.studentCell}><i>{studentInitial(student.name)}</i><b>{student.name}</b></div></td><td>{student.studentNo}</td><td>{student.attendanceRate}%</td><td>{student.questionScore ? student.questionScore.toFixed(1) : "—"}</td><td><button className={styles.rowDelete} disabled={pending} onClick={() => void removeRoster([student.id])}>删除</button></td></tr>)}</tbody>
                      </table>
                    </div>
                  </>
                ) : <div className={styles.empty}><b>尚未导入学生名单</b><p>请使用上方名单导入功能建立学号密码账号。</p></div>}
              </section>
            </>
          ) : null}

          {tab === "attendance" && currentLesson ? (
            <>
              <TeacherCheckin key={overview.course.id} classId={overview.course.id} lessonId={currentLesson.id} onReviewed={()=>void switchTab("attendance")} />
              <details><summary style={{cursor:"pointer",padding:12}}>原有手工点名（保存会覆盖本课出勤，请确认后操作）</summary>
              <section className={styles.heading}><div><small>SMART ATTENDANCE</small><h1>第{currentLesson.ordinal}次课 · 课堂点名</h1><p>{currentLesson.title} · {currentLesson.unitRange}</p></div><div><button className={styles.secondary} onClick={() => setAttendance((rows) => rows.map((row) => ({ ...row, status: "present" })))}>全部标为已到</button> <button className={styles.primary} disabled={pending} onClick={() => void saveAttendanceRecords()}>保存本次点名</button></div></section>
              <section className={styles.grid4}><article className={styles.metric}><span>正常</span><b>{presentCount}</b><em>已到</em></article>{(["late", "leave", "absent"] as const).map((status) => <article className={styles.metric} key={status}><span>{statusLabels[status]}</span><b>{attendance.filter((row) => row.status === status).length}</b><em>教师可修改</em></article>)}</section>
              <section className={styles.panel} style={{ marginTop: 14 }}>{attendance.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>学生</th><th>学号</th><th>本次状态</th><th>备注</th></tr></thead><tbody>{attendance.map((row) => <tr key={row.studentUserId}><td><div className={styles.studentCell}><i>{studentInitial(row.name)}</i><b>{row.name}</b></div></td><td>{row.studentNo}</td><td><div className={styles.statusButtons}>{(Object.keys(statusLabels) as Array<keyof typeof statusLabels>).map((status) => <button className={row.status === status ? styles[status] : ""} key={status} onClick={() => setAttendance((rows) => rows.map((item) => item.studentUserId === row.studentUserId ? { ...item, status } : item))}>{statusLabels[status]}</button>)}</div></td><td><input className={styles.gradeInput} maxLength={200} onChange={(event) => setAttendance((rows) => rows.map((item) => item.studentUserId === row.studentUserId ? { ...item, note: event.target.value } : item))} style={{ width: 170 }} value={row.note} /></td></tr>)}</tbody></table></div> : <div className={styles.empty}><b>本班尚无学生</b><p>请先在“班级与课次”中导入名单。</p></div>}</section>
              </details>
            </>
          ) : null}

          {tab === "questions" && currentLesson ? (
            <>
              <section className={styles.heading}><div><small>AI COLD CALL</small><h1>上一节课随机提问</h1><p>范围自动锁定：第{previousLesson?.ordinal}次课 {previousLesson?.title}（{previousLesson?.unitRange}）。</p></div><div><button className={styles.secondary} onClick={() => void drawQuestion("terminology")}>专业词汇翻译</button> <button className={styles.secondary} onClick={() => void drawQuestion("syntax")}>短语用法</button> <button className={styles.secondary} onClick={() => void drawQuestion("concept")}>句式翻译</button> <button className={styles.primary} disabled={pending} onClick={() => void drawQuestion()}>随机抽取</button></div></section>
              <label><input type="checkbox" checked={useLiteQuestions} onChange={e=>setUseLiteQuestions(e.target.checked)}/> 使用LiteAvatar语音点名、提问与纠错（学生向教师电脑麦克风回答）</label>
              {draw ? <section className={styles.questionStage}><article className={styles.studentDraw}><span>RANDOM STUDENT</span><div className={styles.avatar}>{studentInitial(draw.student.name)}</div><h2>{draw.student.name}</h2><p>{draw.student.studentNo} · 历史提问{draw.student.priorQuestionCount}次</p><button className={styles.secondary} onClick={() => void drawQuestion()}>↻ 重新随机抽取</button></article><article className={styles.questionCard}><header className={styles.questionTop}><span>{draw.question.kind === "terminology" ? "专业词汇翻译" : draw.question.kind === "syntax" ? "短语用法" : "句式翻译"}</span><em>{draw.broadcast ? "已同步给全屏AI数字教师" : "上一课范围已锁定"}</em></header><div className={styles.questionBody}><small>QUESTION</small><h2>{draw.question.prompt}</h2><p>{draw.question.source}</p></div>{answer ? <div className={styles.answer}><span>参考答案</span><p>{answer.answer}</p><div className={styles.rubric}><b>评分建议：</b>{answer.rubric}</div><div className={styles.scoreRow}><span>教师确认得分</span>{[6, 7, 8, 9, 10].map((value) => <button className={score === value ? styles.selected : ""} key={value} onClick={() => setScore(value)}>{value}</button>)}<button className={styles.primary} disabled={score === null || pending} onClick={() => void recordScore()}>记入学生档案</button></div></div> : <footer className={styles.questionActions}><button className={styles.secondary} onClick={() => void drawQuestion()}>换一道题</button><button className={styles.primary} onClick={() => void revealAnswer()}>显示参考答案</button></footer>}</article></section> : <section className={styles.panel}><div className={styles.empty}><b>{overview.students.length ? "点击上方按钮开始随机提问" : "请先导入学生名单"}</b><p>系统优先抽取已到且本学期提问次数较少的学生。</p></div></section>}
            </>
          ) : null}

          {tab === "smart" ? (
            <>
              <section className={styles.heading}><div><small>SMART PRACTICE · STEP 10.1</small><h1>真实职业材料与全量划线句五层讲解</h1><p>保留原5—7项完整训练和{SMART_CONTENT_TOTALS.translationComparisons}条教师精选重点句，并新增教材相关{ENRICHMENT_TOTALS.textbookUnits}个Unit中的{ENRICHMENT_TOTALS.textbookUnderlines}条/组Word原始划线内容。</p></div><label className={styles.lessonPicker}><span>预览课次</span><select value={smartLessonOrdinal} onChange={(event) => setSmartLessonOrdinal(Number(event.target.value))}>{SMART_LEARNING_MODULES.map((item) => <option key={item.lessonOrdinal} value={item.lessonOrdinal}>第{item.lessonOrdinal}课 · {item.lessonTitle}</option>)}</select></label></section>
              <section className={styles.grid4}>
                <article className={styles.metric}><span>本课官方材料</span><b>{smartMaterials.length}</b><em>来源＋短摘录＋职业阅读任务</em></article>
                <article className={styles.metric}><span>本课职业任务</span><b>{smartLesson.careerTasks.length}</b><em>角色与真实工作情境</em></article>
                <article className={styles.metric}><span>本课五层讲解</span><b>{smartHighlights.length}</b><em>教材划线{smartHighlightCoverage.textbookUnderlines}＋精选{smartHighlightCoverage.teacherCurated}</em></article>
                <article className={styles.metric}><span>本课跟读</span><b>{smartLesson.listening.length}</b><em>{smartLesson.unitRange}</em></article>
              </section>
              <section className={styles.smartPanel}>
                <header className={styles.smartPanelHeader}><div><span>02 · AUTHENTIC PROFESSIONAL MATERIALS</span><h2>官方真实职业材料</h2><p>与第6项模拟职业任务分开：这里直接使用官方/行业一手资料短摘录，并保留原文入口。</p></div><Link className={styles.primary} href="/student/smart-learning">打开学生端预览</Link></header>
                <div className={styles.authenticGrid}>{smartMaterials.map((item) => <article className={styles.authenticCard} key={item.id}><div className={styles.authenticMeta}><span>{item.materialType}</span><b>{item.publisher}</b></div><h3>{item.title}</h3><p className={styles.sourceTitle}>{item.sourceTitle}</p><blockquote>{item.excerpt}</blockquote><p><b>阅读任务：</b>{item.task}</p><a className={styles.officialLink} href={item.sourceUrl} target="_blank" rel="noreferrer">核对官方原文 ↗</a></article>)}</div>
              </section>
              <section className={styles.smartPanel}>
                <header className={styles.smartPanelHeader}><div><span>05 · LISTENING & SPEAKING</span><h2>专业听说与跟读</h2><p>学生可使用正常语速、教学慢速和麦克风识别练习。</p></div><Link className={styles.primary} href="/student/smart-learning">打开学生端预览</Link></header>
                <div className={styles.comparisonGrid} style={{ padding: 18 }}>{smartLesson.listening.map((item) => <article key={item.id}><span>{item.difficulty} · {item.title}</span><p><b>{item.sentence}</b></p><p>{item.translation}</p><div className={styles.badgeRow}>{item.keywords.map((word) => <span key={word}>{word}</span>)}</div></article>)}</div>
              </section>
              <section className={styles.smartPanel}>
                <header className={styles.smartPanelHeader}><div><span>06 · AUTHENTIC CAREER TASKS</span><h2>真实测绘职业任务</h2><p>任务包含职业角色、现场情境、必须术语、表达支架和评价清单。</p></div></header>
                <div className={styles.comparisonGrid} style={{ padding: 18 }}>{smartLesson.careerTasks.map((item) => <article key={item.id}><span>{item.outputMode} · {item.title}</span><p><b>角色：</b>{item.role}</p><p><b>情境：</b>{item.situation}</p><p><b>任务：</b>{item.task}</p><div className={styles.badgeRow}>{item.requiredTerms.map((word) => <span key={word}>{word}</span>)}</div></article>)}</div>
              </section>
              <section className={styles.smartPanel}>
                <header className={styles.smartPanelHeader}><div><span>07 + 11 · FIVE-LAYER SENTENCE TEACHING · FULL UNDERLINE COVERAGE</span><h2>教材全部划线句纳入重点句库</h2><p>本课显示{smartHighlights.length}条/组：教材Word原始划线{smartHighlightCoverage.textbookUnderlines}条/组，另保留教师精选{smartHighlightCoverage.teacherCurated}条。每条均保留原文、教材译文、术语、句法、专业直译和专业原理。</p></div></header>
                <div className={styles.translationWorkspace}>{smartHighlights.map((item) => { const detail = getFiveLayerDetail(item.id); return <div className={styles.fiveLayerGrid} key={item.id}><article className={`${styles.layerCard} ${styles.layerWide}`}><div className={styles.layerHeading}><b>01</b><span>{item.origin === "textbook-underline" ? `教材原始划线 · Unit ${item.textbookUnit}` : "教师精选"} · {item.title}</span></div><p>{item.original}</p><p className={styles.sourceTitle}>{item.source}</p></article><article className={styles.layerCard}><div className={styles.layerHeading}><b>02</b><span>专业词汇</span></div><ul>{item.termNotes.map((note) => <li key={note}>{note}</li>)}</ul></article><article className={styles.layerCard}><div className={styles.layerHeading}><b>03</b><span>句法结构</span></div><ul>{item.sentencePattern.map((line) => <li key={line}>{line}</li>)}</ul></article><article className={`${styles.layerCard} ${styles.layerWide}`}><div className={styles.layerHeading}><b>04</b><span>三种译文</span></div><div className={styles.translationTrio}><div><span>教材译文</span><p>{item.textbookTranslation}</p></div><div><span>专业直译</span><p>{detail?.professionalLiteralTranslation}</p></div><div className={styles.standardCard}><span>现代汉语意译</span><p>{item.standardTranslation}</p></div></div></article><article className={`${styles.layerCard} ${styles.layerWide} ${styles.principleCard}`}><div className={styles.layerHeading}><b>05</b><span>专业原理</span></div><p>{detail?.professionalExplanation}</p></article></div>; })}</div>
              </section>
            </>
          ) : null}

          {tab === "presentation" ? <TeacherPresentationPanel teacherName={teacherName} /> : null}

          {tab === "terrain" ? <Terrain3dLab classId={overview.course.id} role="teacher" userName={teacherName} /> : null}

          {tab === "knowledge" ? <TeacherKnowledgePanel /> : null}

          {tab === "smart" ? <TeacherAssignmentPanel classId={overview.course.id} /> : null}
          {tab === "assignments" ? <><a href="/teacher/evidence" className={styles.secondary}>延迟复测与教学改进台账</a><ChapterTests role="teacher" classId={overview.course.id} /><TeacherAssignmentPanel classId={overview.course.id} /><LoopPanel key={overview.course.id} role="teacher" classId={overview.course.id}/></> : null}

          {tab === "cloud" ? <CloudSettingsPanel /> : null}

          {tab === "grades" ? (
            <>
              <section className={styles.heading}><div><small>GRADEBOOK</small><h1>课程成绩册</h1><p>严格按2025版大纲：课后作业10%＋专题研讨20%＋文献检索与软件操作20%＋开放式大作业50%。</p></div></section>
              <button className={styles.secondary} disabled={pending} onClick={()=>void switchTab("grades")}>刷新自动成绩</button><a href="/teacher/evidence" className={styles.secondary}>延迟复测 · 三个班全量证据与教学改进台账</a><GradeHistory classId={overview.course.id}/><LoopPanel key={overview.course.id} role="teacher" classId={overview.course.id}/><section className={styles.panel}>{grades.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>学生</th>{gradeCategories.map((category) => <th key={category.id}>{category.label}<br />{category.weight}%</th>)}<th>总评</th><th>操作</th></tr></thead><tbody>{grades.map((row) => <tr key={row.id}><td><div className={styles.studentCell}><i>{studentInitial(row.name)}</i><span><b>{row.name}</b><em>{row.studentNo}</em></span></div></td>{gradeCategories.map((category) => <td key={category.id}><input className={styles.gradeInput} max={100} min={0} onChange={(event) => setGradeDrafts((drafts) => ({ ...drafts, [row.id]: { ...drafts[row.id], [category.id]: event.target.value } }))} step="0.1" type="number" value={gradeDrafts[row.id]?.[category.id] || ""} /></td>)}<td><b>{row.total.toFixed(1)}</b></td><td><button className={styles.secondary} disabled={pending} onClick={() => void saveGradeRow(row.id)}>保存本行</button></td></tr>)}</tbody></table></div> : <div className={styles.empty}><b>尚无成绩数据</b><p>导入学生后即可建立成绩册。</p></div>}</section>
            </>
          ) : null}
        </div>
      </section>
      <FullscreenLocalDigitalTeacher
        key={`${avatarQuestion?.id}-${avatarOpen}`}
        preferredProvider={avatarQuestion ? "lite" : undefined}
        coldCallRequest={avatarQuestion}
        mode="auto"
        onClose={() => {setAvatarOpen(false);setAvatarQuestion(null);}}
        onFallbackVoice={() => {setAvatarOpen(false);setAvatarQuestion(null);}}
        open={avatarOpen}
      />
      <BarrageLiveDisplay classId={overview.course.id} />
    </main>
  );
}
