import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { requireRequestRole } from "@/lib/step8a/session";
import {
  importKnowledgePackage,
  knowledgeStats,
  listKnowledgeSources,
  MAX_KNOWLEDGE_UPLOAD_BYTES,
  setKnowledgeSourceActive,
} from "@/lib/step17/knowledge-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const StatusSchema = z.object({
  sourceId: z.string().uuid(),
  active: z.boolean(),
}).strict();

async function payload() {
  return { sources: await listKnowledgeSources(), stats: await knowledgeStats() };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    return noStoreJson({ ok: true, ...(await payload()) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return noStoreJson({ ok: false, error: "请选择要导入的知识库文件。" }, { status: 400 });
    if (file.size > MAX_KNOWLEDGE_UPLOAD_BYTES) return noStoreJson({ ok: false, error: "知识库文件不能超过25MB。" }, { status: 413 });
    const result = await importKnowledgePackage({
      bytes: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
      displayName: String(form.get("displayName") || ""),
      actorUserId: auth.user.id,
      actorName: auth.user.displayName,
    });
    return noStoreJson({ ok: true, ...result, ...(await payload()) }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = StatusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ ok: false, error: "知识库状态参数无效。" }, { status: 400 });
    await setKnowledgeSourceActive({ ...parsed.data, actorUserId: auth.user.id });
    return noStoreJson({ ok: true, ...(await payload()) });
  } catch (error) {
    return jsonError(error);
  }
}
