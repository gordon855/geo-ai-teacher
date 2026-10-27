"use client";
import TeacherAssignmentPanel from "@/components/assignments/teacher-assignment-panel";
import StudentAssignmentPanel from "@/components/assignments/student-assignment-panel";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import {
  Airplay,
  ArrowRight,
  BookOpenText,
  Broadcast,
  Check,
  CheckCircle,
  Clock,
  FilePdf,
  Lightbulb,
  MapTrifold,
  PaperPlaneTilt,
  PresentationChart,
  Shuffle,
  Sparkle,
  SpeakerHigh,
  Target,
  Translate,
  X,
} from "@phosphor-icons/react";
import Terrain3dLab from "@/components/training/terrain-lab";

type TrainingModule = "terrain" | "literature" | "terms";
type ToastType = "success" | "warning" | "info";
type Toast = { message: string; type: ToastType } | null;
type TeacherDestination = "presentation" | "questions" | "smart" | "grades";

const glossary = [
  { en: "contour interval", zh: "等高距" },
  { en: "vertical accuracy", zh: "高程精度" },
  { en: "point cloud", zh: "点云" },
  { en: "geoprocessing extent", zh: "地理处理范围" },
  { en: "extract by mask", zh: "按掩膜提取" },
  { en: "feature class", zh: "要素类" },
];

function ModuleTabs({ active, onChange, dark = false }: {
  active: TrainingModule;
  onChange: (module: TrainingModule) => void;
  dark?: boolean;
}) {
  const tabs = [
    { id: "terrain" as const, title: "地形与城市3D", note: "三维判读与路线规划", Icon: MapTrifold },
    { id: "literature" as const, title: "文献精读", note: "英文文献 · 证据理解", Icon: FilePdf },
    { id: "terms" as const, title: "软件术语", note: "GIS术语 · 场景应用", Icon: PresentationChart },
  ];
  return <div className={`module-tabs ${dark ? "dark" : ""}`} role="tablist" aria-label="智能实训模块">
    {tabs.map(({ id, title, note, Icon }) => <button aria-selected={active === id} className={active === id ? "active" : ""} key={id} onClick={() => onChange(id)} role="tab"><Icon size={27} weight={active === id ? "duotone" : "regular"} /><span><strong>{title}</strong><small>{note}</small></span></button>)}
  </div>;
}

