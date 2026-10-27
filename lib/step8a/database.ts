import "server-only";
import baseSchema from "../mainland/base-schema.json";

import {
  buildColdCallBroadcast,
  parseColdCallBroadcast,
} from "@/lib/step11-8/cold-call-broadcast.mjs";
import {
  COLD_CALL_QUESTIONS,
  COURSE_LESSONS,
  DEFAULT_CLASS_ID,
  DEFAULT_CLASS_NAME,
  DEFAULT_COURSE_CODE,
  DEFAULT_TERM,
  OFFICIAL_GRADE_WEIGHTS,
} from "./course-data";
import {
  generateSessionToken,
  generateTemporaryPassword,
  hashPassword,
  hashSessionToken,
  hashUserAgent,
  validateNewPassword,
  verifyPassword,
} from "./security";
import type {
  AttendanceInput,
  AttendanceStatus,
  BarrageMessage,
  ColdCallBroadcast,
  GradeCategory,
  QuestionKind,
  RosterRow,
  SafeUser,
} from "./types";

type SqlValue = string | number | null;
type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: "teacher" | "student";
  password_hash: string;
  must_change_password: number;
  disabled: number;
};

function database() {
  const binding = runtimeEnv().DB as D1Database | undefined;
  if (!binding) throw new Error("公网课堂数据库尚未连接，请稍后重试。");
  return binding;
}

function runtimeEnv() {
  return (globalThis as typeof globalThis & {
    __SURVEYING_RUNTIME_ENV__?: Record<string, unknown>;
  }).__SURVEYING_RUNTIME_ENV__ || {};
}

function runtimeValue(key: string) {
  const workerValue = runtimeEnv()[key];
  return String(workerValue ?? process.env[key] ?? "").trim();
}

function statement(sql: string, values: SqlValue[] = []) {
  const prepared = database().prepare(sql);
  return values.length ? prepared.bind(...values) : prepared;
}

async function first<T>(sql: string, values: SqlValue[] = []): Promise<T | null> {
  return (await statement(sql, values).first<T>()) ?? null;
}

async function all<T>(sql: string, values: SqlValue[] = []): Promise<T[]> {
  return (await statement(sql, values).all<T>()).results || [];
}

async function run(sql: string, values: SqlValue[] = []) {
  return statement(sql, values).run();
}

const SCHEMA_STATEMENTS = baseSchema;

let schemaPromise: Promise<void> | null = null;

async function seedLessons(classId: string, now: string) {
  await database().batch(COURSE_LESSONS.map((lesson) => database().prepare(
    "INSERT INTO lessons (id,class_id,ordinal,week_label,date_label,title,detail,unit_range,hours,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(class_id,ordinal) DO UPDATE SET week_label=excluded.week_label,date_label=excluded.date_label,title=excluded.title,detail=excluded.detail,unit_range=excluded.unit_range,hours=excluded.hours",
  ).bind(
    "lesson-" + classId + "-" + lesson.ordinal,
    classId,
    lesson.ordinal,
    lesson.weekLabel,
    lesson.dateLabel,
    lesson.title,
    lesson.detail,
    lesson.unitRange,
    lesson.hours,
    now,
  )));
}

async function initializeSchema() {
  await database().batch(SCHEMA_STATEMENTS.map((sql) => database().prepare(sql)));
  const now = new Date().toISOString();
  await run(
    "INSERT INTO classes (id,name,course_code,term,total_hours,current_lesson_ordinal,created_at,updated_at) VALUES (?,?,?,?,24,8,?,?) ON CONFLICT(id) DO NOTHING",
    [DEFAULT_CLASS_ID, DEFAULT_CLASS_NAME, DEFAULT_COURSE_CODE, DEFAULT_TERM, now, now],
  );
  await seedLessons(DEFAULT_CLASS_ID, now);
  await database().batch(COLD_CALL_QUESTIONS.map((question) => database().prepare(
    "INSERT INTO question_bank (id,source_lesson_ordinal,kind,prompt,answer,rubric,source,active) VALUES (?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET source_lesson_ordinal=excluded.source_lesson_ordinal,kind=excluded.kind,prompt=excluded.prompt,answer=excluded.answer,rubric=excluded.rubric,source=excluded.source,active=1",
  ).bind(
    question.id,
    question.sourceLessonOrdinal,
    question.kind,
    question.prompt,
    question.answer,
    question.rubric,
    question.source,
  )));
}

export async function ensureSchema() {
  schemaPromise ??= initializeSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}

function safeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

async function audit(actorUserId: string | null, action: string, entityType: string, entityId: string, summary: string) {
  await run(
    "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?)",
    [crypto.randomUUID(), actorUserId, action, entityType, entityId, summary, new Date().toISOString()],
  );
}

async function assertLessonInClass(classId: string, lessonId: string) {
  if (!await first("SELECT 1 AS found FROM lessons WHERE id=? AND class_id=? LIMIT 1", [lessonId, classId])) {
    throw new Error("课次不属于指定班级。");
  }
}

async function assertStudentInClass(classId: string, studentUserId: string) {
  if (!await first("SELECT 1 AS found FROM enrollments WHERE class_id=? AND user_id=? LIMIT 1", [classId, studentUserId])) {
    throw new Error("学生不属于指定班级。");
  }
}

