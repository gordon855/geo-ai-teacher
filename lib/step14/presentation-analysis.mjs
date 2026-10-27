import "server-only";

import { extractPptxSlide, indexZipEntries, readZipEntry } from "../step11-9/pptx-slide-text.mjs";
import { loadKnowledgeChunks } from "../cloud/knowledge.mjs";

const decoder = new TextDecoder();
const STOP_TERMS = new Set([
  "and", "are", "for", "from", "into", "that", "the", "this", "with", "work", "system", "data", "method",
]);

const CURATED_TERMS = [
  ["surveying", "测绘；测量", "测量学；调查研究", "调查；查看"],
  ["survey", "测量；测绘", "调查；测量", "调查；概览"],
  ["geodesy", "大地测量学", "地球形状与重力场研究", "日常语境较少使用"],
  ["photogrammetry", "摄影测量学", "基于影像的量测科学", "日常语境较少使用"],
  ["remote sensing", "遥感", "远距离传感与观测", "远程感知"],
  ["geographic information system", "地理信息系统", "空间信息系统", "地图信息系统"],
  ["GIS", "地理信息系统", "空间信息技术", "地图软件或地图系统"],
  ["global navigation satellite system", "全球导航卫星系统", "卫星导航系统", "卫星定位系统"],
  ["GNSS", "全球导航卫星系统", "卫星导航技术", "卫星定位"],
  ["GPS", "全球定位系统", "卫星导航定位技术", "手机或车载定位"],
  ["real-time kinematic", "实时动态差分定位", "载波相位实时差分技术", "实时高精度定位"],
  ["RTK", "实时动态差分定位", "载波相位差分方法", "高精度定位"],
  ["total station", "全站仪", "电子测角测距一体化仪器", "日常语境通常仍称全站仪"],
  ["leveling", "水准测量", "高程测定方法", "调平；弄平"],
  ["traverse", "导线测量；导线", "横贯；遍历", "穿过；横越"],
  ["control point", "控制点", "约束点；基准点", "控制位置的点"],
  ["ground control point", "地面控制点", "影像定位约束点", "地面参照点"],
  ["benchmark", "水准点", "基准；基准测试", "标杆；参照标准"],
  ["datum", "基准；大地基准", "参考基准", "基准日期；基准值"],
  ["horizontal datum", "水平基准；大地基准", "水平参考系统", "水平参照基准"],
  ["vertical datum", "高程基准", "垂直参考系统", "高度参照基准"],
  ["coordinate system", "坐标系", "坐标参考框架", "定位坐标体系"],
  ["coordinate reference system", "坐标参考系统", "空间参考系统", "坐标体系"],
  ["map projection", "地图投影", "曲面到平面的数学映射", "地图投影方式"],
  ["digital elevation model", "数字高程模型", "地表高程数字模型", "数字地形高度模型"],
  ["DEM", "数字高程模型", "地表高程数据模型", "数字地形高度图"],
  ["point cloud", "点云", "三维离散点集合", "大量空间点组成的数据"],
  ["mobile mapping system", "移动测图系统", "移动空间信息采集系统", "移动地图采集系统"],
  ["MMS", "移动测图系统", "移动测量集成系统", "多媒体短信（非测绘语境）"],
  ["aerial triangulation", "空中三角测量", "摄影测量区域网平差", "日常语境较少使用"],
  ["orthophoto", "正射影像", "几何纠正影像", "校正后的俯视影像"],
  ["spatial resolution", "空间分辨率", "空间采样分辨能力", "图像细节清晰程度"],
  ["accuracy", "准确度；精度", "测量结果接近真值的程度", "准确性"],
  ["precision", "精密度", "重复测量的一致程度", "精确性；细致程度"],
  ["error", "误差", "观测值与参考值之差", "错误"],
  ["observation", "观测；观测值", "观察与记录", "观察"],
  ["baseline", "基线", "基准线；基准水平", "底线；基础水平"],
  ["azimuth", "方位角", "方向角度", "方位"],
  ["bearing", "象限角；方向角", "方位；承载", "轴承；举止；方向"],
  ["contour", "等高线", "轮廓线", "轮廓"],
  ["scale", "比例尺", "尺度；量表", "规模；秤；缩放"],
  ["cadastral surveying", "地籍测量", "土地权属边界测量", "地产边界测量"],
  ["engineering surveying", "工程测量", "工程建设测量技术", "工程现场测量"],
  ["deformation monitoring", "变形监测", "结构位移与形变观测", "形状变化监测"],
  ["laser scanning", "激光扫描", "激光三维量测", "用激光进行扫描"],
  ["LiDAR", "激光雷达", "激光探测与测距", "激光扫描雷达"],
];

