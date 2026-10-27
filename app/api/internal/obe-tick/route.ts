import {type NextRequest} from 'next/server';
import {validTick} from '@/lib/step20-3/policy.mjs';
import {tick} from '@/lib/step20-3/store.mjs';
import {completeMessages} from '@/lib/cloud/ai-service.mjs';
import {noStoreJson} from '@/lib/step8a/api';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=240;
export async function POST(r:NextRequest){if(!validTick(r.headers.get('x-obe-time')||'',r.headers.get('x-obe-signature')||'',process.env.APP_ENCRYPTION_KEY||''))return noStoreJson({error:'禁止访问'},{status:403});try{return noStoreJson(await tick(completeMessages));}catch{return noStoreJson({error:'任务未完成，请查看教师端运行状态'},{status:503});}}