function ToastMessage({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.type}`} role="status"><CheckCircle size={22} weight="fill" /><span>{toast.message}</span><button aria-label="关闭提示" onClick={onClose}><X size={17} /></button></div>;
}

function FeedbackDrawer({ open, onClose, module }: { open: boolean; onClose: () => void; module: Exclude<TrainingModule, "terrain"> }) {
  if (!open) return null;
  const content = module === "literature"
    ? ["证据句定位准确", "vertical accuracy 译法规范", "建议补充方法部分的限制条件"]
    : ["5个核心术语全部正确", "操作顺序无误", "注意 geoprocessing extent 的语境译法"];
  return <div className="drawer-backdrop" onClick={onClose}><aside className="feedback-drawer" onClick={(event) => event.stopPropagation()}><header><div><span>学习自检提示</span><h3>实训自检清单</h3></div><button aria-label="关闭讲评" onClick={onClose}><X size={21} /></button></header><div className="score-orbit"><strong>自检</strong><span>学习核对 · 不计成绩</span></div><ul>{content.map((item, index) => <li key={item}><CheckCircle size={20} weight="fill" /><span><strong>{index === 2 ? "改进建议" : "请核对"}</strong>{item}</span></li>)}</ul><div className="teacher-note"><img alt="AI教师头像" src="/v16/ai-teacher.svg" /><p>本清单为学习提示，未自动评分。正式成绩以教师在课程档案中确认的结果为准。</p></div><button className="primary-action" onClick={onClose}>继续学习</button></aside></div>;
}

function LiveBar({ teacherName, courseName, submitted, total, onReview }: {
  teacherName: string;
  courseName: string;
  submitted: number;
  total?: number;
  onReview: () => void;
}) {
  return <section className="live-bar"><div className="live-identity"><span>LIVE</span><img alt="AI教师头像" src="/v16/ai-teacher.svg" /><div><strong>{teacherName}实时课堂</strong><small>在线讲评 · 随时提问</small></div></div><div className="live-event"><Broadcast size={24} /><div><strong>教师任务以实际发布为准</strong><small>{courseName}{typeof total === "number" ? ` · ${submitted}/${total} 已提交` : " · 查看课堂任务"}</small></div></div><button onClick={onReview}>查看学习记录 <ArrowRight size={17} /></button></section>;
}

function LiteraturePractice({ onToast }: { onToast: (message: string, type?: ToastType) => void }) {
  const [selectedSentence, setSelectedSentence] = useState(0);
  const [translation, setTranslation] = useState("机载LiDAR已成为高分辨率地形测绘的重要数据源，能够提供精细的空间细节和可靠的高程精度。");
  const [reviewOpen, setReviewOpen] = useState(false);
  const sentences = [
    "Airborne LiDAR has become a fundamental data source for high-resolution topographic mapping.",
    "The vertical accuracy of LiDAR-derived DTMs can reach 10–15 cm under optimal conditions.",
  ];
  function submit() {
    if (translation.trim().length < 20) { onToast("请先完成不少于20字的中文译文。", "warning"); return; }
    onToast("证据卡已完成；可进入完整智能实训保存正式学习记录。", "success");
    setReviewOpen(true);
  }
  return <><div className="literature-layout"><section className="paper-viewer"><header><FilePdf size={22} weight="duotone" /><div><strong>Airborne LiDAR for High-Resolution Topographic Mapping</strong><span>Remote Sensing Methods · 教师精选材料</span></div><b>5 / 18</b></header><article><h3>2.2 LiDAR Point Cloud Processing</h3><p>Raw point cloud data are processed through noise filtering, ground point classification, and digital terrain model generation.</p>{sentences.map((sentence, index) => <button className={selectedSentence === index ? "selected-sentence" : "sentence"} key={sentence} onClick={() => setSelectedSentence(index)}>{sentence}</button>)}<img alt="按高程着色的山地森林LiDAR点云" src="/v16/lidar-point-cloud.svg" /><small>Fig. 3. Educational LiDAR point-cloud visualization colored by elevation.</small></article></section><section className="evidence-notebook"><header><div><span>证据笔记</span><h2>原文对照与术语卡片</h2></div><button onClick={() => onToast("请复制选中句子，到AI教师问答中进行句法分析。", "info")}><Sparkle size={18} />AI辅助</button></header><div className="evidence-block"><span>选中段落 {selectedSentence + 1}</span><p>{sentences[selectedSentence]}</p></div><div className="term-chips">{glossary.slice(0, 3).map((item) => <button key={item.en} onClick={() => onToast(`${item.en}：${item.zh}`, "info")}><strong>{item.en}</strong><span>{item.zh}</span></button>)}</div><label><span>我的译文</span><textarea onChange={(event) => setTranslation(event.target.value)} value={translation} /></label><div className="evidence-actions"><button onClick={() => setSelectedSentence((value) => value === 0 ? 1 : 0)}><Target size={18} />定位下一证据</button><button className="primary-action" onClick={submit}><PaperPlaneTilt size={19} />提交证据卡</button></div><div className="task-checks"><span><CheckCircle weight="fill" />摘要主旨</span><span><CheckCircle weight="fill" />术语提取</span><span className="current"><Clock weight="fill" />证据定位</span><span>中英互译</span></div><Link className="v172-deep-link" href="/student/smart-learning">进入完整五层讲解与正式练习 →</Link></section></div><FeedbackDrawer module="literature" onClose={() => setReviewOpen(false)} open={reviewOpen} /></>;
}

function TermsPractice({ onToast }: { onToast: (message: string, type?: ToastType) => void }) {
  const [selected, setSelected] = useState("按掩膜提取");
  const [order, setOrder] = useState(["设置处理范围", "选择输入栅格", "选择掩膜数据", "运行并检查输出"]);
  const [reviewOpen, setReviewOpen] = useState(false);
  function move(index: number, delta: number) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }
  return <><div className="terms-layout"><section className="software-stage"><header><div><span>ArcGIS Pro / QGIS 术语实验室</span><h2>Spatial Analyst 场景任务</h2></div><SpeakerHigh size={23} /></header><div className="software-window"><aside><strong>Geoprocessing</strong><button className="active">Extract by Mask</button><button>Slope</button><button>Reclassify</button><button>Zonal Statistics</button></aside><main><span>Tool Parameters</span><label>Input raster<select><option>elevation_dem.tif</option></select></label><label>Input mask data<select><option>study_area_boundary</option></select></label><label>Output raster<input readOnly value="dem_clip.tif" /></label><button>Run</button></main></div></section><section className="term-task"><header><span>任务 03</span><h2>选择规范译法并排列操作步骤</h2></header><fieldset><legend>“Extract by Mask”的规范中文译法是：</legend>{["按掩膜提取", "通过面具导出", "遮罩外提取"].map((item) => <label key={item}><input checked={selected === item} onChange={() => setSelected(item)} type="radio" />{item}</label>)}</fieldset><div className="step-order"><span>操作步骤</span>{order.map((item, index) => <div key={item}><i>{index + 1}</i><strong>{item}</strong><span><button aria-label={`上移${item}`} onClick={() => move(index, -1)}>上移</button><button aria-label={`下移${item}`} onClick={() => move(index, 1)}>下移</button></span></div>)}</div><div className="word-bank">{glossary.slice(3).map((item) => <button key={item.en} onClick={() => onToast(`${item.en}：${item.zh}`, "info")}><strong>{item.en}</strong><span>{item.zh}</span></button>)}</div><button className="primary-action" onClick={() => { onToast("软件术语练习已完成，可进入完整智能实训保存记录。", "success"); setReviewOpen(true); }}><Translate size={19} />提交术语实训</button><Link className="v172-deep-link" href="/student/smart-learning">进入完整智能实训 →</Link></section></div><FeedbackDrawer module="terms" onClose={() => setReviewOpen(false)} open={reviewOpen} /></>;
}

export function StudentTrainingHubV172({ userName, teacherName = "郭老师", courseName, onShowRecords }: {
  userName: string;
  teacherName?: string;
  courseName: string;
  onShowRecords: () => void;
}) {
  const [module, setModule] = useState<TrainingModule>("terrain");
  const [toast, setToast] = useState<Toast>(null);
  function notify(message: string, type: ToastType = "info") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4200);
  }
  return <main className="content student-content"><div className="page-heading"><div><span>智能实训中心 · VERSION 21</span><h1>{module === "terrain" ? "地形与城市3D实训" : module === "literature" ? "测绘文献精读" : "GIS软件术语实训"}</h1><p>{module === "terrain" ? `你好，${userName}。在三维场景中判读地形、规划路线并用英语说明依据。` : module === "literature" ? "以证据为中心阅读测绘英文文献" : "在真实软件语境中掌握专业英汉表达"}</p></div><button className="outline-action" onClick={onShowRecords}><BookOpenText size={18} />查看学习档案</button></div><ModuleTabs active={module} onChange={setModule} />{module === "terrain" ? <Terrain3dLab embedded role="student" userName={userName} /> : null}{module === "literature" ? <><LiteraturePractice onToast={notify} /><StudentAssignmentPanel /></> : null}{module === "terms" ? <><TermsPractice onToast={notify} /><StudentAssignmentPanel /></> : null}<LiveBar courseName={courseName} onReview={onShowRecords} submitted={0} teacherName={teacherName} /><ToastMessage onClose={() => setToast(null)} toast={toast} /></main>;
}

function ClassTimeline() {
  const phases = ["发布任务", "学生作答", "同屏对比", "教师讲评", "保存成绩"];
  return <div className="class-timeline">{phases.map((label, index) => <div className={index === 0 ? "done" : index === 1 ? "current" : ""} key={label}><i>{index === 0 ? <Check size={14} weight="bold" /> : index + 1}</i><span>{label}</span></div>)}</div>;
}

function TeacherLiterature({ onNavigate }: { onNavigate: (destination: TeacherDestination) => void }) {
  return <div className="teacher-module-workspace light-teacher-module"><section className="broadcast-brief"><FilePdf size={34} weight="duotone" /><span>本次精读材料</span><h2>LiDAR-derived DTM vertical accuracy</h2><p>选择证据句、设置术语要求和译文评价量规，再进入智能实训内容完成正式配置。</p><label>证据段落<select><option>2.2 LiDAR Point Cloud Processing</option><option>3.1 Accuracy Assessment</option></select></label><label>核心术语<input defaultValue="point cloud, vertical accuracy, topographic mapping" /></label><button className="primary-action" onClick={() => onNavigate("smart")}><Broadcast size={19} />进入正式内容配置</button></section><section className="submission-review"><header><div><span>译文同屏对比</span><h2>课堂展示预览</h2></div><button onClick={() => onNavigate("presentation")}>匿名展示</button></header>{["机载LiDAR已经成为高分辨率地形测绘的重要数据来源。", "在最优条件下，由LiDAR生成的数字地形模型可达到10—15厘米高程精度。", "点云分类是建立可靠地形产品的重要环节。"].map((item, index) => <article key={item}><i>{String.fromCharCode(65 + index)}</i><div><strong>学生译文 {index + 1}</strong><p>{item}</p></div><span>{[18, 12, 9][index]}赞</span></article>)}</section><aside className="rubric-panel"><span>AI评价量规</span>{[["术语规范", "86%"], ["证据完整", "74%"], ["中文表达", "91%"]].map(([label, width]) => <div key={label}><b>{label}</b><i><em style={{ width }} /></i></div>)}<button onClick={() => onNavigate("smart")}><Sparkle size={18} />生成差异讲解</button></aside></div>;
}

function TeacherTerms({ onNavigate }: { onNavigate: (destination: TeacherDestination) => void }) {
  const [active, setActive] = useState(1);
  const tasks = ["界面热点识别", "术语英汉匹配", "操作步骤排序", "英文报错诊断"];
  return <div className="teacher-module-workspace terms-teacher-module"><section className="term-authoring"><header><Translate size={33} /><div><span>GIS软件语言实验室</span><h2>ArcGIS Pro · Spatial Analyst</h2></div></header><div className="task-type-list">{tasks.map((item, index) => <button className={active === index ? "active" : ""} key={item} onClick={() => setActive(index)}><i>{index + 1}</i><span><strong>{item}</strong><small>{index === 0 ? "在界面截图中点选目标工具" : index === 1 ? "建立规范中英术语对应" : index === 2 ? "拖动排列地理处理流程" : "判断原因并选择解决方式"}</small></span></button>)}</div><button className="primary-action" onClick={() => onNavigate("smart")}><Broadcast size={19} />进入正式术语任务</button></section><section className="confusion-matrix"><header><span>术语分析展示</span><b>示例数据 · 非班级成绩</b></header>{[["Extract by Mask", "按掩膜提取", 94], ["Geoprocessing Extent", "地理处理范围", 67], ["Feature Class", "要素类", 88], ["Zonal Statistics", "分区统计", 73], ["Spatial Reference", "空间参考", 91]].map(([english, chinese, value]) => <div key={String(english)}><span><strong>{english}</strong><small>{chinese}</small></span><i><em style={{ width: `${value}%` }} /></i><b>{value}%</b></div>)}</section><aside className="live-question"><Lightbulb size={30} weight="duotone" /><span>示例讲评主题</span><h3>Extent 与范围如何区分？</h3><p>结合软件参数位置进行语境讲解，避免把 extent 机械翻译为“程度”。</p><button onClick={() => onNavigate("presentation")}><PresentationChart size={18} />加入讲评</button></aside></div>;
}

export function TeacherCommandCenterV172({ classId, courseName, teacherName, studentCount, currentLessonTitle, onNavigate, onOpenAvatar }: {
  classId: string;
  courseName: string;
  teacherName: string;
  studentCount: number;
  currentLessonTitle: string;
  onNavigate: (destination: TeacherDestination) => void;
  onOpenAvatar: () => void;
}) {
  const [module, setModule] = useState<TrainingModule>("terrain");
  return <main className="teacher-content v172-command-center"><div className="teacher-heading"><div><span>LIVE CLASS · {courseName}</span><h1>智能实训课堂</h1><p>{studentCount}名学生 · {currentLessonTitle} · 以真实测绘任务驱动专业外语学习</p></div><ClassTimeline /></div><ModuleTabs active={module} dark onChange={setModule} />{module === "terrain" ? <Terrain3dLab classId={classId} embedded role="teacher" userName={teacherName} /> : null}{module === "literature" ? <><TeacherLiterature onNavigate={onNavigate} /><TeacherAssignmentPanel classId={classId} taskModule="literature" /></> : null}{module === "terms" ? <><TeacherTerms onNavigate={onNavigate} /><TeacherAssignmentPanel classId={classId} taskModule="terms" /></> : null}<section className="teacher-actionbar"><button onClick={() => onNavigate("presentation")}><Airplay size={21} />投屏讲评</button><button onClick={() => onNavigate("questions")}><Shuffle size={21} />随机点名</button><button onClick={onOpenAvatar}><Sparkle size={21} />开启AI数字教师</button><button className="save-grade" onClick={() => onNavigate("grades")}><CheckCircle size={21} />保存与查看成绩</button></section></main>;
}
