import rawHighlights from "./textbook-highlights.json" with { type: "json" };
import type { TranslationComparison } from "@/lib/step9/learning-content";

type RawTextbookHighlight = {
  unit: number;
  sequence: number;
  original: string;
  textbookTranslation: string;
};

type UnitTerm = {
  term: string;
  meaning: string;
};

type UnitMetadata = {
  lessonOrdinal: number;
  title: string;
  shortTitle: string;
  terms: UnitTerm[];
  principle: string;
  translationNote: string;
};

export type TextbookHighlightedSentence = TranslationComparison & {
  origin: "textbook-underline";
  textbookUnit: number;
  underlineSequence: number;
  unitTitle: string;
  professionalLiteralTranslation: string;
  professionalExplanation: string;
};

const UNIT_METADATA: Record<number, UnitMetadata> = {
  9: {
    lessonOrdinal: 2,
    title: "Demo surveying language practice",
    shortTitle: "测绘语言演示练习",
    terms: [{term:"survey point",meaning:"测点"},{term:"leveling",meaning:"水准测量"},{term:"map scale",meaning:"地图比例尺"},{term:"coordinate",meaning:"坐标"}],
    principle: "明确测点、水平基准、比例尺与参考系统，再核对译文中的关系和单位。",
    translationNote: "此单元使用原创演示句，保留课程编号用于流程验证。",
  },
  27: {
    lessonOrdinal: 11,
    title: "Demo surveying language practice",
    shortTitle: "测绘语言演示练习",
    terms: [{term:"survey point",meaning:"测点"},{term:"leveling",meaning:"水准测量"},{term:"map scale",meaning:"地图比例尺"},{term:"coordinate",meaning:"坐标"}],
    principle: "使用测点与参考系统描述位置，并明确图上距离与实地距离的比例关系。",
    translationNote: "此单元使用原创演示句，保留课程编号用于流程验证。",
  },
  1: {
    lessonOrdinal: 6,
    title: "The Reliability of a Survey and Errors",
    shortTitle: "测量可靠性与误差",
    terms: [
      { term: "systematic error", meaning: "系统误差" },
      { term: "random error", meaning: "偶然（随机）误差" },
      { term: "blunder", meaning: "粗差" },
      { term: "plottable distance", meaning: "可绘距离" },
      { term: "relative position", meaning: "相对位置" },
    ],
    principle: "本章把测量成果的用途、比例尺和精度要求与误差类型联系起来。理解句子时要区分粗差、系统误差和偶然误差，以及误差累积对成果可靠性的影响。",
    translationNote: "教材成书较早，error、random error 等术语应按当前测量学语境统一，不宜按普通英语词义直译。",
  },
  2: {
    lessonOrdinal: 2,
    title: "Levels",
    shortTitle: "水准仪",
    terms: [
      { term: "leveling", meaning: "水准测量/整平" },
      { term: "bubble", meaning: "水准气泡" },
      { term: "line of sight", meaning: "视准线" },
      { term: "tilting screw", meaning: "微倾螺旋" },
      { term: "rotation axis", meaning: "旋转轴/竖轴" },
    ],
    principle: "本章围绕水准仪的视准线、气泡与补偿机构展开。核心是使视准线建立稳定的水平基准，从而通过标尺读数获得点间高差。",
    translationNote: "level、leveling、line of sight 在测绘语境中有固定专业义，应根据仪器部件和操作过程选择“水准、整平、视准线”等译法。",
  },
  7: {
    lessonOrdinal: 5,
    title: "Robotic Total Station",
    shortTitle: "机器人全站仪",
    terms: [
      { term: "EDM", meaning: "电子测距/电磁波测距模块" },
      { term: "slope distance", meaning: "斜距" },
      { term: "azimuth", meaning: "方位角" },
      { term: "automatic target recognition", meaning: "自动目标识别" },
      { term: "robotic total station", meaning: "机器人全站仪" },
    ],
    principle: "全站仪把角度、距离观测与微处理器计算结合起来；机器人全站仪进一步加入自动照准、跟踪、数据传输和遥控能力，可用于放样、地形测量和自动化监测。",
    translationNote: "仪器动作词应按外业操作规范翻译；target、station、layout、azimuth 等不能脱离全站仪工作流按普通词义处理。",
  },
  8: {
    lessonOrdinal: 2,
    title: "Angle and Direction Measurement",
    shortTitle: "角度与方向测量",
    terms: [
      { term: "horizontal angle", meaning: "水平角" },
      { term: "vertical angle", meaning: "竖直角" },
      { term: "azimuth", meaning: "方位角" },
      { term: "meridian", meaning: "子午线/子午面" },
      { term: "projection", meaning: "投影" },
    ],
    principle: "角度测量首先要明确参考面、参考方向和旋转方向。水平角比较空间方向在水平面上的投影，方位角则必须同时明确起始子午线与顺时针量取规则。",
    translationNote: "azimuth 应统一为“方位角”；projection、meridian、elevation/depression angle 等要保持测量学定义关系，避免只做字面翻译。",
  },
  10: {
    lessonOrdinal: 3,
    title: "Methods of Elevation Determination",
    shortTitle: "高程测量方法",
    terms: [
      { term: "elevation", meaning: "高程" },
      { term: "reference datum", meaning: "高程基准/参考基准面" },
      { term: "differential leveling", meaning: "差分水准测量" },
      { term: "orthometric height", meaning: "正高" },
      { term: "ellipsoid", meaning: "参考椭球" },
    ],
    principle: "本章比较几何水准、三角高程、惯性定位和GNSS等高程获取方式。专业理解的关键是始终说明高程所依附的垂直基准，并区分正高与椭球高。",
    translationNote: "教材中的 elevation 有时译作“海拔”，教学时应根据基准统一为“高程”；GPS height 与传统水准高程必须区分。",
  },
  11: {
    lessonOrdinal: 4,
    title: "Topographic Surveying",
    shortTitle: "地形测量",
    terms: [
      { term: "topographic survey", meaning: "地形测量" },
      { term: "traverse", meaning: "导线/导线测量" },
      { term: "triangulation", meaning: "三角测量" },
      { term: "trilateration", meaning: "三边测量" },
      { term: "horizontal control", meaning: "平面控制" },
    ],
    principle: "地形测量既要确定地表起伏，也要定位自然与人工地物；控制测量为碎部测量提供统一的坐标与方向基础，具体方法需根据范围、精度和内外业条件选择。",
    translationNote: "traverse、triangulation、trilateration、party chief 等均为专业术语；译文应同时保留控制测量方法与适用条件。",
  },
  13: {
    lessonOrdinal: 5,
    title: "The Factors Affecting Rock Displacement",
    shortTitle: "岩移影响因素",
    terms: [
      { term: "rock displacement", meaning: "岩层移动/岩移" },
      { term: "seam", meaning: "矿层/煤层" },
      { term: "dip", meaning: "倾角" },
      { term: "overburden", meaning: "覆盖层" },
      { term: "subsidence", meaning: "地表沉陷" },
    ],
    principle: "岩移受岩体性质、产状、开采深度与厚度等多因素共同影响。工程监测中要把这些机理因素与地表位移、沉陷和变形观测联系起来。",
    translationNote: "seam、dip、overburden、subsidence 等具有矿山测量固定译法，不能按日常英语直译。",
  },
  15: {
    lessonOrdinal: 7,
    title: "The Global Positioning System",
    shortTitle: "GPS定位基础",
    terms: [
      { term: "earth-centered coordinate system", meaning: "地心坐标系" },
      { term: "ephemerides", meaning: "星历" },
      { term: "pseudo-range", meaning: "伪距" },
      { term: "carrier", meaning: "载波" },
      { term: "receiver clock offset", meaning: "接收机钟差" },
    ],
    principle: "GPS通过卫星信号建立距离或载波相位观测，并在统一地心坐标框架中解算接收机位置。伪距定位还需同时处理接收机钟差与卫星几何分布。",
    translationNote: "pseudo-range、carrier phase、ephemeris、epoch 等必须采用GNSS规范术语；教材中旧称谓可保留作历史对照。",
  },
  16: {
    lessonOrdinal: 8,
    title: "General Guide to Static and Rapid Static Surveying (1)",
    shortTitle: "静态与快速静态GPS（一）",
    terms: [
      { term: "baseline", meaning: "基线" },
      { term: "reference station", meaning: "参考站" },
      { term: "Rapid Static", meaning: "快速静态测量" },
      { term: "GDOP", meaning: "几何精度因子" },
      { term: "ionosphere", meaning: "电离层" },
    ],
    principle: "静态与快速静态GNSS测量依赖同时观测形成基线。基线长度、卫星几何、电离层活动和观测时段共同影响所需观测时间与解算可靠性。",
    translationNote: "baseline、reference station、GDOP、observation window 等应按GNSS外业设计语境翻译，不能脱离观测方案理解。",
  },
  17: {
    lessonOrdinal: 8,
    title: "General Guide to Static and Rapid Static Surveying (2)",
    shortTitle: "静态与快速静态GPS（二）",
    terms: [
      { term: "low elevation satellite", meaning: "低高度角卫星" },
      { term: "reference receiver", meaning: "参考站接收机" },
      { term: "rover", meaning: "流动站" },
      { term: "Selective Availability", meaning: "选择可用性（SA）" },
      { term: "baseline", meaning: "基线" },
    ],
    principle: "本章进一步讨论卫星高度角、参考站选址、已知点约束和数据处理。低高度角信号传播路径更长，通常更易受大气与多路径影响。",
    translationNote: "reference/rover、low elevation、fixed point 等术语需要结合GNSS基线解算角色理解；SA属于GPS历史机制，应保留历史语境。",
  },
  18: {
    lessonOrdinal: 8,
    title: "Deriving Initial WGS 84 Coordinates",
    shortTitle: "WGS 84初始坐标",
    terms: [
      { term: "WGS 84", meaning: "WGS 84坐标参考系统" },
      { term: "cut-off angle", meaning: "截止高度角" },
      { term: "baseline", meaning: "基线" },
      { term: "ionospheric model", meaning: "电离层模型" },
      { term: "phase observation", meaning: "相位观测值" },
    ],
    principle: "初始坐标、截止高度角和电离层处理都会影响基线解算。提高截止高度角可能改善低高度角观测质量，但也会减少可用卫星，必须兼顾几何条件。",
    translationNote: "cut-off angle、phase observation、baseline solution 等要按GNSS数据处理流程翻译，并明确参数设置与可靠性的因果关系。",
  },
  23: {
    lessonOrdinal: 11,
    title: "Introduction to Photogrammetry",
    shortTitle: "摄影测量导论",
    terms: [
      { term: "photogrammetry", meaning: "摄影测量" },
      { term: "remote sensing", meaning: "遥感" },
      { term: "close-range photogrammetry", meaning: "近景摄影测量" },
      { term: "orthophoto", meaning: "正射影像" },
      { term: "image interpretation", meaning: "影像解译" },
    ],
    principle: "摄影测量利用影像在非接触条件下恢复对象的几何与属性信息。学习时要区分摄影测量、近景摄影测量和遥感的范围及成果类型。",
    translationNote: "photogrammetry、orthophoto、close-range 等属于固定术语；objects measured without being touched 应译出“非接触测量”的专业含义。",
  },
  24: {
    lessonOrdinal: 11,
    title: "Short Description of Photogrammetry (1)",
    shortTitle: "摄影测量基本过程（一）",
    terms: [
      { term: "rectification", meaning: "影像纠正" },
      { term: "control point", meaning: "控制点" },
      { term: "principal point", meaning: "像主点" },
      { term: "orientation", meaning: "定向" },
      { term: "image coordinate", meaning: "像平面坐标" },
    ],
    principle: "摄影测量几何处理依赖控制信息与成像几何，通过内外方位元素和纠正关系把影像量测转换到目标坐标系统。",
    translationNote: "orientation、rectification、principal point 等应采用摄影测量术语，不宜翻成一般意义的“方向、改正、主要点”。",
  },
  25: {
    lessonOrdinal: 11,
    title: "Short Description of Photogrammetry (2)",
    shortTitle: "摄影测量基本过程（二）",
    terms: [
      { term: "stereophotogrammetry", meaning: "立体摄影测量" },
      { term: "relative orientation", meaning: "相对定向" },
      { term: "absolute orientation", meaning: "绝对定向" },
      { term: "DTM", meaning: "数字地面模型" },
      { term: "stereomodel", meaning: "立体模型" },
    ],
    principle: "立体摄影测量通过同名光线交会建立三维模型，再经相对定向、绝对定向及控制点约束恢复真实比例尺和坐标关系。",
    translationNote: "relative/absolute orientation、stereomodel、DTM 等有严格摄影测量含义，译文需保留步骤先后和几何约束。",
  },
  29: {
    lessonOrdinal: 11,
    title: "Principles of Remote Sensing",
    shortTitle: "遥感基本原理",
    terms: [
      { term: "remote sensing", meaning: "遥感" },
      { term: "electromagnetic radiation", meaning: "电磁辐射" },
      { term: "backscatter", meaning: "后向散射" },
      { term: "SAR", meaning: "合成孔径雷达" },
      { term: "ground track", meaning: "地面轨迹" },
    ],
    principle: "遥感以传感器接收目标携带的信息为基础，常以电磁辐射为信息载体；主动微波遥感还需要依据后向散射机理解释SAR影像。",
    translationNote: "sensing、backscatter、ground track、repeat cycle 等要按遥感物理和卫星轨道语境翻译，避免逐词直译。",
  },
  33: {
    lessonOrdinal: 9,
    title: "Introduction to GIS",
    shortTitle: "GIS导论",
    terms: [
      { term: "GIS", meaning: "地理信息系统" },
      { term: "geographically referenced", meaning: "具有地理参照的" },
      { term: "layer", meaning: "图层/分层" },
      { term: "spatial information", meaning: "空间信息" },
      { term: "spatial analysis", meaning: "空间分析" },
    ],
    principle: "GIS把空间位置与属性信息组织起来，并通过图层叠加、查询和空间分析揭示单独数据难以发现的空间关系和模式。",
    translationNote: "layer、feature、spatial 等应保持GIS专业语义；教材中较早的中文表达可与当前软件界面术语对照。",
  },
  34: {
    lessonOrdinal: 9,
    title: "Geographic Information and Spatial Data Models",
    shortTitle: "GIS空间数据模型",
    terms: [
      { term: "vector model", meaning: "矢量数据模型" },
      { term: "raster model", meaning: "栅格数据模型" },
      { term: "discrete feature", meaning: "离散要素" },
      { term: "continuous value", meaning: "连续数值" },
      { term: "geographic object", meaning: "地理对象" },
    ],
    principle: "空间数据模型是对现实世界的抽象。离散对象通常适合矢量表达，连续场常用栅格表达，但具体模型仍取决于现象性质和分析任务。",
    translationNote: "vector/raster、feature/object、continuous/discrete 等应使用GIS数据模型规范译法，并区分“要素”与一般“特征”的含义。",
  },
  36: {
    lessonOrdinal: 10,
    title: "Data Processing Systems (1)",
    shortTitle: "空间数据处理系统",
    terms: [
      { term: "data processing system", meaning: "数据处理系统" },
      { term: "data acquisition", meaning: "数据获取" },
      { term: "spatial data", meaning: "空间数据" },
      { term: "world coordinates", meaning: "世界坐标/统一坐标" },
      { term: "remote sensing", meaning: "遥感" },
    ],
    principle: "空间数据处理覆盖获取、存储维护、分析与输出的完整流程。GIS项目常需整合来源、时间、比例尺和投影不同的数据。",
    translationNote: "acquisition、maintenance、projection、world coordinates 等应按GIS数据处理流程翻译，并保持流程层级和数据来源关系。",
  },
  38: {
    lessonOrdinal: 10,
    title: "GIS Software",
    shortTitle: "GIS软件与功能",
    terms: [
      { term: "relationship", meaning: "空间/对象关系" },
      { term: "software package", meaning: "软件包" },
      { term: "ArcGIS Desktop", meaning: "ArcGIS Desktop桌面软件" },
      { term: "geoprocessing", meaning: "地理处理" },
      { term: "data model", meaning: "数据模型" },
    ],
    principle: "GIS软件的核心价值不仅在显示地图，更在于维护对象关系、组织数据模型并执行分析、编辑、可视化和地理处理工作流。",
    translationNote: "relationship、geoprocessing、compilation 等应按GIS软件功能解释；软件名称和功能项不应进行随意意译。",
  },
};

const TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/随机误差/gu, "偶然（随机）误差"],
  [/方向角/gu, "方位角"],
  [/光栅/gu, "栅格"],
  [/差别水准测量/gu, "差分水准测量"],
  [/水准测高/gu, "水准测量"],
  [/其它/gu, "其他"],
];

function normalizeEnglish(value: string) {
  return value
    .toLowerCase()
    .replace(/[’‘]/gu, "'")
    .replace(/[^a-z0-9]+/gu, "");
}

function normalizeProfessionalTranslation(value: string) {
  let result = value;
  for (const [pattern, replacement] of TERM_REPLACEMENTS) result = result.replace(pattern, replacement);
  return result
    .replace(/,/gu, "，")
    .replace(/;/gu, "；")
    .replace(/\s+/gu, " ")
    .trim();
}

function makeModernTranslation(value: string) {
  return normalizeProfessionalTranslation(value)
    .replace(/能被/gu, "可")
    .replace(/可以被/gu, "可")
    .replace(/用在其他方面/gu, "用于其他用途")
    .replace(/进行作业/gu, "作业")
    .replace(/在这种情况下/gu, "此时")
    .replace(/从而可以/gu, "从而可");
}

function selectTerms(original: string, metadata: UnitMetadata) {
  const normalized = normalizeEnglish(original);
  const matches = metadata.terms.filter((item) => normalized.includes(normalizeEnglish(item.term)));
  return (matches.length ? matches : metadata.terms.slice(0, 3)).slice(0, 5);
}

