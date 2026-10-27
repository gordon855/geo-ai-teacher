import {after,type NextRequest} from 'next/server';
import {z} from 'zod';
import {currentRequestUser} from '@/lib/step8a/session';
import {assertSameOrigin,noStoreJson,jsonError} from '@/lib/step8a/api';
import {completeMessages} from '@/lib/cloud/ai-service.mjs';
import * as obe from '@/lib/step20-3/store.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
const id=z.string().uuid(),note=z.string().trim().min(2).max(2000),due=z.string().datetime({offset:true});
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),id,answers:z.record(z.string().max(100),z.string().max(4000)),submit:z.boolean()}),
 z.object({action:z.literal('defer'),id,note}),
 z.object({action:z.literal('adjust'),id,note,dueAt:due,percent:z.number().min(60).max(100),minItem:z.number().min(0).max(5),approve:z.boolean()}),
 z.object({action:z.literal('review'),id,note,marks:z.array(z.object({id:z.string().max(100),score:z.number().min(0).max(5),feedback:z.string().min(1).max(1800)})).length(3)}),
 z.object({action:z.literal('retry'),id}),
 z.object({action:z.literal('draft'),classId:z.string().min(1).max(100),unit:z.number().int(),kind:z.enum(['en-zh','zh-en','sentence','principle']),ai:z.boolean().default(false)}),
 z.object({action:z.literal('decide'),id,decision:z.enum(['confirm','reject','implement','close']),note,measure:z.string().max(3000).default(''),dueAt:due.optional(),percent:z.number().min(60).max(100).default(80),minItem:z.number().min(0).max(5).default(3),nextAction:z.string().max(2000).default('')})
]);
export async function GET(r:NextRequest){try{const u=await currentRequestUser(r);if(!u)return noStoreJson({error:'请先登录'},{status:401});const p=r.nextUrl.searchParams,view=p.get('view'),page=z.coerce.number().int().min(0).max(100000).parse(p.get('page')||0),cls=p.get('classId')||'';let data;if(view==='evidence')data=await obe.evidence(u,cls,page);else if(view==='improvements')data=await obe.improvements(u,cls,page);else if(view==='ledger')data=await obe.ledger(u,id.parse(p.get('id')));else if(view==='source')data=await obe.sourceDetail(u,z.string().max(160).parse(p.get('id')),p.get('stage'));else if(p.has('id'))data=await obe.detail(u,id.parse(p.get('id')));else data=await obe.list(u,cls,page);return noStoreJson({data});}catch(e){return jsonError(e);}}
export async function POST(r:NextRequest){try{assertSameOrigin(r);const u=await currentRequestUser(r);if(!u)return noStoreJson({error:'请先登录'},{status:401});const x=schema.parse(await r.json());if(!['save','defer'].includes(x.action)&&u.role!=='teacher')return noStoreJson({error:'仅教师可执行'},{status:403});let data;switch(x.action){case'save':data=await obe.save(u,x.id,x.answers,x.submit);if(x.submit)after(async()=>{try{await obe.grade(x.id,completeMessages);await obe.schedule();}catch{console.error('[v20.3] 批改等待重试');}});break;case'defer':data=await obe.defer(u,x.id,x.note);break;case'adjust':data=await obe.adjust(u,x.id,x);break;case'review':data=await obe.review(u,x.id,x.marks,x.note);await obe.schedule();break;case'retry':data=await obe.retry(u,x.id);break;case'draft':data=await obe.draft(u,x.classId,x.unit,x.kind,x.ai?completeMessages:null);break;case'decide':data=await obe.decide(u,x.id,{...x,action:x.decision});break;}return noStoreJson({ok:true,data});}catch(e){return jsonError(e);}}
