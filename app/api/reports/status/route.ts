import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";

import { readSmallJson, sourceIp } from "@/lib/step19/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";

import { reportStatus } from "@/lib/step19/store.mjs";
export async function POST(r:NextRequest){try{assertSameOrigin(r);const data=z.object({receipt:z.string().regex(/^[a-f0-9]{48}$/)}).parse(await readSmallJson(r));return noStoreJson({ok:true,report:await reportStatus(data.receipt,sourceIp(r))});}catch(e){return jsonError(e);}}
