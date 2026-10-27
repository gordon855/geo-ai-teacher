import type { ColdCallQuestionSeed, GradeWeight, LessonSeed } from "./types";

export const DEFAULT_CLASS_ID = "class-demo-217";
export const DEFAULT_COURSE_CODE = "DEMO-GEO-217";
export const DEFAULT_CLASS_NAME = "GeoAI Demo Class";
export const DEFAULT_TERM = "Demo term";

export const COURSE_LESSONS: LessonSeed[] = [
  { ordinal: 1, weekLabel: "第6周", dateLabel: "10月7日", title: "课程导入与测绘英语基础", detail: "课程要求、专业英语构词与测绘基本概念", unitRange: "Unit 1", hours: 2 },
  { ordinal: 2, weekLabel: "第7周", dateLabel: "10月14日", title: "距离与角度测量英语", detail: "距离、方向、角度及常用仪器表达", unitRange: "Unit 6、8", hours: 2 },
  { ordinal: 3, weekLabel: "第7周", dateLabel: "10月16日", title: "高程测量英语", detail: "水准测量、垂直基准与高程误差", unitRange: "Unit 2、10", hours: 2 },
  { ordinal: 4, weekLabel: "第8周", dateLabel: "10月21日", title: "大地测量英语", detail: "坐标系统、基准与大地测量基本方法", unitRange: "相关Unit", hours: 2 },
  { ordinal: 5, weekLabel: "第9周", dateLabel: "10月28日", title: "工程测量英语", detail: "控制、放样、施工测量与工程应用", unitRange: "Unit 11、13", hours: 2 },
  { ordinal: 6, weekLabel: "第10周", dateLabel: "11月4日", title: "测量误差英语", detail: "accuracy、precision与误差传播", unitRange: "Unit 1、14", hours: 2 },
  { ordinal: 7, weekLabel: "第11周", dateLabel: "11月11日", title: "GNSS基础知识", detail: "GPS组成、伪距、载波相位、星历与误差源", unitRange: "Unit 15", hours: 2 },
  { ordinal: 8, weekLabel: "第12周", dateLabel: "11月18日", title: "GNSS测量英语", detail: "全球导航卫星系统与静态、快速静态测量", unitRange: "Unit 16—22", hours: 2 },
  { ordinal: 9, weekLabel: "第13周", dateLabel: "待定", title: "GIS英语（一）", detail: "空间数据、数据库与地图表达", unitRange: "Unit 33—38", hours: 2 },
  { ordinal: 10, weekLabel: "第14周", dateLabel: "待定", title: "GIS英语（二）", detail: "空间分析、Web GIS与行业应用", unitRange: "Unit 39、51—53", hours: 2 },
  { ordinal: 11, weekLabel: "第15周", dateLabel: "待定", title: "摄影测量与遥感英语", detail: "影像、传感器、摄影测量和遥感处理", unitRange: "Unit 23—32", hours: 2 },
  { ordinal: 12, weekLabel: "第16周", dateLabel: "待定", title: "专业翻译与科技写作", detail: "开放式大作业指导、术语统一与表达优化", unitRange: "综合实践", hours: 2 },
];

export const OFFICIAL_GRADE_WEIGHTS: GradeWeight[] = [
  { category: "homework", label: "课后作业", weight: 10 },
  { category: "seminar", label: "专题研讨", weight: 20 },
  { category: "practice", label: "文献检索与软件操作", weight: 20 },
  { category: "final_project", label: "开放式大作业", weight: 50 },
];

export const COLD_CALL_QUESTIONS: ColdCallQuestionSeed[] = COURSE_LESSONS.flatMap(lesson => [
 {id:`demo-${lesson.ordinal}-term`,sourceLessonOrdinal:lesson.ordinal,kind:"terminology",prompt:"Translate survey point into Chinese.",answer:"测点",rubric:"Correct term: 10 points.",source:"GeoAI Teacher original demo"},
 {id:`demo-${lesson.ordinal}-concept`,sourceLessonOrdinal:lesson.ordinal,kind:"concept",prompt:"Why should a coordinate include its reference system?",answer:"The same numeric values can represent different positions in different systems.",rubric:"Reference system: 5 points; clear example: 5 points.",source:"GeoAI Teacher original demo"}
]);
