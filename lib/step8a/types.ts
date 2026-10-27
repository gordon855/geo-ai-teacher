export type UserRole = "teacher" | "student";
export type AttendanceStatus = "present" | "late" | "leave" | "absent";
export type QuestionKind = "terminology" | "syntax" | "concept";
export type GradeCategory = "homework" | "seminar" | "practice" | "final_project";

export type SafeUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  mustChangePassword: boolean;
};

export type RosterRow = {
  studentNo: string;
  name: string;
  className?: string;
};

export type LessonSeed = {
  ordinal: number;
  weekLabel: string;
  dateLabel: string;
  title: string;
  detail: string;
  unitRange: string;
  hours: number;
};

export type ColdCallQuestionSeed = {
  id: string;
  sourceLessonOrdinal: number;
  kind: QuestionKind;
  prompt: string;
  answer: string;
  rubric: string;
  source: string;
};

export type ColdCallBroadcast = {
  id: string;
  classId: string;
  lessonId: string;
  student: { id: string; name: string; studentNo: string };
  question: {
    id: string;
    kind: QuestionKind;
    prompt: string;
    source: string;
  };
  spokenText: string;
  answerWindowSeconds: number;
  createdAt: string;
  expiresAt: string;
};

export type BarrageMessage = {
  id: string;
  classId: string;
  className: string;
  anonymousLabel: "匿名学生";
  content: string;
  createdAt: string;
  expiresAt: string;
};

export type AttendanceInput = {
  studentUserId: string;
  status: AttendanceStatus;
  note?: string;
};

export type GradeWeight = {
  category: GradeCategory;
  label: string;
  weight: number;
};