function inferSentencePattern(original: string) {
  const lower = original.toLowerCase();
  const notes: string[] = [];
  const sentenceCount = original.split(/[.!?]+\s+/u).filter((part) => part.trim().length > 8).length;
  if (sentenceCount > 1) notes.push(`连续划线内容含约${sentenceCount}个分句/句子：先逐句找主谓核心，再恢复句间递进、因果或转折关系。`);
  if (/\b(which|that|who|whose|where)\b/u.test(lower)) notes.push("含关系词引导的定语/关系结构：先确定先行词，再处理后置修饰，避免修饰对象错位。");
  if (/\b(if|when|while|although|though|unless|provided|since|because|as)\b/u.test(lower)) notes.push("含条件、时间、让步或原因状语关系：翻译时先判断逻辑关系，再决定中文语序。");
  if (/\b(is|are|was|were|be|been|being)\s+(?:\w+ed|known|made|used|called|given|held|set|found|determined|measured|computed|stored|defined|represented)\b/u.test(lower)) notes.push("含被动结构：科技汉语可按信息焦点改为无主句、主动句或“被/由”结构，不必机械保留英语被动形式。");
  if (/\b(either|both|rather than|as well as|not only|respectively)\b/u.test(lower)) notes.push("含并列、对照或对应结构：保持各并列成分层级一致，并检查中文中的对应关系。");
  if (/\b(using|considering|depending|containing|including|ranging|resulting|following)\b/u.test(lower)) notes.push("含-ing非谓语或介词化结构：判断其表示方式、条件、伴随还是结果，再按中文逻辑展开。");
  if (!notes.length) notes.push("先提取主语、谓语和核心宾语/表语，再把介词短语和专业修饰语逐层接回主干。");
  if (notes.length === 1) notes.push("专业长句翻译遵循“术语先定—主干先译—修饰回填—逻辑复核”，避免逐词顺译。");
  return notes.slice(0, 4);
}

