"use client";

import { useEffect, useMemo, useState } from "react";
import TerrainMap, { type TerrainPoint } from "./terrain-map";
import { randomTask } from "@/lib/step19/task-drafts";
import styles from "./terrain-lab.module.css";

import { SCENES, SCENE_KEYS, safeLocation, type LocationKey } from "@/lib/step18/scenes";
function SceneOptions(){ return <>{SCENE_KEYS.map(key=><option key={key} value={key}>{SCENES[key].name}</option>)}</>; }
type Task = { id: string; classId: string; locationKey: LocationKey; title: string; instructions: string; status: string; updatedAt: string };
type Submission = { id: string; taskId: string; studentUserId: string; studentNo: string; studentName: string; route: TerrainPoint[]; rationale: string; score: number | null; feedback: string; submittedAt: string };

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "服务器处理失败。");
  return payload;
}

export default function Terrain3dLab({ role, classId, userName, embedded = false }: { role: "teacher" | "student"; classId?: string; userName: string; embedded?: boolean }) {
  const teacher = role === "teacher";
  const [explore, setExplore] = useState(false);
  const [exploreLocation, setExploreLocation] = useState<LocationKey>("taihang");
  const [refresh, setRefresh] = useState(0);
  const [task, setTask] = useState<Task | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [route, setRoute] = useState<TerrainPoint[]>([]);
  const [rationale, setRationale] = useState("");
  const [locationKey, setLocationKey] = useState<LocationKey>("taihang");
  const [title, setTitle] = useState("判读太行山地形并规划测量路线");
  const [instructions, setInstructions] = useState("请在三维地形中规划一条安全测量路线，至少设置两个节点，并用不少于30字的英文说明坡度、山脊、河谷或火山地貌判断依据。");
  const [selectedId, setSelectedId] = useState("");
  const [score, setScore] = useState("90");
  const [feedback, setFeedback] = useState("路线能够避开主要陡坡区；请补充等高距或坡度变化的英文依据。");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(() => submissions.find((item) => item.id === selectedId) || submissions[0] || null, [selectedId, submissions]);
  const comparisonRoutes = useMemo(() => submissions.map((item) => item.route).filter((item) => item.length > 1), [submissions]);

  useEffect(() => {
    let active = true;
    const url = teacher ? `/api/training/terrain?classId=${encodeURIComponent(classId || "")}` : "/api/training/terrain";
    requestJson(url).then((payload) => {
      if (!active) return;
      setTask(payload.task || null);
      if (teacher) {
        setSubmissions(payload.submissions || []);
        setSelectedId(payload.submissions?.[0]?.id || "");
        const first = payload.submissions?.[0];
        if (first) {
          setScore(first.score === null ? "90" : String(first.score));
          setFeedback(first.feedback || "路线能够避开主要陡坡区；请补充等高距或坡度变化的英文依据。");
        }
      } else {
        setSubmission(payload.submission || null);
        setRoute(payload.submission?.route || []);
        setRationale(payload.submission?.rationale || "");
      }
      if (payload.task) { setLocationKey(safeLocation(payload.task.locationKey)); if(teacher){setTitle(payload.task.title);setInstructions(payload.task.instructions);} }
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "无法读取3D地形实训。");
    });
    return () => { active = false; };
  }, [classId, teacher, refresh]);

  async function publish() {
    if (!classId) { setError("班级参数缺失。"); return; }
    setPending(true); setError(""); setNotice("");
    try {
      const payload = await requestJson("/api/training/terrain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, locationKey, title, instructions }),
      });
      setTask(payload.task); setSubmissions(payload.submissions || []); setSelectedId("");
      setNotice("3D地形任务已发布；该班学生点击刷新课堂任务即可读取。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "发布失败。"); }
    finally { setPending(false); }
  }

  async function submit() {
    if (!task) { setError("教师尚未发布3D地形任务。"); return; }
    setPending(true); setError(""); setNotice("");
    try {
      const payload = await requestJson("/api/training/terrain", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, route, rationale }),
      });
      setSubmission(payload.submission); setRoute(payload.submission?.route || route);
      setNotice(payload.gradingError ? "路线已保存，自动初评暂不可用，等待教师批改。" : "路线已保存，AI初评结果可供教师复核。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "提交失败。"); }
    finally { setPending(false); }
  }

  async function grade() {
    if (!selected) { setError("请先选择一份学生提交。"); return; }
    setPending(true); setError(""); setNotice("");
    try {
      const payload = await requestJson("/api/training/terrain", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: selected.id, score: Number(score), feedback }),
      });
      setTask(payload.task); setSubmissions(payload.submissions || []);
      setNotice(`已保存${selected.studentName || selected.studentNo}的地形实训成绩与反馈。`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "成绩保存失败。"); }
    finally { setPending(false); }
  }

  function selectSubmission(item: Submission) {
    setSelectedId(item.id);
    setScore(item.score === null ? "90" : String(item.score));
    setFeedback(item.feedback || "路线能够避开主要陡坡区；请补充等高距或坡度变化的英文依据。");
  }

  if (!teacher && (!task || explore)) {
    return <section className="v18-explorer"><div className="v18-explorer-bar"><div><small>OPEN EXPLORATION</small><h2>地形与城市 · 三维探索</h2><p>自由探索不计成绩；课堂任务以教师实际发布为准。</p></div><label>选择场景<select value={exploreLocation} onChange={e=>setExploreLocation(e.target.value as LocationKey)}><SceneOptions/></select></label><button onClick={()=>{setExplore(false);setRefresh(x=>x+1);}}>刷新课堂任务</button></div>{error?<p role="alert">{error}</p>:null}<TerrainMap locationKey={exploreLocation} editable={false} route={[]}/></section>;
  }

  const shownLocation = teacher ? locationKey : safeLocation(task?.locationKey);
  const matchingTask = !task || shownLocation === safeLocation(task.locationKey);
  return <section className={`${styles.lab} ${teacher ? styles.teacher : styles.student} ${embedded ? "v172-embedded-terrain" : ""}`}>
    {!embedded ? <header className={styles.heading}><div><small>VERSION 21 · 3D TERRAIN TRAINING</small><h1>{teacher ? "3D地形实训指挥台" : task?.title}</h1><p>{teacher ? "教师发布任务、实时查看全班路线并保存个人讲评。" : `${userName} · ${task?.instructions}`}</p></div><div className={styles.status}><i /><span><b>{task ? "任务已发布" : "任务草稿"}</b><small>{teacher ? `${submissions.length}份已提交` : submission ? "已提交，可再次修改" : "等待提交"}</small></span></div></header> : null}
    <div className="v18-task-tools"><button onClick={()=>{if(teacher||window.confirm("刷新会重新读取已提交路线，是否继续？"))setRefresh(x=>x+1);}}>刷新课堂任务与提交</button>{!teacher?<button onClick={()=>setExplore(true)}>自由探索其他场景</button>:null}{teacher&&!matchingTask?<span>正在预览新场景；点击发布后才会变更课堂任务。</span>:null}</div>
    {notice ? <div className={styles.notice}>{notice}</div> : null}
    {error ? <div className={styles.error}>{error}</div> : null}
    {teacher ? <div className={`${styles.teacherGrid} v172-terrain-grid`}>
      <aside className={`${styles.composer} v172-terrain-composer`}><span>任务设置</span><button type="button" onClick={()=>{const draft=randomTask("terrain");setTitle(draft.title);setInstructions(draft.instructions);}}>随机抽取实训题</button><label>场景<select value={locationKey} onChange={(event) => setLocationKey(event.target.value as LocationKey)}><SceneOptions/></select></label><label>任务标题<input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>任务要求<textarea maxLength={2000} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label><button disabled={pending} onClick={() => void publish()}>{pending ? "正在发布……" : task ? "发布新任务并结束旧任务" : "发布到学生端"}</button><p>新任务发布后，旧任务自动关闭；已有成绩和提交记录继续保留在数据库中。</p></aside>
      <TerrainMap editable={false} locationKey={shownLocation} route={matchingTask ? selected?.route || [] : []} comparisonRoutes={matchingTask ? comparisonRoutes : []} />
      <aside className={`${styles.review} v172-terrain-review`}><span>学生提交</span>{submissions.length ? <><div className={styles.submissions}>{submissions.map((item) => <button className={selected?.id === item.id ? styles.selected : ""} key={item.id} onClick={() => selectSubmission(item)}><b>{item.studentName || item.studentNo}</b><small>{item.route.length}节点 · {item.score === null ? "待评分" : `${item.score}分`}</small></button>)}</div><p style={{whiteSpace:"pre-wrap"}}>{selected?.rationale}</p><label>分数（0—100）<input max="100" min="0" type="number" value={score} onChange={(event) => setScore(event.target.value)} /></label><label>教师反馈<textarea maxLength={2000} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label><button disabled={pending} onClick={() => void grade()}>保存成绩与讲评</button></> : <div className={styles.waiting}><b>等待学生提交</b><p>学生提交路线后，会在此处出现姓名、节点数和英文说明。</p></div>}</aside>
    </div> : <div className={`${styles.studentGrid} v172-terrain-grid`}>
      <TerrainMap editable locationKey={shownLocation} route={route} onRouteChange={setRoute} />
      <aside className={styles.task}><span>任务作答</span><h2>{task?.title}</h2><p>{task?.instructions}</p><div className={styles.steps}><b>1</b><span>拖动旋转三维地形，判断坡度与地貌。</span><b>2</b><span>先点击“绘制路线”，再依次点击设置节点。</span><b>3</b><span>用英文说明路线选择依据后提交。</span></div><label>英文路线说明<textarea maxLength={2000} placeholder="Describe the terrain, slope and route choice in English…" value={rationale} onChange={(event) => setRationale(event.target.value)} /></label><button disabled={pending} onClick={() => void submit()}>{pending ? "正在提交……" : submission ? "更新我的路线" : "提交给教师"}</button>{submission?.score !== null && submission?.score !== undefined ? <div className={styles.feedback}><b>{submission.score}分 · 评价结果（AI初评需教师复核）</b><p>{submission.feedback || "教师暂未填写文字反馈。"}</p></div> : null}</aside>
    </div>}
  </section>;
}
