import {NextRequest,after} from 'next/server';
import {z} from 'zod';
import {currentRequestUser} from '@/lib/step8a/session';
import {assertSameOrigin,ClassroomApiError,jsonError,noStoreJson} from '@/lib/step8a/api';
import * as store from '@/lib/step21/store.mjs';
import {completeMessages} from '@/lib/cloud/ai-service.mjs';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{const u=await currentRequestUser(req);if(!u)throw new ClassroomApiError(401,'请先登录');const h=req.nextUrl.searchParams.get('history');if(h&&u.role!=='teacher')throw new ClassroomApiError(403,'仅教师可查看台账');return noStoreJson({ok:true,...(h?{events:await store.history(u,z.uuid().parse(h))}:await store.list(u,req.nextUrl.searchParams.get('classId')||''))});}catch(e){return jsonError(e);}}
const id=z.uuid();const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('reflect'),id,useful:z.boolean(),note:z.string().min(10).max(2000),nextAction:z.string().min(5).max(2000)}),
 z.object({action:z.literal('publish'),classIds:z.array(z.string().max(120)).min(1).max(20),unit:z.number().int(),sourceId:z.string().max(120),title:z.string().min(3).max(160),scenario:z.string().min(20).max(4000),dueAt:z.iso.datetime()}),
 z.object({action:z.enum(['start','close','retry']),id}),
 z.object({action:z.literal('save'),id,answers:z.record(z.string(),z.string().max(4000)),submit:z.boolean()}),
 z.object({action:z.literal('review'),id,marks:z.array(z.object({id:z.string(),score:z.number().min(0).max(25),quote:z.string().min(1).max(300),feedback:z.string().min(1).max(1800)})).length(4),note:z.string().min(2).max(2000)})]);
export async function POST(req:NextRequest){try{assertSameOrigin(req);const u=await currentRequestUser(req);if(!u)throw new ClassroomApiError(401,'请先登录');const x=schema.parse(await req.json());if(['publish','close','retry','review','reflect'].includes(x.action)&&u.role!=='teacher')throw new ClassroomApiError(403,'学生不能进入教师管理功能');if(['start','save'].includes(x.action)&&u.role!=='student')throw new ClassroomApiError(403,'仅学生可提交作答');let data;switch(x.action){case 'reflect':data=await store.reflect(u,x);break;case 'publish':data=await store.publish(u,x);break;case 'start':data=await store.start(u,x.id);break;case 'save':data=await store.save(u,x);if(x.submit)after(()=>store.grade(x.id,completeMessages));break;case 'retry':data=await store.retry(u,x.id);after(()=>store.grade(x.id,completeMessages));break;case 'review':data=await store.review(u,x);break;case 'close':data=await store.close(u,x.id);break;}return noStoreJson({ok:true,data});}catch(e){return jsonError(e);}}