function buildHighlight(row: RawTextbookHighlight): TextbookHighlightedSentence {
  const metadata = UNIT_METADATA[row.unit];
  if (!metadata) throw new Error(`缺少Unit ${row.unit}的课程映射。`);
  const terms = selectTerms(row.original, metadata);
  const professionalLiteralTranslation = normalizeProfessionalTranslation(row.textbookTranslation);
  return {
    id: `tb-u${String(row.unit).padStart(2, "0")}-underline-${String(row.sequence).padStart(2, "0")}`,
    title: `${metadata.shortTitle} · 原创示例${row.sequence}`,
    original: row.original,
    textbookTranslation: row.textbookTranslation,
    standardTranslation: makeModernTranslation(row.textbookTranslation),
    limitation: `${metadata.translationNote} 本条为原创演示材料，不是教材引文。`,
    sentencePattern: inferSentencePattern(row.original),
    termNotes: terms.map((item) => `${item.term}：${item.meaning}`),
    keyChineseTerms: terms.map((item) => item.meaning.split(/[（(/]/u)[0]).filter(Boolean),
    practicePrompt: "先遮住三种译文，圈出主干、专业术语和逻辑连接词，再独立翻译；最后对照教材译文检查信息是否遗漏。",
    source: `GeoAI Teacher original demo ${row.unit} / ${row.sequence}`,
    origin: "textbook-underline",
    textbookUnit: row.unit,
    underlineSequence: row.sequence,
    unitTitle: metadata.title,
    professionalLiteralTranslation,
    professionalExplanation: metadata.principle,
  };
}

export const TEXTBOOK_HIGHLIGHTED_SENTENCES: TextbookHighlightedSentence[] = (rawHighlights as RawTextbookHighlight[]).map(buildHighlight);

export function getTextbookHighlightsForLesson(lessonOrdinal: number) {
  return TEXTBOOK_HIGHLIGHTED_SENTENCES.filter((item) => UNIT_METADATA[item.textbookUnit].lessonOrdinal === lessonOrdinal);
}

export function getTextbookUnitsForLesson(lessonOrdinal: number) {
  return [...new Set(getTextbookHighlightsForLesson(lessonOrdinal).map((item) => item.textbookUnit))];
}

export const TEXTBOOK_HIGHLIGHT_TOTALS = {
  underlinedGroups: TEXTBOOK_HIGHLIGHTED_SENTENCES.length,
  textbookUnits: new Set(TEXTBOOK_HIGHLIGHTED_SENTENCES.map((item) => item.textbookUnit)).size,
};
