export type AttendanceStatus = "present" | "late" | "leave" | "absent" | "unmarked";
export type Student = { id:string; studentNo:string; name:string; status:AttendanceStatus; attendanceRate:number; questionScore:number; homeworkScore:number; seminarScore:number; practiceScore:number; finalProjectScore:number };
export type Lesson = { order:number; week:number; date:string; title:string; detail:string; hours:number; units:string };
export type ColdCallQuestion = { id:string; kind:"专业词汇"|"句式解释"|"原理理解"; prompt:string; answer:string; teachingNote:string; source:string };

const names = Array.from({length:20},(_,i)=>`Demo Student ${i+1}`);
const totals = [88.7,92,88.8,82.1,90.3,86,84.5,93.8,79.5,91,84.4,96.2,82.8,92,86.2,93.3,81,89.3,83.8,94.1];
export const demoStudents:Student[] = names.map((name,index)=>({
  id:`s${String(index+1).padStart(2,"0")}`, studentNo:`DEMO${String(index+1).padStart(2,"0")}`, name,
  status:index===3?"late":index===8?"leave":"present", attendanceRate:[100,100,92,88,100,96,92,100,84,96,92,100,88,96,92,100,88,96,92,100][index] as number,
  questionScore:Number((7.5+(index%7)*.3).toFixed(1)), homeworkScore:Number((8+(index%6)*.3).toFixed(1)),
  seminarScore:Number((totals[index]*.2).toFixed(1)), practiceScore:Number((totals[index]*.2).toFixed(1)), finalProjectScore:Number((totals[index]*.5).toFixed(1))
}));

export const lessons:Lesson[] = [
  [1,5,"10月7日","测绘基础知识英语","学习专业英语的重要性、学习方法与测绘学概念",2,"Unit 1"],
  [2,6,"10月14日","测绘基础知识英语","距离测量的历史、技术方法与角度方向测量",2,"Unit 6、8"],
  [3,6,"10月16日","测绘基础知识英语","高程测量的技术方法与水准测量表达",2,"Unit 2、10"],
  [4,7,"10月21日","大地测量学英语","大地测量、平面测量与大地测量学基础",2,"拓展资料"],
  [5,8,"10月28日","工程测量英语","施工放样、变形监测与工程测量表达",2,"Unit 11、13"],
  [6,9,"11月4日","误差理论英语","测量误差基本概念、系统误差与偶然误差",2,"Unit 1、14"],
  [7,10,"11月11日","GNSS英语","GNSS基础知识、伪距、载波相位与定位精度",2,"Unit 15"],
  [8,11,"11月18日","GNSS英语","全球导航卫星系统与静态、快速静态测量",2,"Unit 16—22"],
  [9,12,"11月25日","地理信息系统英语","GIS基础知识、空间数据与数据模型",2,"Unit 33—38"],
  [10,13,"12月2日","地理信息系统英语","GIS应用、数据处理与可视化",2,"Unit 39、51—53"],
  [11,14,"12月9日","摄影测量与遥感技术英语","摄影测量发展、遥感原理与影像处理",2,"Unit 23—32"],
  [12,15,"12月16日","科技英语写作与翻译","论文写作要求、科技英语特点与翻译技巧",2,"综合实践"]
].map(([order,week,date,title,detail,hours,units])=>({order,week,date,title,detail,hours,units} as Lesson));

export const coldCallQuestions:ColdCallQuestion[]=[{id:"demo-q1",kind:"专业词汇",prompt:"Translate survey point.",answer:"测点",teachingNote:"Correct translation: 10 points.",source:"GeoAI Teacher original demo"}];

export const assessmentWeights=[{label:"课后作业",weight:10,color:"#42d8f5"},{label:"专题研讨",weight:20,color:"#7287ff"},{label:"文献检索与软件操作",weight:20,color:"#b47cff"},{label:"开放式大作业",weight:50,color:"#f4b65f"}];
export const statusLabels:Record<AttendanceStatus,string>={present:"正常",late:"迟到",leave:"请假",absent:"缺勤",unmarked:"未点名"};
