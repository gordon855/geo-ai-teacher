import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { requireRequestRole } from "@/lib/step8a/session";
import { readSmallJson, requestId } from "@/lib/step19/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";

import { dashboard, moderation, handleReport } from "@/lib/step19/store.mjs";
const reason=z.string().trim().min(1).max(1000);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('terms'),terms:z.array(z.string().trim().min(1).max(60)).max(500)}),
 z.object({action:z.literal('closed'),closed:z.array(z.string().min(1).max(100)).max(500)}),
 ...(['approve','reject','hide','mute','unmute'] as const).map(action=>z.object({action:z.literal(action),id:z.string().uuid(),reason,days:z.number().int().min(1).max(365).default(7)})),
 z.object({action:z.literal('report'),id:z.string().uuid(),status:z.enum(['reviewing','resolved','dismissed']),response:reason})
]);
export async function GET(r:NextRequest){try{const a=await requireRequestRole(r,'teacher');if(!a.ok)return noStoreJson({error:a.error},{status:a.status});const kind=z.enum(['barrage','reports','events','logs','mutes']).parse(r.nextUrl.searchParams.get('kind')||'barrage');const page=z.coerce.number().int().min(0).max(100000).parse(r.nextUrl.searchParams.get('page')||0);return noStoreJson({ok:true,...await dashboard(kind,page)});}catch(e){return jsonError(e);}}
export async function POST(r:NextRequest){try{assertSameOrigin(r);const a=await requireRequestRole(r,'teacher');if(!a.ok)return noStoreJson({error:a.error},{status:a.status});const data=schema.parse(await readSmallJson(r));return noStoreJson(data.action==='report'?await handleReport(a.user,data,requestId(r)):await moderation(a.user,data,requestId(r)));}catch(e){return jsonError(e);}}
