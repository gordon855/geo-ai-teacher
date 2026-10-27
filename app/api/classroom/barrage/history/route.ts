import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, noStoreJson } from "@/lib/step8a/api";
import { currentRequestUser } from "@/lib/step8a/session";
export const runtime="nodejs";
export const dynamic="force-dynamic";

import { staticBarrage, memberClasses } from "@/lib/step19/store.mjs";
export async function GET(r:NextRequest){try{const user=await currentRequestUser(r);if(!user)return noStoreJson({error:'请先登录。'},{status:401});const classes=await memberClasses(user);const classId=r.nextUrl.searchParams.get('classId')||classes[0]?.id;const page=z.coerce.number().int().min(0).max(100000).parse(r.nextUrl.searchParams.get('page')||0);return noStoreJson({ok:true,classes,rows:classId?await staticBarrage(user,classId,r.nextUrl.searchParams.get('mine')==='1',page):[]});}catch(e){return jsonError(e);}}
