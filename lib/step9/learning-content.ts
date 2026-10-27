export type ListeningPractice = {
  id: string;
  title: string;
  sentence: string;
  translation: string;
  pauseMarked: string;
  keywords: string[];
  pronunciationTips: string[];
  difficulty: "基础" | "进阶" | "挑战";
  source: string;
};

export type CareerTask = {
  id: string;
  title: string;
  role: string;
  situation: string;
  task: string;
  outputMode: "口头表达" | "书面表达" | "角色对话";
  timeLimit: string;
  requiredTerms: string[];
  supportPhrases: string[];
  checklist: string[];
  sampleAnswer: string;
  source: string;
};

export type TranslationComparison = {
  id: string;
  title: string;
  original: string;
  textbookTranslation: string;
  standardTranslation: string;
  limitation: string;
  sentencePattern: string[];
  termNotes: string[];
  keyChineseTerms: string[];
  practicePrompt: string;
  source: string;
};

export type SmartLessonModule = {
  lessonOrdinal: number;
  lessonTitle: string;
  unitRange: string;
  listening: ListeningPractice[];
  careerTasks: CareerTask[];
  translationComparisons: TranslationComparison[];
};

export const SMART_LEARNING_MODULES: SmartLessonModule[] = Array.from({length:12},(_,index)=>({
 lessonOrdinal:index+1,lessonTitle:`Demo lesson ${index+1}`,unitRange:"Original demonstration",
 listening:[{id:`demo-listen-${index}`,title:"Survey note",sentence:"Record the coordinate system with every survey result.",translation:"记录每项测量成果所用的坐标系统。",pauseMarked:"Record the coordinate system / with every survey result.",keywords:["coordinate system","survey result"],pronunciationTips:["Pause after system."],difficulty:"基础",source:"GeoAI Teacher original demo"}],
 careerTasks:[{id:`demo-task-${index}`,title:"Field handover",role:"Survey technician",situation:"You are handing over fictional survey results.",task:"Write two sentences stating the reference system and units.",outputMode:"书面表达",timeLimit:"3 minutes",requiredTerms:["reference system","metre"],supportPhrases:["The reference system is ..."],checklist:["Name the system","State the units"],sampleAnswer:"The reference system is the project local grid. Distances are recorded in metres.",source:"GeoAI Teacher original demo"}],
 translationComparisons:[{id:`demo-translation-${index}`,title:"Coordinate metadata",original:"Record the coordinate system with every survey result.",textbookTranslation:"记录每项测量成果所用的坐标系统。",standardTranslation:"每项测量成果均应注明其坐标系统。",limitation:"Original demo; not a textbook quotation.",sentencePattern:["Imperative verb + object"],termNotes:["coordinate system: 坐标系统"],keyChineseTerms:["坐标系统"],practicePrompt:"Translate the sentence and explain why the metadata matters.",source:"GeoAI Teacher original demo"}]
}));

export function getSmartLessonModule(lessonOrdinal: number) {
  return SMART_LEARNING_MODULES.find((lesson) => lesson.lessonOrdinal === lessonOrdinal) || SMART_LEARNING_MODULES[0];
}

export const SMART_CONTENT_TOTALS = {
  lessons: SMART_LEARNING_MODULES.length,
  listening: SMART_LEARNING_MODULES.reduce((sum, lesson) => sum + lesson.listening.length, 0),
  careerTasks: SMART_LEARNING_MODULES.reduce((sum, lesson) => sum + lesson.careerTasks.length, 0),
  translationComparisons: SMART_LEARNING_MODULES.reduce((sum, lesson) => sum + lesson.translationComparisons.length, 0),
};