export async function ensureClassroomReady() {
  await ensureSchema();
  const existing = await first<UserRow>("SELECT * FROM users WHERE role='teacher' AND disabled=0 LIMIT 1");
  if (existing) return { configured: true as const, teacher: safeUser(existing) };
  const password = runtimeValue("CLASSROOM_ADMIN_PASSWORD");
  const passwordError = validateNewPassword(password);
  if (!password || passwordError) {
    return { configured: false as const, error: password ? "CLASSROOM_ADMIN_PASSWORD配置无效：" + passwordError : "公网教师初始密码尚未配置。" };
  }
  const username = runtimeValue("CLASSROOM_ADMIN_USERNAME") || "teacher";
  const displayName = runtimeValue("CLASSROOM_ADMIN_NAME") || "课程教师";
  if (!/^[A-Za-z0-9_.-]{3,40}$/u.test(username)) return { configured: false as const, error: "教师账号格式无效。" };
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await run(
    "INSERT INTO users (id,username,display_name,role,password_hash,must_change_password,disabled,created_at,updated_at) VALUES (?,?,?,'teacher',?,1,0,?,?)",
    [id, username, displayName, await hashPassword(password), now, now],
  );
  await audit(id, "bootstrap_teacher", "user", id, "创建公网首位课程教师账号");
  return { configured: true as const, teacher: { id, username, displayName, role: "teacher" as const, mustChangePassword: true } };
}

export async function authenticateUser(username: string, password: string) {
  await ensureClassroomReady();
  const row = await first<UserRow>("SELECT * FROM users WHERE username=? COLLATE NOCASE AND disabled=0 LIMIT 1", [username.trim()]);
  if (!row || !await verifyPassword(password, row.password_hash)) return null;
  return safeUser(row);
}

export async function createDatabaseSession(userId: string, userAgent: string, maxAgeSeconds = 7 * 24 * 60 * 60) {
  await ensureSchema();
  const token = generateSessionToken();
  const tokenHash = await hashSessionToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + maxAgeSeconds * 1000);
  await database().batch([
    database().prepare("DELETE FROM sessions WHERE expires_at<=? OR revoked_at IS NOT NULL").bind(now.toISOString()),
    database().prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at,last_seen_at,user_agent_hash,revoked_at) VALUES (?,?,?,?,?,?,NULL)")
      .bind(tokenHash, userId, expires.toISOString(), now.toISOString(), now.toISOString(), await hashUserAgent(userAgent)),
  ]);
  return { token, expires, maxAgeSeconds };
}

export async function getUserBySessionToken(token: string | undefined) {
  if (!token) return null;
  await ensureSchema();
  const tokenHash = await hashSessionToken(token);
  const now = new Date().toISOString();
  const row = await first<UserRow>(
    "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.revoked_at IS NULL AND sessions.expires_at>? AND users.disabled=0 LIMIT 1",
    [tokenHash, now],
  );
  if (!row) return null;
  await run("UPDATE sessions SET last_seen_at=? WHERE token_hash=?", [now, tokenHash]);
  return safeUser(row);
}

export async function revokeDatabaseSession(token: string | undefined) {
  if (!token) return;
  await ensureSchema();
  await run("UPDATE sessions SET revoked_at=? WHERE token_hash=?", [new Date().toISOString(), await hashSessionToken(token)]);
}

export async function changeUserPassword(userId: string, currentPassword: string, nextPassword: string) {
  await ensureSchema();
  const row = await first<UserRow>("SELECT * FROM users WHERE id=? LIMIT 1", [userId]);
  if (!row || !await verifyPassword(currentPassword, row.password_hash)) return { ok: false as const, error: "当前密码不正确。" };
  const error = validateNewPassword(nextPassword);
  if (error) return { ok: false as const, error };
  if (await verifyPassword(nextPassword, row.password_hash)) return { ok: false as const, error: "新密码不能与当前密码相同。" };
  const now = new Date().toISOString();
  await database().batch([
    database().prepare("UPDATE users SET password_hash=?,must_change_password=0,updated_at=? WHERE id=?").bind(await hashPassword(nextPassword), now, userId),
    database().prepare("UPDATE sessions SET revoked_at=? WHERE user_id=?").bind(now, userId),
  ]);
  await audit(userId, "change_password", "user", userId, "用户修改登录密码并注销其他会话");
  return { ok: true as const };
}

export async function importRoster(actorUserId: string, classId: string, rows: RosterRow[]) {
  await ensureSchema();
  if (!await first("SELECT 1 AS found FROM classes WHERE id=? LIMIT 1", [classId])) throw new Error("班级不存在。");
  const now = new Date().toISOString();
  const credentials: Array<{ studentNo: string; name: string; temporaryPassword: string }> = [];
  let created = 0;
  let updated = 0;
  let enrolled = 0;
  let unchanged = 0;
  for (const row of rows) {
    const existing = await first<UserRow>("SELECT * FROM users WHERE username=? COLLATE NOCASE LIMIT 1", [row.studentNo]);
    if (existing && existing.role !== "student") throw new Error("学号“" + row.studentNo + "”与教师账号冲突。");
    const alreadyEnrolled = existing
      ? Boolean(await first("SELECT 1 AS found FROM enrollments WHERE class_id=? AND user_id=? LIMIT 1", [classId, existing.id]))
      : false;
    const userId = existing?.id || crypto.randomUUID();
    if (!existing) {
      const temporaryPassword = generateTemporaryPassword();
      await run(
        "INSERT INTO users (id,username,display_name,role,password_hash,must_change_password,disabled,created_at,updated_at) VALUES (?,?,?,'student',?,1,0,?,?)",
        [userId, row.studentNo, row.name, await hashPassword(temporaryPassword), now, now],
      );
      credentials.push({ studentNo: row.studentNo, name: row.name, temporaryPassword });
      created += 1;
    } else if (existing.display_name !== row.name || Boolean(existing.disabled)) {
      await run("UPDATE users SET display_name=?,disabled=0,updated_at=? WHERE id=?", [row.name, now, userId]);
      updated += 1;
    } else if (alreadyEnrolled) unchanged += 1;
    if (existing && !alreadyEnrolled) enrolled += 1;
    await run(
      "INSERT INTO enrollments (class_id,user_id,student_no,created_at) VALUES (?,?,?,?) ON CONFLICT(class_id,user_id) DO UPDATE SET student_no=excluded.student_no",
      [classId, userId, row.studentNo, now],
    );
  }
  await audit(actorUserId, "import_roster", "class", classId, "导入" + rows.length + "名学生");
  return { created, updated, enrolled, unchanged, credentials };
}