export function findCuratedPresentationTerm(selection) {
  const normalized = String(selection || "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
  if (!normalized) return null;
  const match = CURATED_TERMS.find(([term]) => term.toLowerCase() === normalized);
  if (!match) return null;
  const [term, surveyingTranslation, academicTranslation, generalTranslation] = match;
  return { term, surveyingTranslation, academicTranslation, generalTranslation };
}

function xmlDecode(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/giu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'").replace(/&amp;/gu, "&");
}

function textNodes(xml) {
  return [...String(xml || "").matchAll(/<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gu)]
    .map((match) => xmlDecode(match[1]).replace(/\s+/gu, " "))
    .filter(Boolean);
}

function hasUnderline(runXml, paragraphXml) {
  const properties = runXml.match(/<(?:[\w.-]+:)?rPr\b([^>]*)/u)?.[1] || "";
  if (/\bu=(?:"|')(?!none(?:"|'))[^"']+(?:"|')/iu.test(properties)) return true;
  const defaults = paragraphXml.match(/<(?:[\w.-]+:)?defRPr\b([^>]*)/u)?.[1] || "";
  return /\bu=(?:"|')(?!none(?:"|'))[^"']+(?:"|')/iu.test(defaults);
}

function underlinedParagraphs(xml, slideNumber) {
  const results = [];
  let paragraphIndex = 0;
  for (const match of String(xml || "").matchAll(/<(?:[\w.-]+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?p>/gu)) {
    paragraphIndex += 1;
    const paragraphXml = match[1];
    const runs = [...paragraphXml.matchAll(/<(?:[\w.-]+:)?(?:r|fld)\b[\s\S]*?<\/(?:[\w.-]+:)?(?:r|fld)>/gu)];
    const fullText = textNodes(paragraphXml).join("").replace(/\s+/gu, " ").trim();
    if (!fullText) continue;
    const highlightedText = runs
      .filter((run) => hasUnderline(run[0], paragraphXml))
      .flatMap((run) => textNodes(run[0]))
      .join("")
      .replace(/\s+/gu, " ")
      .trim();
    if (!highlightedText) continue;
    const key = `${fullText}\u0000${highlightedText}`;
    if (results.some((item) => item.key === key)) continue;
    results.push({
      id: `slide-${slideNumber}-underline-${paragraphIndex}`,
      key,
      slideNumber,
      text: fullText.slice(0, 2_000),
      highlightedText: highlightedText.slice(0, 800),
      sourceLabel: `PPT第${slideNumber}页 · 原始下划线格式`,
    });
  }
  return results.map((item) => ({
    id: item.id,
    slideNumber: item.slideNumber,
    text: item.text,
    highlightedText: item.highlightedText,
    sourceLabel: item.sourceLabel,
  }));
}

function normalizeTerm(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

let glossaryCache;

function glossary() {
  if (glossaryCache) return glossaryCache;
  const map = new Map();
  for (const [term, surveyingTranslation, academicTranslation, generalTranslation] of CURATED_TERMS) {
    map.set(term.toLowerCase(), {
      term,
      surveyingTranslation,
      academicTranslation,
      generalTranslation,
      sourceLabel: "测绘行业规范语境",
    });
  }
  for (const chunk of loadKnowledgeChunks()) {
    if (chunk.attributes?.source_type !== "textbook") continue;
    for (const rawLine of String(chunk.content || "").split(/\r?\n/u)) {
      const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/u, "").trim();
      const pair = line.match(/^(.{2,100}?)\s*[:：]\s*(.{1,180})$/u);
      if (!pair || !/[A-Za-z]/u.test(pair[1]) || !/\p{Script=Han}/u.test(pair[2])) continue;
      const term = normalizeTerm(pair[1]).replace(/^["'“”‘’]+|["'“”‘’.,，;；]+$/gu, "");
      const lower = term.toLowerCase();
      const words = lower.split(/\s+/u);
      if (term.length < 3 || term.length > 80 || words.length > 8 || STOP_TERMS.has(lower)) continue;
      const translation = normalizeTerm(pair[2]).replace(/[,，;；]\s*$/u, "");
      const existing = map.get(lower);
      map.set(lower, {
        term: existing?.term || term,
        surveyingTranslation: translation,
        academicTranslation: existing?.academicTranslation || `${translation}（学术语境需结合所属学科）`,
        generalTranslation: existing?.generalTranslation || "普通生活语境可能采用其他词义，点击后查看语境解析。",
        sourceLabel: String(chunk.citation || "《测绘专业外语》教材词汇表"),
      });
    }
  }
  glossaryCache = [...map.values()].sort((left, right) => right.term.length - left.term.length);
  return glossaryCache;
}

function containsTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const boundary = /^[A-Za-z0-9]/u.test(term) && /[A-Za-z0-9]$/u.test(term);
  return new RegExp(`${boundary ? "\\b" : ""}${escaped}${boundary ? "\\b" : ""}`, "iu").test(text);
}

function slideTerms(text, slideNumber) {
  const results = [];
  const seen = new Set();
  for (const item of glossary()) {
    const normalized = item.term.toLowerCase();
    if (seen.has(normalized) || !containsTerm(text, item.term)) continue;
    seen.add(normalized);
    results.push({
      id: `slide-${slideNumber}-term-${results.length + 1}`,
      slideNumber,
      ...item,
      context: text.slice(0, 1_200),
    });
    if (results.length >= 100) break;
  }
  return results;
}

export function analyzePresentationDeck(bytes) {
  const index = indexZipEntries(bytes);
  const slideNumbers = [...index.entries.keys()]
    .map((name) => Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/u)?.[1] || 0))
    .filter(Boolean)
    .sort((left, right) => left - right);
  const slides = slideNumbers.map((slideNumber) => {
    const slide = extractPptxSlide(bytes, slideNumber);
    const xmlBytes = readZipEntry(index, `ppt/slides/slide${slideNumber}.xml`);
    const xml = xmlBytes ? decoder.decode(xmlBytes) : "";
    return {
      slideNumber,
      title: slide.title,
      text: slide.text,
      underlines: underlinedParagraphs(xml, slideNumber),
      terms: slideTerms(slide.text, slideNumber),
    };
  });
  const underlineCount = slides.reduce((sum, slide) => sum + slide.underlines.length, 0);
  const uniqueTerms = new Map();
  for (const slide of slides) {
    for (const term of slide.terms) {
      const key = term.term.toLowerCase();
      const existing = uniqueTerms.get(key);
      if (existing) existing.slideNumbers.push(slide.slideNumber);
      else uniqueTerms.set(key, { ...term, slideNumbers: [slide.slideNumber] });
    }
  }
  return {
    formatVersion: 1,
    slideCount: slides.length,
    underlineCount,
    termCount: uniqueTerms.size,
    analyzedAt: new Date().toISOString(),
    slides,
    terms: [...uniqueTerms.values()],
  };
}
