import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { requireRequestRole } from "@/lib/step8a/session";
import { MAX_PRESENTATION_BYTES, listPresentationCatalog, savePresentation, selectPresentation } from "@/lib/step11-7/presentation-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CatalogDeck = Awaited<ReturnType<typeof listPresentationCatalog>>[number];
function publicDeck(p: Omit<CatalogDeck, "isCurrent"> & { isCurrent?: boolean; duplicate?: boolean }) {
  return { originalName: p.originalName, size: p.size, version: p.version, updatedAt: p.updatedAt,
    updatedBy: p.updatedBy, analysis: p.analysis, isCurrent: Boolean(p.isCurrent), duplicate: Boolean(p.duplicate) };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    return noStoreJson({ ok: true, presentations: (await listPresentationCatalog()).map(publicDeck) });
  } catch (error) { return jsonError(error); }
}

// One file per request: the UI queues any number of files, avoiding a huge multipart request.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    if (Number(request.headers.get("content-length") || 0) > MAX_PRESENTATION_BYTES + 1024 * 1024) {
      return noStoreJson({ ok: false, error: "单份PPTX不能超过80MB。" }, { status: 413 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1) return noStoreJson({ ok: false, error: "每个请求请上传一份PPTX。" }, { status: 400 });
    if (file.size > MAX_PRESENTATION_BYTES) return noStoreJson({ ok: false, error: "单份PPTX不能超过80MB。" }, { status: 413 });
    const presentation = await savePresentation({ bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name, updatedBy: auth.user.displayName });
    return noStoreJson({ ok: true, presentation: publicDeck(presentation) }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = z.object({ version: z.string().regex(/^[a-f0-9]{16}$/u) }).strict().safeParse(await request.json());
    if (!parsed.success) return noStoreJson({ ok: false, error: "请选择有效课件。" }, { status: 400 });
    const presentation = await selectPresentation(parsed.data.version);
    return noStoreJson({ ok: true, presentation: publicDeck({ ...presentation, isCurrent: true }) });
  } catch (error) { return jsonError(error); }
}