export async function listTeacherClasses() {
  await ensureSchema();
  const rows = await all<Record<string, string | number>>(
    "SELECT classes.id,classes.name,classes.course_code,classes.term,classes.total_hours,classes.current_lesson_ordinal,COUNT(enrollments.user_id) AS student_count FROM classes LEFT JOIN enrollments ON enrollments.class_id=classes.id GROUP BY classes.id ORDER BY classes.created_at,classes.name",
  );
  return rows.map((course) => ({
    id: String(course.id),
    name: String(course.name),
    courseCode: String(course.course_code),
    term: String(course.term),
    totalHours: Number(course.total_hours),
    currentLessonOrdinal: Number(course.current_lesson_ordinal),
    studentCount: Number(course.student_count),
    isSystemDefault: String(course.id) === DEFAULT_CLASS_ID,
  }));
}

export async function createClass(actorUserId: string, input: { name: string; courseCode: string; term: string }) {
  await ensureSchema();
  const name = input.name.trim();
  const courseCode = input.courseCode.trim();
  const term = input.term.trim();
  if (await first("SELECT id FROM classes WHERE name=? COLLATE NOCASE AND course_code=? COLLATE NOCASE AND term=? COLLATE NOCASE LIMIT 1", [name, courseCode, term])) {
    throw new Error("相同班级名称、课程代码和学期已存在，请勿重复建立。");
  }
  const id = "class-" + crypto.randomUUID();
  const now = new Date().toISOString();
  await run("INSERT INTO classes (id,name,course_code,term,total_hours,current_lesson_ordinal,created_at,updated_at) VALUES (?,?,?,?,24,1,?,?)", [id, name, courseCode, term, now, now]);
  await seedLessons(id, now);
  await audit(actorUserId, "create_class", "class", id, "创建班级：" + name);
  return getTeacherOverview(id);
}

export async function updateClassProgress(actorUserId: string, classId: string, currentLessonOrdinal: number) {
  await ensureSchema();
  const result = await run("UPDATE classes SET current_lesson_ordinal=?,updated_at=? WHERE id=?", [currentLessonOrdinal, new Date().toISOString(), classId]);
  if (!result.meta.changes) throw new Error("班级不存在。");
  await audit(actorUserId, "update_class_progress", "class", classId, "当前课次调整为第" + currentLessonOrdinal + "次课");
  return getTeacherOverview(classId);
}

export async function getTeacherOverview(classId = DEFAULT_CLASS_ID) {
  await ensureSchema();
  const course = await first<Record<string, string | number>>("SELECT * FROM classes WHERE id=? LIMIT 1", [classId]);
  if (!course) throw new Error("班级不存在。");
  const lessons = await all<Record<string, string | number>>("SELECT * FROM lessons WHERE class_id=? ORDER BY ordinal", [classId]);
  const students = await all<Record<string, string | number>>(
    "SELECT users.id,users.display_name,enrollments.student_no,COALESCE((SELECT ROUND(AVG(CASE WHEN attendance.status IN ('present','late') THEN 100 ELSE 0 END),1) FROM attendance WHERE attendance.student_user_id=users.id AND attendance.class_id=enrollments.class_id),100) AS attendance_rate,COALESCE((SELECT ROUND(AVG(question_records.score),1) FROM question_records WHERE question_records.student_user_id=users.id AND question_records.class_id=enrollments.class_id),0) AS question_score FROM enrollments JOIN users ON users.id=enrollments.user_id WHERE enrollments.class_id=? AND users.disabled=0 ORDER BY enrollments.student_no",
    [classId],
  );
  const previousCount = await first<{ total: number }>("SELECT COUNT(*) AS total FROM question_bank WHERE source_lesson_ordinal=? AND active=1", [Math.max(1, Number(course.current_lesson_ordinal) - 1)]);
  return {
    course: {
      id: String(course.id),
      name: String(course.name),
      courseCode: String(course.course_code),
      term: String(course.term),
      totalHours: Number(course.total_hours),
      currentLessonOrdinal: Number(course.current_lesson_ordinal),
      isSystemDefault: String(course.id) === DEFAULT_CLASS_ID,
    },
    lessons: lessons.map((lesson) => ({
      id: String(lesson.id),
      ordinal: Number(lesson.ordinal),
      weekLabel: String(lesson.week_label),
      dateLabel: String(lesson.date_label),
      title: String(lesson.title),
      detail: String(lesson.detail),
      unitRange: String(lesson.unit_range),
      hours: Number(lesson.hours),
    })),
    students: students.map((student) => ({
      id: String(student.id),
      studentNo: String(student.student_no),
      name: String(student.display_name),
      attendanceRate: Number(student.attendance_rate),
      questionScore: Number(student.question_score),
    })),
    classes: await listTeacherClasses(),
    previousQuestionCount: Number(previousCount?.total || 0),
    officialWeights: OFFICIAL_GRADE_WEIGHTS,
  };
}

type RosterDeletionPreview = {
  classId: string;
  studentCount: number;
  attendanceRecords: number;
  questionRecords: number;
  gradeRecords: number;
  learningRecords: number;
  accountsDisabled: number;
};
type ClassDeletionPreview = RosterDeletionPreview & { className: string; lessonCount: number };

