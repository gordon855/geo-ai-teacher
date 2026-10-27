import { securityPool } from "@/lib/step19/store.mjs";
import { NextResponse } from "next/server";
import { loadKnowledgeChunks } from "@/lib/cloud/knowledge.mjs";
import { getServiceConfigurationStatus } from "@/lib/cloud/runtime.mjs";
import { knowledgeStats } from "@/lib/step17/knowledge-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const chunks = loadKnowledgeChunks();
    const [services, uploaded] = await Promise.all([getServiceConfigurationStatus(), knowledgeStats()]);
    const security = (await securityPool().query("SELECT version,installed_at FROM v19_schema WHERE version=19")).rows[0];
    const assessmentReady=Boolean((await securityPool().query("SELECT to_regclass('public.v20_attempts') AS ready")).rows[0]?.ready);
    if(!assessmentReady)throw new Error('第20版章节测试数据库尚未迁移');
    const remediationReady=Boolean((await securityPool().query("SELECT to_regclass('public.v202_jobs') AS ready")).rows[0]?.ready);
    if(!remediationReady)throw new Error('第20.2版补练数据库尚未迁移');
    if(!(await securityPool().query("SELECT to_regclass('public.v211_avatar_trials') AS ready")).rows[0]?.ready)throw new Error("数字人试验数据库尚未迁移");
    if(!(await securityPool().query("SELECT to_regclass('public.v203_plans') AS ready")).rows[0]?.ready)throw new Error('第20.3版延迟复测数据库尚未迁移');
    if(!(await securityPool().query("SELECT to_regclass('public.v21_tasks') AS ready")).rows[0]?.ready)throw new Error("第21版工作台数据库尚未迁移");
    if(!(await securityPool().query("SELECT to_regclass('public.v213_checkins') AS ready")).rows[0]?.ready)throw new Error("21.3签到数据库尚未迁移");
    if(!(await securityPool().query("SELECT to_regclass('public.v216_messages') AS ready")).rows[0]?.ready)throw new Error("21.6留言数据库尚未迁移");
    if (!security) throw new Error("第19版安全数据库尚未迁移");
    const response = NextResponse.json({
      ok: true,
      request_id: requestId,
      status: "ready",
      package_version: "21.7.0",
      anonymous_messages_version: 216,
      liteavatar_launcher_version: 217,
      classroom_interaction_version: 217,
      definition_bank_version: 217,
      presentation_catalog_version: 214,
      presentation_stage_version: 215,
      attendance_schema_version: 213,
      conversation_version: 212,
      avatar_trial_schema_version: 211,
      workstation_schema_version: 21,
      assessment_schema_version: 20,
      remediation_schema_version: 202,
      retention_schema_version: 203,
      security: { schema_version: security.version, installed_at: security.installed_at, minimum_retention_months: 6 },
      deployment_target: "self-hosted",
      knowledge_chunks: chunks.length,
      builtin_knowledge_chunks: chunks.length,
      uploaded_knowledge_chunks: uploaded.chunkCount,
      total_knowledge_chunks: chunks.length + uploaded.chunkCount,
      uploaded_knowledge_sources: uploaded.sourceCount,
      cloud_ai_configured: services.bailian || services.deepseek,
      services,
    });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    return NextResponse.json({
      ok: false,
      request_id: requestId,
      status: "not_ready",
      error: { code: "HEALTH_FAILED", message: error instanceof Error ? error.message : "服务尚未准备好。" },
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
