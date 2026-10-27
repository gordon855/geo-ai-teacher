export const TASK_DRAFTS = {
 terrain:[
 {title:'山地测量路线与风险解释',instructions:'在当前场景设置至少3个路线节点，用不少于60个英文单词描述slope、ridge、valley，比较两条候选路线，说明数据来源与不确定性。仅作课堂分析，不用于实际工程安全决策。'},
 {title:'地形起伏与选线比较',instructions:'绘制至少2个路线节点，用英文解释坡度、视通条件及绕行取舍。区分显示夸张与实际高程，指出地图未加载时不能得出的结论。'},
 {title:'城市测量与建筑高度分析',instructions:'选至少2个观测位置，用英文比较建筑遮挡和GNSS观测条件。明确建筑拉伸高度不等于实测高度；如选山地区域则分析山体遮挡。'}],
 literature:[
 {title:'LiDAR文献精读与证据表达',instructions:'自选一篇可核验英文LiDAR文献，附标题和来源链接。摘录不超过50词的证据段并翻译，解释DTM、DSM、point cloud、vertical accuracy；用80—120个英文单词分析精度评价的局限。提交可编辑.docx。'},
 {title:'GNSS英文摘要分析',instructions:'选择英文GNSS研究摘要并附来源，归纳研究问题、方法和结论；解释RTK、multipath、ambiguity resolution；翻译两个关键句并分析句法。提交可编辑.docx。'},
 {title:'遥感文献方法比较',instructions:'自选两篇英文遥感文献并附来源，用100—150词比较分辨率、样本和精度指标；解释spatial resolution与classification accuracy。提交可编辑.docx。'}],
 terms:[
 {title:'GIS空间分析专业术语',instructions:'解释并翻译Clip、Intersect、Spatial Join、Buffer、Dissolve，为每个术语提供英文应用句；比较空间连接与相交的输出差异。提交可编辑.docx。'},
 {title:'坐标与投影术语辨析',instructions:'解释datum、coordinate reference system、projection、false easting，辨析Define Projection与Project，给出纠错案例及不少于80词的英文说明。提交可编辑.docx。'},
 {title:'栅格处理英文操作说明',instructions:'解释NoData、cell size、resampling、Extract by Mask，用英文列出裁剪与重采样步骤，说明分类栅格与连续高程适用的方法。提交可编辑.docx。'}]
};
export function randomTask(module: keyof typeof TASK_DRAFTS) {const rows=TASK_DRAFTS[module];return rows[Math.floor(Math.random()*rows.length)];}