async function rosterUserIds(classId: string, requestedIds?: string[]) {
  if (!await first("SELECT 1 AS found FROM classes WHERE id=? LIMIT 1", [classId])) throw new Error("班级不存在。");
  if (!requestedIds) return (await all<{ user_id: string }>("SELECT user_id FROM enrollments WHERE class_id=? ORDER BY student_no", [classId])).map((row) => row.user_id);
  const ids = [...new Set(requestedIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new Error("请至少选择一名学生。");
  if (ids.length > 500) throw new Error("一次最多删除500名学生。");
  const marks = ids.map(() => "?").join(",");
  const existing = await all<{ user_id: string }>(`SELECT user_id FROM enrollments WHERE class_id=? AND user_id IN (${marks})`, [classId, ...ids]);
  if (existing.length !== ids.length) throw new Error("所选学生中包含不属于当前班级的账号，请刷新页面后重试。");
  return ids;
}

async function countSelected(table: "attendance" | "question_records" | "grades" | "learning_attempts", classId: string, ids: string[]) {
  if (!ids.length) return 0;
  const marks = ids.map(() => "?").join(",");
  const row = await first<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table} WHERE class_id=? AND student_user_id IN (${marks})`, [classId, ...ids]);
  return Number(row?.total || 0);
}

export async function getRosterDeletionPreview(classId: string, studentUserIds?: string[]): Promise<RosterDeletionPreview> {
  await ensureSchema();
  const ids = await rosterUserIds(classId, studentUserIds);
  if (!ids.length) return { classId, studentCount: 0, attendanceRecords: 0, questionRecords: 0, gradeRecords: 0, learningRecords: 0, accountsDisabled: 0 };
  const marks = ids.map(() => "?").join(",");
  const accountRow = await first<{ total: number }>(`SELECT COUNT(*) AS total FROM users WHERE id IN (${marks}) AND NOT EXISTS (SELECT 1 FROM enrollments other_enrollments WHERE other_enrollments.user_id=users.id AND other_enrollments.class_id<>?)`, [...ids, classId]);
  return {
    classId,
    studentCount: ids.length,
    attendanceRecords: await countSelected("attendance", classId, ids),
    questionRecords: await countSelected("question_records", classId, ids),
    gradeRecords: await countSelected("grades", classId, ids),
    learningRecords: await countSelected("learning_attempts", classId, ids),
    accountsDisabled: Number(accountRow?.total || 0),
  };
}

export async function removeStudentsFromClass(actorUserId: string, classId: string, studentUserIds?: string[]) {
  await ensureSchema();
  const ids = await rosterUserIds(classId, studentUserIds);
  const preview = await getRosterDeletionPreview(classId, ids);
  if (!ids.length) return { ...preview, removed: 0 };
  const marks = ids.map(() => "?").join(",");
  await database().batch([
    database().prepare(`DELETE FROM attendance WHERE class_id=? AND student_user_id IN (${marks})`).bind(classId, ...ids),
    database().prepare(`DELETE FROM question_records WHERE class_id=? AND student_user_id IN (${marks})`).bind(classId, ...ids),
    database().prepare(`DELETE FROM grades WHERE class_id=? AND student_user_id IN (${marks})`).bind(classId, ...ids),
    database().prepare(`DELETE FROM learning_attempts WHERE class_id=? AND student_user_id IN (${marks})`).bind(classId, ...ids),
    database().prepare(`DELETE FROM enrollments WHERE class_id=? AND user_id IN (${marks})`).bind(classId, ...ids),
  ]);
  const orphaned = await all<{ id: string }>(`SELECT id FROM users WHERE id IN (${marks}) AND role='student' AND NOT EXISTS (SELECT 1 FROM enrollments WHERE enrollments.user_id=users.id)`, ids);
  if (orphaned.length) {
    const orphanIds = orphaned.map((row) => row.id);
    const orphanMarks = orphanIds.map(() => "?").join(",");
    const now = new Date().toISOString();
    await database().batch([
      database().prepare(`UPDATE users SET disabled=1,updated_at=? WHERE id IN (${orphanMarks})`).bind(now, ...orphanIds),
      database().prepare(`UPDATE sessions SET revoked_at=? WHERE user_id IN (${orphanMarks}) AND revoked_at IS NULL`).bind(now, ...orphanIds),
    ]);
  }
  await audit(actorUserId, "remove_students", "class", classId, "移除" + ids.length + "名学生");
  return { ...preview, removed: ids.length };
}

export async function getClassDeletionPreview(classId: string): Promise<ClassDeletionPreview> {
  await ensureSchema();
  const course = await first<{ id: string; name: string }>("SELECT id,name FROM classes WHERE id=? LIMIT 1", [classId]);
  if (!course) throw new Error("班级不存在。");
  const roster = await getRosterDeletionPreview(classId);
  const lesson = await first<{ total: number }>("SELECT COUNT(*) AS total FROM lessons WHERE class_id=?", [classId]);
  return { ...roster, className: course.name, lessonCount: Number(lesson?.total || 0) };
}

export async function deleteClass(actorUserId: string, classId: string) {
  if (classId === DEFAULT_CLASS_ID) throw new Error("系统内置默认班级不能删除；如不再使用，可清空该班学生名单。");
  await ensureSchema();
  const preview = await getClassDeletionPreview(classId);
  const studentIds = await rosterUserIds(classId);
  const result = await run("DELETE FROM classes WHERE id=?", [classId]);
  if (!result.meta.changes) throw new Error("班级不存在。");
  if (studentIds.length) {
    const marks = studentIds.map(() => "?").join(",");
    const orphaned = await all<{ id: string }>(`SELECT id FROM users WHERE id IN (${marks}) AND role='student' AND NOT EXISTS (SELECT 1 FROM enrollments WHERE enrollments.user_id=users.id)`, studentIds);
    if (orphaned.length) {
      const ids = orphaned.map((row) => row.id);
      const orphanMarks = ids.map(() => "?").join(",");
      await run(`UPDATE users SET disabled=1,updated_at=? WHERE id IN (${orphanMarks})`, [new Date().toISOString(), ...ids]);
    }
  }
  await audit(actorUserId, "delete_class", "class", classId, "删除班级“" + preview.className + "”");
  const nextClassId = (await listTeacherClasses())[0]?.id || DEFAULT_CLASS_ID;
  return { deletedClassId: classId, nextClassId, preview };
}

export async function getAttendance(classId: string, lessonId: string) {
  await ensureSchema();
  const rows = await all<Record<string, string>>(
    "SELECT users.id AS student_user_id,users.display_name,enrollments.student_no,COALESCE(attendance.status,'present') AS status,COALESCE(attendance.note,'') AS note FROM enrollments JOIN users ON users.id=enrollments.user_id LEFT JOIN attendance ON attendance.student_user_id=users.id AND attendance.lesson_id=? WHERE enrollments.class_id=? AND users.disabled=0 ORDER BY enrollments.student_no",
    [lessonId, classId],
  );
  return rows.map((item) => ({ studentUserId: item.student_user_id, studentNo: item.student_no, name: item.display_name, status: item.status as AttendanceStatus, note: item.note }));
}

export async function saveAttendance(actorUserId: string, classId: string, lessonId: string, entries: AttendanceInput[]) {
  await ensureSchema();
  await assertLessonInClass(classId, lessonId);
  const allowed = new Set((await all<{ user_id: string }>("SELECT user_id FROM enrollments WHERE class_id=?", [classId])).map((row) => row.user_id));
  const now = new Date().toISOString();
  const statements = entries.map((entry) => {
    if (!allowed.has(entry.studentUserId)) throw new Error("点名名单中含有非本班学生。");
    return database().prepare("INSERT INTO attendance (id,class_id,lesson_id,student_user_id,status,note,recorded_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(lesson_id,student_user_id) DO UPDATE SET status=excluded.status,note=excluded.note,recorded_by=excluded.recorded_by,updated_at=excluded.updated_at")
      .bind(crypto.randomUUID(), classId, lessonId, entry.studentUserId, entry.status, (entry.note || "").slice(0, 200), actorUserId, now, now);
  });
  if (statements.length) await database().batch(statements);
  await audit(actorUserId, "save_attendance", "lesson", lessonId, "保存" + entries.length + "条点名记录");
  return getAttendance(classId, lessonId);
}

export async function drawColdCall(classId: string, currentLessonId: string, kind?: QuestionKind) {
  await ensureSchema();
  await assertLessonInClass(classId, currentLessonId);
  const currentLesson = await first<{ ordinal: number }>("SELECT ordinal FROM lessons WHERE id=? AND class_id=? LIMIT 1", [currentLessonId, classId]);
  if (!currentLesson || currentLesson.ordinal <= 1) throw new Error("第一节课没有上一节课可供随机提问，请先把教学进度调整到第2次课或以后。");
  const attendanceCount = await first<{ total: number }>("SELECT COUNT(*) AS total FROM attendance WHERE lesson_id=?", [currentLessonId]);
  const students = await all<{ id: string; display_name: string; student_no: string; attendance_status: AttendanceStatus; question_count: number }>(
    "SELECT users.id,users.display_name,enrollments.student_no,COALESCE(attendance.status,'present') AS attendance_status,COUNT(question_records.id) AS question_count FROM enrollments JOIN users ON users.id=enrollments.user_id LEFT JOIN attendance ON attendance.student_user_id=users.id AND attendance.lesson_id=? LEFT JOIN question_records ON question_records.student_user_id=users.id AND question_records.class_id=enrollments.class_id WHERE enrollments.class_id=? AND users.disabled=0 AND COALESCE(attendance.status,'present') IN ('present','late') GROUP BY users.id,users.display_name,enrollments.student_no,attendance.status ORDER BY question_count ASC,enrollments.student_no ASC",
    [currentLessonId, classId],
  );
  if (!students.length) throw new Error("当前没有可抽取的已到学生。");
  const minimum = Math.min(...students.map((student) => Number(student.question_count)));
  const pool = students.filter((student) => Number(student.question_count) === minimum);
  const student = pool[Math.floor(Math.random() * pool.length)];
  const values: SqlValue[] = [currentLesson.ordinal - 1];
  let sql = "SELECT id,kind,prompt,rubric,source FROM question_bank WHERE source_lesson_ordinal=? AND active=1";
  if (kind) { sql += " AND kind=?"; values.push(kind); }
  const questions = await all<{ id: string; kind: QuestionKind; prompt: string; rubric: string; source: string }>(sql, values);
  if (!questions.length) throw new Error("上一节课尚未配置可用提问题库。");
  return {
    attendanceSaved: Number(attendanceCount?.total || 0) > 0,
    sourceLessonOrdinal: currentLesson.ordinal - 1,
    student: { id: student.id, name: student.display_name, studentNo: student.student_no, attendanceStatus: student.attendance_status, priorQuestionCount: Number(student.question_count) },
    question: questions[Math.floor(Math.random() * questions.length)],
  };
}

export async function publishColdCallBroadcast(input: {
  actorUserId: string;
  classId: string;
  lessonId: string;
  draw: Awaited<ReturnType<typeof drawColdCall>>;
}) {
  await ensureSchema();
  await assertLessonInClass(input.classId, input.lessonId);
  await assertStudentInClass(input.classId, input.draw.student.id);
  const event = buildColdCallBroadcast({ id: crypto.randomUUID(), classId: input.classId, lessonId: input.lessonId, student: input.draw.student, question: input.draw.question }) as ColdCallBroadcast;
  await database().batch([
    database().prepare("DELETE FROM classroom_live_events WHERE expires_at<=? OR (class_id=? AND event_type='cold_call')").bind(event.createdAt, input.classId),
    database().prepare("INSERT INTO classroom_live_events (id,class_id,lesson_id,event_type,payload_json,created_by,created_at,expires_at) VALUES (?,?,?,'cold_call',?,?,?,?)")
      .bind(event.id, input.classId, input.lessonId, JSON.stringify(event), input.actorUserId, event.createdAt, event.expiresAt),
  ]);
  await audit(input.actorUserId, "broadcast_cold_call", "classroom_live_event", event.id, "点名" + event.student.name + "回答课堂问题");
  return event;
}

export async function getLatestColdCallBroadcastForUser(user: SafeUser): Promise<ColdCallBroadcast | null> {
  await ensureSchema();
  const now = new Date().toISOString();
  await run("DELETE FROM classroom_live_events WHERE expires_at<=?", [now]);
  const row = user.role === "student"
    ? await first<{ payload_json: string }>("SELECT classroom_live_events.payload_json FROM classroom_live_events JOIN enrollments ON enrollments.class_id=classroom_live_events.class_id WHERE classroom_live_events.event_type='cold_call' AND classroom_live_events.expires_at>? AND enrollments.user_id=? ORDER BY classroom_live_events.created_at DESC LIMIT 1", [now, user.id])
    : await first<{ payload_json: string }>("SELECT payload_json FROM classroom_live_events WHERE event_type='cold_call' AND expires_at>? ORDER BY created_at DESC LIMIT 1", [now]);
  if (!row) return null;
  try { return parseColdCallBroadcast(JSON.parse(row.payload_json)) as ColdCallBroadcast | null; } catch { return null; }
}

export async function revealColdCallAnswer(questionId: string) {
  await ensureSchema();
  const row = await first<Record<string, string>>("SELECT id,kind,prompt,answer,rubric,source FROM question_bank WHERE id=? AND active=1 LIMIT 1", [questionId]);
  if (!row) throw new Error("题目不存在或已停用。");
  return row;
}

export async function getColdCallEvaluationContext(eventId: string) {
  await ensureSchema();
  const row = await first<{ payload_json: string; class_id: string; lesson_id: string }>(
    "SELECT payload_json,class_id,lesson_id FROM classroom_live_events WHERE id=? AND event_type='cold_call' LIMIT 1",
    [eventId],
  );
  if (!row) throw new Error("该课堂提问已经结束，请重新抽取题目。");
  let event: ColdCallBroadcast | null = null;
  try { event = parseColdCallBroadcast(JSON.parse(row.payload_json)) as ColdCallBroadcast | null; } catch { event = null; }
  if (!event) throw new Error("课堂提问数据不完整，请重新抽取题目。");
  const question = await first<{ id: string; prompt: string; answer: string; rubric: string; source: string }>(
    "SELECT id,prompt,answer,rubric,source FROM question_bank WHERE id=? AND active=1 LIMIT 1",
    [event.question.id],
  );
  if (!question) throw new Error("题目不存在或已停用。");
  const existing = await first<{ evaluation_json: string; response_text: string; timed_out: number; score: number }>(
    "SELECT evaluation_json,response_text,timed_out,score FROM cold_call_attempts WHERE event_id=? LIMIT 1",
    [eventId],
  );
  let existingEvaluation: Record<string, unknown> | null = null;
  if (existing) {
    try { existingEvaluation = JSON.parse(existing.evaluation_json) as Record<string, unknown>; } catch { existingEvaluation = null; }
  }
  return {
    event,
    question,
    existing: existing ? {
      evaluation: existingEvaluation,
      responseText: existing.response_text,
      timedOut: Boolean(existing.timed_out),
      score: Number(existing.score),
    } : null,
  };
}

export async function saveColdCallAttempt(input: {
  actorUserId: string;
  event: ColdCallBroadcast;
  responseText: string;
  evaluation: Record<string, unknown>;
  timedOut: boolean;
}) {
  await ensureSchema();
  const now = new Date().toISOString();
  await run(
    "INSERT INTO cold_call_attempts (id,event_id,class_id,lesson_id,student_user_id,question_id,response_text,evaluation_json,score,timed_out,submitted_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING",
    [
      crypto.randomUUID(),
      input.event.id,
      input.event.classId,
      input.event.lessonId,
      input.event.student.id,
      input.event.question.id,
      input.responseText.slice(0, 2_000),
      JSON.stringify(input.evaluation),
      Number(input.evaluation.score || 0),
      input.timedOut ? 1 : 0,
      input.actorUserId,
      now,
    ],
  );
  const saved = await first<{ evaluation_json: string; response_text: string; timed_out: number; score: number }>(
    "SELECT evaluation_json,response_text,timed_out,score FROM cold_call_attempts WHERE event_id=? LIMIT 1",
    [input.event.id],
  );
  if (!saved) throw new Error("课堂回答保存失败，请重试。");
  await audit(input.actorUserId, input.timedOut ? "cold_call_timeout" : "evaluate_cold_call_answer", "classroom_live_event", input.event.id, input.timedOut ? "课堂提问建议回答时间未回答" : "AI已生成课堂回答纠错建议");
  return {
    evaluation: JSON.parse(saved.evaluation_json) as Record<string, unknown>,
    responseText: saved.response_text,
    timedOut: Boolean(saved.timed_out),
    score: Number(saved.score),
  };
}

export async function recordColdCallScore(input: { actorUserId: string; classId: string; lessonId: string; studentUserId: string; questionId: string; score: number; teacherNote?: string }) {
  await ensureSchema();
  await assertLessonInClass(input.classId, input.lessonId);
  await assertStudentInClass(input.classId, input.studentUserId);
  if (!await first("SELECT 1 AS found FROM question_bank WHERE id=? AND active=1 LIMIT 1", [input.questionId])) throw new Error("题目不存在或已停用。");
  const id = crypto.randomUUID();
  await run(
    "INSERT INTO question_records (id,class_id,lesson_id,student_user_id,question_id,score,teacher_note,recorded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, input.classId, input.lessonId, input.studentUserId, input.questionId, input.score, (input.teacherNote || "").slice(0, 300), input.actorUserId, new Date().toISOString()],
  );
  await audit(input.actorUserId, "record_cold_call_score", "question_record", id, "课堂提问得分：" + input.score + "/10");
  return { id, score: input.score };
}

function publicBarrage(row: Record<string, string>): BarrageMessage {
  return {
    id: row.id,
    classId: row.class_id,
    className: row.class_name || "当前班级",
    anonymousLabel: "匿名学生",
    content: row.content,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function submitAnonymousBarrage(input: { studentUserId: string; classId: string; content: string }) {
  await ensureSchema();
  const enrollment = await first<{ class_name: string }>(
    "SELECT classes.name AS class_name FROM enrollments JOIN classes ON classes.id=enrollments.class_id WHERE enrollments.class_id=? AND enrollments.user_id=? LIMIT 1",
    [input.classId, input.studentUserId],
  );
  if (!enrollment) throw new Error("当前账号不属于所选班级。");
  const content = input.content.replace(/\s+/gu, " ").trim().slice(0, 80);
  if (content.length < 1) throw new Error("请输入弹幕内容。");
  const latest = await first<{ created_at: string }>(
    "SELECT created_at FROM classroom_barrage WHERE sender_user_id=? ORDER BY created_at DESC LIMIT 1",
    [input.studentUserId],
  );
  if (latest && Date.now() - new Date(latest.created_at).getTime() < 5_000) {
    throw new Error("发送太快，请5秒后再发下一条。");
  }
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    classId: input.classId,
    className: enrollment.class_name,
    content,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5 * 60 * 1_000).toISOString(),
  };
  await run(
    "INSERT INTO classroom_barrage (id,class_id,sender_user_id,content,created_at,expires_at,cleared_at,cleared_by) VALUES (?,?,?,?,?,?,NULL,NULL)",
    [row.id, row.classId, input.studentUserId, row.content, row.createdAt, row.expiresAt],
  );
  await audit(input.studentUserId, "send_anonymous_barrage", "classroom_barrage", row.id, "学生发送匿名课堂弹幕");
  return publicBarrage({
    id: row.id,
    class_id: row.classId,
    class_name: row.className,
    content: row.content,
    created_at: row.createdAt,
    expires_at: row.expiresAt,
  });
}

export async function listActiveBarrage(classId?: string, limit = 20) {
  await ensureSchema();
  const now = new Date().toISOString();
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = classId
    ? await all<Record<string, string>>(
      `SELECT classroom_barrage.id,classroom_barrage.class_id,classes.name AS class_name,classroom_barrage.content,classroom_barrage.created_at,classroom_barrage.expires_at FROM classroom_barrage JOIN classes ON classes.id=classroom_barrage.class_id WHERE classroom_barrage.class_id=? AND classroom_barrage.expires_at>? AND classroom_barrage.cleared_at IS NULL ORDER BY classroom_barrage.created_at ASC LIMIT ${boundedLimit}`,
      [classId, now],
    )
    : await all<Record<string, string>>(
      `SELECT classroom_barrage.id,classroom_barrage.class_id,classes.name AS class_name,classroom_barrage.content,classroom_barrage.created_at,classroom_barrage.expires_at FROM classroom_barrage JOIN classes ON classes.id=classroom_barrage.class_id WHERE classroom_barrage.expires_at>? AND classroom_barrage.cleared_at IS NULL ORDER BY classroom_barrage.created_at ASC LIMIT ${boundedLimit}`,
      [now],
    );
  return rows.map(publicBarrage);
}

export async function clearAnonymousBarrage(input: { actorUserId: string; id?: string; classId?: string }) {
  await ensureSchema();
  const now = new Date().toISOString();
  if (input.id) {
    await run("UPDATE classroom_barrage SET cleared_at=?,cleared_by=? WHERE id=?", [now, input.actorUserId, input.id]);
    await audit(input.actorUserId, "clear_barrage", "classroom_barrage", input.id, "教师清除一条匿名弹幕");
    return { cleared: 1 };
  }
  if (!input.classId) throw new Error("缺少需要清屏的班级。");
  const result = await run(
    "UPDATE classroom_barrage SET cleared_at=?,cleared_by=? WHERE class_id=? AND cleared_at IS NULL",
    [now, input.actorUserId, input.classId],
  );
  await audit(input.actorUserId, "clear_class_barrage", "class", input.classId, "教师清除当前班级匿名弹幕");
  return { cleared: Number(result.meta.changes || 0) };
}

export async function getGradebook(classId: string) {
  await ensureSchema();
  const rows = await all<{ id: string; display_name: string; student_no: string; category: GradeCategory | null; raw_score: number | null }>(
    "SELECT users.id,users.display_name,enrollments.student_no,grades.category,grades.raw_score FROM enrollments JOIN users ON users.id=enrollments.user_id LEFT JOIN grades ON grades.student_user_id=users.id AND grades.class_id=enrollments.class_id WHERE enrollments.class_id=? AND users.disabled=0 ORDER BY enrollments.student_no",
    [classId],
  );
  const map = new Map<string, { id: string; name: string; studentNo: string; scores: Record<GradeCategory, number | null> }>();
  for (const row of rows) {
    const student = map.get(row.id) || { id: row.id, name: row.display_name, studentNo: row.student_no, scores: { homework: null, seminar: null, practice: null, final_project: null } };
    if (row.category) student.scores[row.category] = row.raw_score;
    map.set(row.id, student);
  }
  const { automaticScores } = await import('../step20/store.mjs');
  for(const row of await automaticScores(classId)){const student=map.get(row.student_user_id);const category=row.category as GradeCategory;if(student && student.scores[category]===null)student.scores[category]=Number(row.score);}
  return [...map.values()].map((student) => {
    const total = OFFICIAL_GRADE_WEIGHTS.reduce((sum, item) => sum + (student.scores[item.category] === null ? 0 : Number(student.scores[item.category]) * item.weight / 100), 0);
    return { ...student, total: Number(total.toFixed(1)) };
  });
}

export async function updateGrade(input: { actorUserId: string; classId: string; studentUserId: string; category: GradeCategory; rawScore: number; note?: string }) {
  await ensureSchema();
  await assertStudentInClass(input.classId, input.studentUserId);
  await run(
    "INSERT INTO grades (id,class_id,student_user_id,category,raw_score,note,recorded_by,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(class_id,student_user_id,category) DO UPDATE SET raw_score=excluded.raw_score,note=excluded.note,recorded_by=excluded.recorded_by,updated_at=excluded.updated_at",
    [crypto.randomUUID(), input.classId, input.studentUserId, input.category, input.rawScore, (input.note || "").slice(0, 300), input.actorUserId, new Date().toISOString()],
  );
  await audit(input.actorUserId, "update_grade", "student", input.studentUserId, "更新成绩项" + input.category + "：" + input.rawScore);
}

export async function getStudentOverview(userId: string) {
  await ensureSchema();
  const enrollment = await first<Record<string, string | number>>(
    "SELECT classes.*,enrollments.student_no FROM enrollments JOIN classes ON classes.id=enrollments.class_id WHERE enrollments.user_id=? LIMIT 1",
    [userId],
  );
  if (!enrollment) throw new Error("当前学生尚未加入班级。");
  const attendance = await all("SELECT lessons.ordinal,lessons.title,attendance.status,attendance.note FROM lessons LEFT JOIN attendance ON attendance.lesson_id=lessons.id AND attendance.student_user_id=? WHERE lessons.class_id=? ORDER BY lessons.ordinal", [userId, String(enrollment.id)]);
  const questionRecords = await all("SELECT question_records.score,question_records.teacher_note,question_records.created_at,question_bank.prompt,question_bank.source FROM question_records JOIN question_bank ON question_bank.id=question_records.question_id WHERE question_records.student_user_id=? AND question_records.class_id=? ORDER BY question_records.created_at DESC LIMIT 20", [userId, String(enrollment.id)]);
  const currentLesson = await first("SELECT * FROM lessons WHERE class_id=? AND ordinal=? LIMIT 1", [String(enrollment.id), Number(enrollment.current_lesson_ordinal)]);
  return {
    course: { id: String(enrollment.id), name: String(enrollment.name), courseCode: String(enrollment.course_code), term: String(enrollment.term), currentLessonOrdinal: Number(enrollment.current_lesson_ordinal) },
    studentNo: String(enrollment.student_no),
    currentLesson,
    attendance,
    questionRecords,
    grades: (await getGradebook(String(enrollment.id))).find((row) => row.id === userId) || null,
    officialWeights: OFFICIAL_GRADE_WEIGHTS,
  };
}

export type LearningAttemptInput = {
  lessonOrdinal: number;
  moduleType: "speaking" | "career" | "translation";
  itemId: string;
  score: number;
  responseText?: string;
  feedback?: string;
};

async function primaryEnrollment(userId: string) {
  return first<{ class_id: string; current_lesson_ordinal: number }>(
    "SELECT classes.id AS class_id,classes.current_lesson_ordinal FROM enrollments JOIN classes ON classes.id=enrollments.class_id WHERE enrollments.user_id=? ORDER BY classes.created_at LIMIT 1",
    [userId],
  );
}

export async function saveLearningAttempt(studentUserId: string, input: LearningAttemptInput) {
  await ensureSchema();
  const enrollment = await primaryEnrollment(studentUserId);
  if (!enrollment) throw new Error("当前学生尚未加入班级。");
  const lessonOrdinal = Math.max(1, Math.min(12, Math.round(input.lessonOrdinal)));
  const score = Math.max(0, Math.min(100, Number(input.score)));
  if (!Number.isFinite(score)) throw new Error("练习得分格式无效。");
  const itemId = input.itemId.trim().slice(0, 120);
  if (!itemId) throw new Error("练习项目编号不能为空。");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await run(
    "INSERT INTO learning_attempts (id,class_id,student_user_id,lesson_ordinal,module_type,item_id,score,response_text,feedback,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id, enrollment.class_id, studentUserId, lessonOrdinal, input.moduleType, itemId, score, (input.responseText || "").slice(0, 5000), (input.feedback || "").slice(0, 1200), now],
  );
  return { id, createdAt: now };
}

export async function getStudentLearningProgress(studentUserId: string) {
  await ensureSchema();
  const enrollment = await primaryEnrollment(studentUserId);
  if (!enrollment) throw new Error("当前学生尚未加入班级。");
  const rows = await all<{ lesson_ordinal: number; module_type: "speaking" | "career" | "translation"; attempts: number; best_score: number; average_score: number; latest_at: string }>(
    "SELECT lesson_ordinal,module_type,COUNT(*) AS attempts,ROUND(MAX(score),1) AS best_score,ROUND(AVG(score),1) AS average_score,MAX(created_at) AS latest_at FROM learning_attempts WHERE class_id=? AND student_user_id=? GROUP BY lesson_ordinal,module_type ORDER BY lesson_ordinal,module_type",
    [enrollment.class_id, studentUserId],
  );
  const recent = await all("SELECT id,lesson_ordinal,module_type,item_id,score,response_text,feedback,created_at FROM learning_attempts WHERE class_id=? AND student_user_id=? ORDER BY created_at DESC LIMIT 20", [enrollment.class_id, studentUserId]);
  return {
    currentLessonOrdinal: enrollment.current_lesson_ordinal,
    summary: rows.map((row) => ({ lessonOrdinal: Number(row.lesson_ordinal), moduleType: row.module_type, attempts: Number(row.attempts), bestScore: Number(row.best_score), averageScore: Number(row.average_score), latestAt: row.latest_at })),
    recent,
  };
}

export async function getClassLearningSummary(classId: string) {
  await ensureSchema();
  const rows = await all<{ module_type: string; attempts: number; active_students: number; average_score: number }>(
    "SELECT module_type,COUNT(*) AS attempts,COUNT(DISTINCT student_user_id) AS active_students,ROUND(AVG(score),1) AS average_score FROM learning_attempts WHERE class_id=? GROUP BY module_type ORDER BY module_type",
    [classId],
  );
  return rows.map((row) => ({ moduleType: row.module_type, attempts: Number(row.attempts), activeStudents: Number(row.active_students), averageScore: Number(row.average_score) }));
}

export function closeClassroomDatabaseForTests() {
  schemaPromise = null;
}
