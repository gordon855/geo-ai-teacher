import {NextRequest} from 'next/server';import {z} from 'zod';import {currentRequestUser} from '@/lib/step8a/session';import {assertSameOrigin,noStoreJson,jsonError} from '@/lib/step8a/api';import {detail,list,mutate} from '@/lib/step21-3/store.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[
z.object({action:z.literal('start'),classId:z.string().min(1).max(100),lessonId:z.string().min(1).max(150),minutes:z.number().int().min(1).max(30),title:z.string().min(1).max(100)}).strict(),
z.object({action:z.literal('submit'),id,code:z.string().regex(/^\d{6}$/)}).strict(),z.object({action:z.literal('close'),id}).strict(),
z.object({action:z.literal('review'),id,userId:id,status:z.enum(['present','late','leave','absent'])}).strict(),
z.object({action:z.literal('count'),id,estimated:z.number().int().min(0).max(500).nullable(),confirmed:z.number().int().min(0).max(500),note:z.string().max(200)}).strict()]);
export async function GET(r:NextRequest){try{const u=await currentRequestUser(r);if(!u)return noStoreJson({error:'请先登录'},{status:401});const v=r.nextUrl.searchParams.get('id');return noStoreJson(v?await detail(u,id.parse(v)):{sessions:await list(u,r.nextUrl.searchParams.get('classId')||'')});}catch(e){return jsonError(e);}}
export async function POST(r:NextRequest){try{assertSameOrigin(r);const u=await currentRequestUser(r);if(!u)return noStoreJson({error:'请先登录'},{status:401});return noStoreJson(await mutate(u,schema.parse(await r.json())));}catch(e){return jsonError(e);}}
