import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { currentRequestUser, requireRequestRole } from "@/lib/step8a/session";
import { MAX_PRESENTATION_BYTES, readPresentationMetadata, replacePresentation } from "@/lib/step11-7/presentation-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function publicMetadata(presentation: Awaited<ReturnType<typeof readPresentationMetadata>>) {
  if (!presentation) return null;
  return {
    originalName: presentation.originalName,
    size: presentation.size,
    version: presentation.version,
    updatedAt: presentation.updatedAt,
    updatedBy: presentation.updatedBy,
    analysis: presentation.analysis,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await currentRequestUser(request);
    if (!user) return noStoreJson({ ok: false, error: "请先登录。" }, { status: 401 });
    return noStoreJson({ ok: true, presentation: publicMetadata(await readPresentationMetadata()) });
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
    if (!(file instanceof File)) return noStoreJson({ ok: false, error: "请选择.pptx文件。" }, { status: 400 });
    if (file.size > MAX_PRESENTATION_BYTES) return noStoreJson({ ok: false, error: "PPT文件不能超过80MB。" }, { status: 413 });
    const presentation = await replacePresentation({
      bytes: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
      updatedBy: auth.user.displayName,
    });
    return noStoreJson({ ok: true, presentation: publicMetadata(presentation) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
