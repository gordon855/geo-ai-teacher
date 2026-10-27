import {NextRequest} from 'next/server';
import {currentRequestUser} from '@/lib/step8a/session';
import {assertSameOrigin,noStoreJson,ClassroomApiError} from '@/lib/step8a/api';
import {readSmallJson} from '@/lib/step19/http';
import {createMessageStore,MessageError} from '@/lib/step21-6/messages.mjs';
import {ZodError} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
function failure(e:unknown){if(e instanceof MessageError||e instanceof ClassroomApiError)return noStoreJson({error:e.message},{status:e.status});if(e instanceof ZodError)return noStoreJson({error:e.issues[0]?.message||'请检查输入'},{status:400});return noStoreJson({error:'暂时无法处理，请稍后重试；每个账号10分钟内最多提交5次。'},{status:400});}
export async function GET(r:NextRequest){try{return noStoreJson(await createMessageStore().list(await currentRequestUser(r),Object.fromEntries(r.nextUrl.searchParams)));}catch(e){return failure(e);}}
export async function POST(r:NextRequest){try{assertSameOrigin(r);return noStoreJson(await createMessageStore().submit(await currentRequestUser(r),await readSmallJson(r)));}catch(e){return failure(e);}}
export async function PATCH(r:NextRequest){try{assertSameOrigin(r);return noStoreJson(await createMessageStore().update(await currentRequestUser(r),await readSmallJson(r)));}catch(e){return failure(e);}}
