import type { NextRequest } from "next/server";
import { z } from "zod";
import { clearServiceSetting, getServiceConfigurationStatus, getServiceSettings, saveServiceSettings } from "@/lib/cloud/runtime.mjs";
import { assertSameOrigin, noStoreJson } from "@/lib/step8a/api";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EditableKey = z.enum([
  "DASHSCOPE_API_KEY",
  "DEEPSEEK_API_KEY",
  "LIVEAVATAR_API_KEY",
  "BAILIAN_WORKSPACE_ID",
  "BAILIAN_BASE_URL",
  "KB_CHAT_MODEL",
  "AI_PROVIDER",
  "DEEPSEEK_MODEL",
  "LIVEAVATAR_DEFAULT_AVATAR_ID",
  "VOICE_ASR_MODEL",
  "VOICE_TTS_MODEL",
  "VOICE_TTS_VOICE",
  "VOICE_TTS_RATE",
]);

const SettingsSchema = z.record(EditableKey, z.string().max(2_000)).refine((value) => Object.keys(value).length <= 20);

async function teacher(request: NextRequest) {
  const auth = await requireRequestRole(request, "teacher");
  if (!auth.ok) return { error: noStoreJson({ ok: false, error: auth.error }, { status: auth.status }) };
  return { user: auth.user };
}

function publicValues(settings: Record<string, string>) {
  return {
    AI_PROVIDER: settings.AI_PROVIDER,
    BAILIAN_WORKSPACE_ID: settings.BAILIAN_WORKSPACE_ID,
    BAILIAN_BASE_URL: settings.BAILIAN_BASE_URL,
    KB_CHAT_MODEL: settings.KB_CHAT_MODEL,
    DEEPSEEK_MODEL: settings.DEEPSEEK_MODEL,
    LIVEAVATAR_DEFAULT_AVATAR_ID: settings.LIVEAVATAR_DEFAULT_AVATAR_ID,
    VOICE_ASR_MODEL: settings.VOICE_ASR_MODEL,
    VOICE_TTS_MODEL: settings.VOICE_TTS_MODEL,
    VOICE_TTS_VOICE: settings.VOICE_TTS_VOICE,
    VOICE_TTS_RATE: settings.VOICE_TTS_RATE,
  };
}

export async function GET(request: NextRequest) {
  const auth = await teacher(request);
  if (auth.error) return auth.error;
  const [status, settings] = await Promise.all([getServiceConfigurationStatus(), getServiceSettings()]);
  return noStoreJson({ ok: true, status, values: publicValues(settings) });
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await teacher(request);
    if (auth.error) return auth.error;
    const parsed = SettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ ok: false, error: "云服务配置字段不正确。" }, { status: 400 });
    const status = await saveServiceSettings(auth.user.id, parsed.data);
    const settings = await getServiceSettings();
    return noStoreJson({ ok: true, status, values: publicValues(settings) });
  } catch (error) {
    return noStoreJson({ ok: false, error: error instanceof Error ? error.message : "云服务配置保存失败。" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await teacher(request);
    if (auth.error) return auth.error;
    const parsed = z.object({ key: EditableKey }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ ok: false, error: "要清除的配置项不正确。" }, { status: 400 });
    const status = await clearServiceSetting(auth.user.id, parsed.data.key);
    return noStoreJson({ ok: true, status });
  } catch (error) {
    return noStoreJson({ ok: false, error: error instanceof Error ? error.message : "云服务配置清除失败。" }, { status: 400 });
  }
}
