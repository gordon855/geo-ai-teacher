const CORE_TERMS = [
  "surveying", "surveyor", "geodesy", "geodetic", "coordinate", "coordinates",
  "coordinate system", "Cartesian coordinate", "geographic coordinate system",
  "projected coordinate system", "datum", "geodetic datum", "vertical datum",
  "ellipsoid", "reference ellipsoid", "geoid", "map projection", "UTM", "WGS 84",
  "CGCS2000", "azimuth", "bearing", "horizontal angle", "vertical angle",
  "zenith angle", "distance measurement", "electronic distance measurement", "EDM",
  "total station", "robotic total station", "theodolite", "level", "leveling",
  "levelling", "benchmark", "backsight", "foresight", "intermediate sight",
  "height difference", "instrument height", "reflector height", "prism",
  "automatic target recognition", "ATR", "traverse", "closed traverse", "open traverse",
  "control survey", "geodetic control", "control point", "ground control point", "GCP",
  "GNSS", "GPS", "RTK", "real-time kinematic", "static surveying", "relative positioning",
  "differential positioning", "pseudorange", "carrier phase", "cycle slip", "baseline",
  "satellite ephemeris", "dilution of precision", "DOP", "multipath", "ionosphere",
  "troposphere", "least squares", "least-squares adjustment", "residual", "standard deviation",
  "accuracy", "precision", "error propagation", "systematic error", "random error",
  "photogrammetry", "aerial photogrammetry", "stereoscopic", "stereo pair", "parallax",
  "triangulation", "aerial triangulation", "bundle adjustment", "interior orientation",
  "exterior orientation", "relative orientation", "absolute orientation", "orthophoto",
  "orthorectification", "digital orthophoto map", "DOM", "point cloud", "LiDAR",
  "UAV", "unmanned aerial vehicle", "remote sensing", "electromagnetic spectrum",
  "spatial resolution", "spectral resolution", "radiometric resolution", "temporal resolution",
  "multispectral", "hyperspectral", "NDVI", "GIS", "geographic information system",
  "vector", "raster", "layer", "attribute", "spatial query", "spatial analysis",
  "topology", "georeferencing", "coordinate transformation", "datum transformation",
  "DEM", "DSM", "DTM", "digital elevation model", "contour", "cartography",
  "map scale", "legend", "cadastral surveying", "cadastral map", "boundary survey",
  "parcel", "stakeout", "setting out", "deformation monitoring", "engineering surveying",
  "测量学", "测绘", "大地测量", "坐标系", "大地基准", "参考椭球", "大地水准面",
  "地图投影", "方位角", "水平角", "竖直角", "全站仪", "经纬仪", "水准仪",
  "水准测量", "水准点", "后视", "前视", "导线测量", "控制测量", "控制点",
  "全球导航卫星系统", "实时动态测量", "伪距", "载波相位", "多路径效应",
  "最小二乘", "中误差", "精度", "摄影测量", "空中三角测量", "光束法平差",
  "内方位", "外方位", "正射影像", "点云", "激光雷达", "无人机", "遥感",
  "空间分辨率", "光谱分辨率", "辐射分辨率", "地理信息系统", "矢量", "栅格",
  "空间查询", "拓扑", "数字高程模型", "地图制图", "地籍测量", "放样",
];

function cleanTerm(value) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, 80);
}

function hotwordAllowed(value) {
  if (!value) return false;
  if (/[^\x00-\x7F]/u.test(value)) return value.length <= 15;
  return value.split(/\s+/u).filter(Boolean).length <= 7;
}

function uniqueTerms(values) {
  const seen = new Set();
  const output = [];
  for (const raw of values) {
    const value = cleanTerm(raw);
    const key = value.toLocaleLowerCase("en-US");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

export const SURVEYING_VOICE_GLOSSARY = Object.freeze(uniqueTerms(CORE_TERMS));

export function buildRecognitionHints({ context = "", hotwords = [], language = "mixed" } = {}) {
  const requested = uniqueTerms(Array.isArray(hotwords) ? hotwords : []).filter(hotwordAllowed).slice(0, 40);
  const glossary = SURVEYING_VOICE_GLOSSARY.filter(hotwordAllowed);
  const terms = uniqueTerms([...requested, ...glossary]).slice(0, 220);
  const requestedKeys = new Set(requested.map((value) => value.toLocaleLowerCase("en-US")));
  const vocabulary = Object.fromEntries(
    terms.map((term) => [term, requestedKeys.has(term.toLocaleLowerCase("en-US")) ? 5 : 4]),
  );
  const contextTerms = uniqueTerms([...requested, ...glossary]).slice(0, 45).join("、");
  const sourceContext = cleanTerm(context).slice(0, 220);
  const contextText = [
    "测绘专业外语课堂，中英文可能混合。请准确识别专业术语。",
    sourceContext ? `当前内容：${sourceContext}` : "",
    contextTerms ? `重点术语：${contextTerms}` : "",
  ].filter(Boolean).join(" ").slice(0, 400);
  const languageHints = language === "en" ? ["en", "zh"] : ["zh", "en"];
  return { contextText, vocabulary, languageHints };
}

