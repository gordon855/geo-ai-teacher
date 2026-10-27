import "server-only";

import { ensureSchema } from "../step8a/database";
import { gradeDocxAssignment } from "../step14-1/docx-auto-grading.mjs";

export const MAX_WORD_BYTES = 20 * 1024 * 1024;
const WORD_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function runtime() {
  return globalThis.__SURVEYING_RUNTIME_ENV__ || {};
}

function db() {
  if (!runtime().DB) throw new Error("作业数据库尚未连接。");
  return runtime().DB;
}

function bucket() {
  if (!runtime().BUCKET) throw new Error("作业文件存储尚未连接。");
  return runtime().BUCKET;
}

function safeName(value, fallback = "作业.docx") {
  const name = String(value || fallback).split(/[\\/]/u).at(-1) || fallback;
  return name.replace(/[<>:"|?*\u0000-\u001f]/gu, "_").slice(0, 180);
}

function contentDisposition(disposition, fileName, asciiFallback) {
  const encoded = encodeURIComponent(fileName).replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function containsAscii(bytes, text) {
  const marker = new TextEncoder().encode(text);
  outer: for (let index = 0; index <= bytes.length - marker.length; index += 1) {
    for (let offset = 0; offset < marker.length; offset += 1) if (bytes[index + offset] !== marker[offset]) continue outer;
    return true;
  }
  return false;
}

function validateDocx(bytes, originalName) {
  if (!/\.docx$/iu.test(originalName)) throw new Error("只支持Word的.docx格式。");
  if (!bytes.length) throw new Error("Word文件为空，请重新选择。");
  if (bytes.length > MAX_WORD_BYTES) throw new Error("单个Word文件不能超过20MB。");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || !containsAscii(bytes, "word/document.xml")) throw new Error("该文件不是有效的Word .docx文档。");
}

async function putDocx(objectKey, bytes, originalName, metadata = {}) {
  await bucket().put(objectKey, bytes, {
    httpMetadata: { contentType: WORD_CONTENT_TYPE, contentDisposition: contentDisposition("attachment", originalName, "course-document.docx") },
    customMetadata: { originalName, ...metadata },
  });
}

function assignmentDto(row) {
  return {
    id: String(row.id),
    classId: String(row.class_id),
    className: String(row.class_name || ""),
    title: String(row.title),
    instructions: String(row.instructions || ""),
    dueAt: row.due_at ? String(row.due_at) : null,
    attachmentName: row.attachment_name ? String(row.attachment_name) : null,
    attachmentSize: Number(row.attachment_size || 0),
    maxScore: 100,
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function submissionDto(row) {
  return {
    id: String(row.id),
    assignmentId: String(row.assignment_id),
    studentUserId: String(row.student_user_id),
    studentName: String(row.student_name || ""),
    studentNo: String(row.student_no || ""),
    originalName: String(row.original_name),
    size: Number(row.size),
    submittedAt: String(row.submitted_at),
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    feedback: String(row.feedback || ""),
    gradedAt: row.graded_at ? String(row.graded_at) : null,
  };
}

export async function createAssignment({ classId, title, instructions, dueAt, file, teacher, taskModule = "homework" }) {
  await ensureSchema();
  const course = await db().prepare("SELECT id,name FROM classes WHERE id=? LIMIT 1").bind(classId).first();
  if (!course) throw new Error("指定班级不存在。");
  const id = crypto.randomUUID();
  let attachmentName = null;
  let attachmentKey = null;
  let attachmentSize = 0;
  if (file) {
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    attachmentName = safeName(file.originalName, "教师作业要求.docx");
    validateDocx(bytes, attachmentName);
    attachmentKey = `assignments/${id}/teacher/${crypto.randomUUID()}.docx`;
    attachmentSize = bytes.length;
    await putDocx(attachmentKey, bytes, attachmentName, { kind: "assignment", assignmentId: id });
  }
  const now = new Date().toISOString();
  try {
    await db().prepare(
      "INSERT INTO assignments (id,class_id,title,instructions,due_at,attachment_name,attachment_key,attachment_size,max_score,status,created_by,created_at,updated_at,task_module) VALUES (?,?,?,?,?,?,?,?,100,'published',?,?,?,?)",
    ).bind(id, classId, String(title).slice(0, 160), String(instructions || "").slice(0, 5_000), dueAt || null, attachmentName, attachmentKey, attachmentSize, teacher.id, now, now, taskModule).run();
  } catch (error) {
    if (attachmentKey) await bucket().delete(attachmentKey).catch(() => null);
    throw error;
  }
  return { ...assignmentDto({ id, class_id: classId, class_name: course.name, title, instructions, due_at: dueAt || null, attachment_name: attachmentName, attachment_size: attachmentSize, status: "published", created_at: now, updated_at: now }), submissions: [] };
}

export async function listTeacherAssignments(classId) {
  await ensureSchema();
  const result = await db().prepare(
    "SELECT assignments.*,classes.name AS class_name FROM assignments JOIN classes ON classes.id=assignments.class_id WHERE assignments.class_id=? ORDER BY assignments.created_at DESC",
  ).bind(classId).all();
  const assignments = [];
  for (const row of result.results || []) {
    const submissions = await db().prepare(
      "SELECT assignment_submissions.*,users.display_name AS student_name,enrollments.student_no FROM assignment_submissions JOIN users ON users.id=assignment_submissions.student_user_id LEFT JOIN enrollments ON enrollments.user_id=users.id AND enrollments.class_id=? WHERE assignment_submissions.assignment_id=? ORDER BY assignment_submissions.submitted_at DESC",
    ).bind(classId, row.id).all();
    assignments.push({ ...assignmentDto(row), submissions: (submissions.results || []).map(submissionDto) });
  }
  return assignments;
}

export async function listStudentAssignments(studentUserId) {
  await ensureSchema();
  const result = await db().prepare(
    "SELECT assignments.*,classes.name AS class_name,assignment_submissions.id AS submission_id,assignment_submissions.original_name AS submission_name,assignment_submissions.size AS submission_size,assignment_submissions.submitted_at,assignment_submissions.score,assignment_submissions.feedback,assignment_submissions.graded_at FROM enrollments JOIN assignments ON assignments.class_id=enrollments.class_id JOIN classes ON classes.id=assignments.class_id LEFT JOIN assignment_submissions ON assignment_submissions.assignment_id=assignments.id AND assignment_submissions.student_user_id=enrollments.user_id WHERE enrollments.user_id=? ORDER BY assignments.created_at DESC",
  ).bind(studentUserId).all();
  return (result.results || []).map((row) => ({
    ...assignmentDto(row),
    submission: row.submission_id ? {
      id: String(row.submission_id),
      originalName: String(row.submission_name),
      size: Number(row.submission_size),
      submittedAt: String(row.submitted_at),
      score: row.score === null || row.score === undefined ? null : Number(row.score),
      feedback: String(row.feedback || ""),
      gradedAt: row.graded_at ? String(row.graded_at) : null,
    } : null,
  }));
}

export async function submitAssignment({ assignmentId, student, bytes, originalName }) {
  await ensureSchema();
  const assignment = await db().prepare(
    "SELECT assignments.*,enrollments.user_id AS enrolled_user FROM assignments JOIN enrollments ON enrollments.class_id=assignments.class_id AND enrollments.user_id=? WHERE assignments.id=? LIMIT 1",
  ).bind(student.id, assignmentId).first();
  if (!assignment) throw new Error("作业不存在，或你不属于该班级。");
  if (String(assignment.status) !== "published") throw new Error("该作业已关闭提交。");
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const displayName = safeName(originalName, "学生作业.docx");
  validateDocx(data, displayName);
  const previous = await db().prepare("SELECT id,object_key FROM assignment_submissions WHERE assignment_id=? AND student_user_id=? LIMIT 1").bind(assignmentId, student.id).first();
  const submissionId = previous?.id ? String(previous.id) : crypto.randomUUID();
  const objectKey = `assignments/${assignmentId}/submissions/${student.id}/${crypto.randomUUID()}.docx`;
  await putDocx(objectKey, data, displayName, { kind: "submission", assignmentId, studentUserId: student.id });
  const now = new Date().toISOString();
  try {
    await db().prepare(
      "INSERT INTO assignment_submissions (id,assignment_id,student_user_id,original_name,object_key,size,submitted_at,score,feedback,graded_by,graded_at) VALUES (?,?,?,?,?,?,?,NULL,'',NULL,NULL) ON CONFLICT(assignment_id,student_user_id) DO UPDATE SET original_name=excluded.original_name,object_key=excluded.object_key,size=excluded.size,submitted_at=excluded.submitted_at,score=NULL,feedback='',graded_by=NULL,graded_at=NULL",
    ).bind(submissionId, assignmentId, student.id, displayName, objectKey, data.length, now).run();
  } catch (error) {
    await bucket().delete(objectKey).catch(() => null);
    throw error;
  }
  if (previous?.object_key && previous.object_key !== objectKey) await bucket().delete(String(previous.object_key)).catch(() => null);
  
  let gradingError = "";
  try {
    const templateObject = assignment.attachment_key ? await bucket().get(String(assignment.attachment_key)) : null;
    const result = await gradeDocxAssignment({title:String(assignment.title),instructions:String(assignment.instructions||""),templateBytes:templateObject?new Uint8Array(await templateObject.arrayBuffer()):null,submissionBytes:data,signal:AbortSignal.timeout(35_000)});
    await db().prepare("UPDATE assignment_submissions SET score=?,feedback=?,graded_at=? WHERE id=? AND object_key=? AND graded_at IS NULL")
      .bind(result.score,result.feedback,new Date().toISOString(),submissionId,objectKey).run();
    await db().prepare("INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),student.id,"ai_initial_grade","assignment_submission",submissionId,"系统触发Word作业AI初评，需教师复核",new Date().toISOString()).run();
  } catch { gradingError="作业已保存，AI初评暂不可用，教师可在作业列表重试。"; }
  const saved=await db().prepare("SELECT score,feedback,graded_at FROM assignment_submissions WHERE id=? AND object_key=?").bind(submissionId,objectKey).first();
  return { id: submissionId, assignmentId, originalName: displayName, size: data.length, submittedAt: now, score: saved?.score ?? null, feedback: saved?.feedback || "", gradedAt: saved?.graded_at || null, gradingError };

}

export async function gradeSubmission({ submissionId, score, feedback, teacher }) {
  await ensureSchema();
  const row = await db().prepare("SELECT id FROM assignment_submissions WHERE id=? LIMIT 1").bind(submissionId).first();
  if (!row) throw new Error("学生提交记录不存在。");
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("批改分数必须在0—100分之间。");
  const now = new Date().toISOString();
  await db().prepare("UPDATE assignment_submissions SET score=?,feedback=?,graded_by=?,graded_at=? WHERE id=?")
    .bind(value, String(feedback || "").slice(0, 3_000), teacher.id, now, submissionId).run();
  return { submissionId, score: value, feedback: String(feedback || "").slice(0, 3_000), gradedAt: now };
}

export async function autoGradeSubmission({ submissionId, teacher, signal }) {
  await ensureSchema();
  const row = await db().prepare(
    "SELECT assignment_submissions.id,assignment_submissions.object_key,assignments.title,assignments.instructions,assignments.attachment_key FROM assignment_submissions JOIN assignments ON assignments.id=assignment_submissions.assignment_id WHERE assignment_submissions.id=? LIMIT 1",
  ).bind(submissionId).first();
  if (!row) throw new Error("学生提交记录不存在。");
  const submissionObject = await bucket().get(String(row.object_key));
  if (!submissionObject) throw new Error("学生Word作业文件不存在，请让学生重新提交。");
  const templateObject = row.attachment_key ? await bucket().get(String(row.attachment_key)) : null;
  const result = await gradeDocxAssignment({
    title: String(row.title || ""),
    instructions: String(row.instructions || ""),
    templateBytes: templateObject ? new Uint8Array(await templateObject.arrayBuffer()) : null,
    submissionBytes: new Uint8Array(await submissionObject.arrayBuffer()),
    signal,
  });
  const saved = await gradeSubmission({ submissionId, score: result.score, feedback: result.feedback, teacher });
  return { ...saved, rubric: result.rubric, extractedCharacters: result.extractedCharacters, generatedBy: "course-ai-auto-grading-v15" };
}

async function canReadAssignment(user, assignmentId) {
  if (user.role === "teacher") return Boolean(await db().prepare("SELECT 1 AS found FROM assignments WHERE id=? LIMIT 1").bind(assignmentId).first());
  return Boolean(await db().prepare("SELECT 1 AS found FROM assignments JOIN enrollments ON enrollments.class_id=assignments.class_id WHERE assignments.id=? AND enrollments.user_id=? LIMIT 1").bind(assignmentId, user.id).first());
}

export async function readAssignmentFile(assignmentId, user) {
  await ensureSchema();
  if (!await canReadAssignment(user, assignmentId)) return null;
  const row = await db().prepare("SELECT attachment_name,attachment_key,attachment_size FROM assignments WHERE id=? LIMIT 1").bind(assignmentId).first();
  if (!row?.attachment_key) return null;
  const object = await bucket().get(String(row.attachment_key));
  if (!object) return null;
  return { name: String(row.attachment_name), size: Number(row.attachment_size), bytes: new Uint8Array(await object.arrayBuffer()) };
}

export async function readSubmissionFile(submissionId, user) {
  await ensureSchema();
  const row = await db().prepare("SELECT assignment_submissions.*,assignments.class_id FROM assignment_submissions JOIN assignments ON assignments.id=assignment_submissions.assignment_id WHERE assignment_submissions.id=? LIMIT 1").bind(submissionId).first();
  if (!row) return null;
  if (user.role !== "teacher" && String(row.student_user_id) !== user.id) return null;
  const object = await bucket().get(String(row.object_key));
  if (!object) return null;
  return { name: String(row.original_name), size: Number(row.size), bytes: new Uint8Array(await object.arrayBuffer()) };
}

export const DOCX_CONTENT_TYPE = WORD_CONTENT_TYPE;
