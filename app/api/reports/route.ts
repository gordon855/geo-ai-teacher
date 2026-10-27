import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { currentRequestUser } from "@/lib/step8a/session";
import { readSmallJson, requestId, sourceIp } from "@/lib/step19/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";

import { createReport } from "@/lib/step19/store.mjs";
const schema=z.object({category:z.enum(['违法有害内容','弹幕投诉','个人信息与隐私','AI内容问题','账号申诉','其他']),target:z.string().trim().max(300).default(''),content:z.string().trim().min(10).max(2000),contact:z.string().trim().max(120).default(''),challengeId:z.string().uuid(),answer:z.string().regex(/^\d{1,3}$/),website:z.string().max(100).default('')});
export async function POST(r:NextRequest){try{assertSameOrigin(r);const data=schema.parse(await readSmallJson(r));const user=await currentRequestUser(r);return noStoreJson({ok:true,...await createReport(user,data,sourceIp(r),requestId(r))});}catch(e){return jsonError(e);}}
