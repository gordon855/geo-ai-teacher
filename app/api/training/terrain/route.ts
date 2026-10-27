import type { NextRequest } from "next/server";
import { SCENE_KEYS } from "@/lib/step18/scenes";
import { z } from "zod";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { DEFAULT_CLASS_ID } from "@/lib/step8a/course-data";
import { currentRequestUser } from "@/lib/step8a/session";
import {
  gradeTerrainSubmission,
  publishTerrainTask,
  studentTerrainWorkspace,
  submitTerrainRoute,
  teacherTerrainWorkspace,
} from "@/lib/step17/terrain-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PublishSchema = z.object({
  classId: z.string().min(1).max(100),
  locationKey: z.enum(SCENE_KEYS),
  title: z.string().trim().min(4).max(120),
  instructions: z.string().trim().min(10).max(2_000),
}).strict();

const RoutePoint = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const SubmitSchema = z.object({
  taskId: z.string().uuid(),
  route: z.array(RoutePoint).min(2).max(100),
  rationale: z.string().trim().min(30).max(2_000),
}).strict();

const GradeSchema = z.object({
  submissionId: z.string().uuid(),
  score: z.number().min(0).max(100),
  feedback: z.string().trim().max(2_000),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const user = await currentRequestUser(request);
    if (!user) return noStoreJson({ ok: false, error: "请先登录。" }, { status: 401 });
    const workspace = user.role === "teacher"
      ? await teacherTerrainWorkspace(request.nextUrl.searchParams.get("classId") || DEFAULT_CLASS_ID)
      : await studentTerrainWorkspace(user.id);
    return noStoreJson({ ok: true, role: user.role, ...workspace });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await currentRequestUser(request);
    if (!user) return noStoreJson({ ok: false, error: "请先登录。" }, { status: 401 });
    if (user.role !== "teacher") return noStoreJson({ ok: false, error: "只有教师可以发布实训。" }, { status: 403 });
    const parsed = PublishSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ ok: false, error: "实训标题、地点或任务要求格式不正确。" }, { status: 400 });
    return noStoreJson({ ok: true, ...(await publishTerrainTask({ ...parsed.data, actorUserId: user.id })) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await currentRequestUser(request);
    if (!user) return noStoreJson({ ok: false, error: "请先登录。" }, { status: 401 });
    if (user.role !== "student") return noStoreJson({ ok: false, error: "教师账号不能代替学生提交实训。" }, { status: 403 });
    const parsed = SubmitSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ ok: false, error: "请至少绘制两个路线点，并填写不少于30字的英文说明。" }, { status: 400 });
    return noStoreJson({ ok: true, ...(await submitTerrainRoute({ ...parsed.data, studentUserId: user.id })) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await currentRequestUser(request);
    if (!user) return noStoreJson({ ok: false, error: "请先登录。" }, { status: 401 });
    if (user.role !== "teacher") return noStoreJson({ ok: false, error: "只有教师可以保存成绩。" }, { status: 403 });
    const parsed = GradeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ ok: false, error: "成绩或反馈格式不正确。" }, { status: 400 });
    return noStoreJson({ ok: true, ...(await gradeTerrainSubmission({ ...parsed.data, actorUserId: user.id })) });
  } catch (error) {
    return jsonError(error);
  }
}
