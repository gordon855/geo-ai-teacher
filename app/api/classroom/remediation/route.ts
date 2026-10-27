import {after,type NextRequest} from 'next/server';
import {z} from 'zod';
import {currentRequestUser} from '@/lib/step8a/session';
import {assertSameOrigin,noStoreJson,jsonError} from '@/lib/step8a/api';
import {completeMessages} from '@/lib/cloud/ai-service.mjs';
import * as obe from '@/lib/step20-2/store.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('sync'),classId:z.string().max(100).optional().default('')}),
 z.object({action:z.literal('prepare'),id}),
 z.object({action:z.literal('save'),id,answers:z.record(z.string().max(100),z.string().max(4000)),submit:z.boolean()}),
 z.object({action:z.literal('grade'),id}),
 z.object({action:z.literal('review'),id,marks:z.array(z.object({id:z.string().max(100),score:z.number().min(0).max(5),feedback:z.string().min(1).max(1800)})).min(1).max(3),note:z.string().trim().min(2).max(2000)}),
 z.object({action:z.literal('comment'),id,note:z.string().trim().min(2).max(2000),decision:z.enum(['note','needs_support','teacher_confirmed']).default('note')})
]);
export async function GET(r:NextRequest){try{const u=await currentRequestUser(r);if(!u)return noStoreJson({error:'请先登录'},{status:401});const p=r.nextUrl.searchParams;return noStoreJson({data:p.has('id')?await obe.detail(u,id.parse(p.get('id'))):await obe.list(u,p.get('classId')||'')});}catch(e){return jsonError(e);}}
export async function POST(r:NextRequest){try{assertSameOrigin(r);const u=await currentRequestUser(r);if(!u)return noStoreJson({error:'请先登录'},{status:401});const x=schema.parse(await r.json());if(['review','comment'].includes(x.action)&&u.role!=='teacher')return noStoreJson({error:'仅教师可复核'},{status:403});if(['prepare','save'].includes(x.action)&&u.role!=='student')return noStoreJson({error:'请使用学生账号'},{status:403});let data;switch(x.action){case'sync':await obe.reconcile(u,x.classId);data=await obe.list(u,x.classId);break;case'prepare':data=await obe.prepare(u,x.id,completeMessages);break;case'save':data=await obe.save(u,x.id,x.answers,x.submit);if(x.submit)after(async()=>{try{await obe.grade(u,x.id,completeMessages);}catch{console.error('[v20.2] 补练批改待重试');}});break;case'grade':data=await obe.grade(u,x.id,completeMessages);break;case'review':data=await obe.review(u,x.id,x.marks,x.note);break;case'comment':data=await obe.comment(u,x.id,x.note,x.decision);break;}return noStoreJson({ok:true,data});}catch(e){return jsonError(e);}}
