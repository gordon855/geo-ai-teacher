import type { NextRequest } from "next/server";

import { jsonError, noStoreJson } from "@/lib/step8a/api";
import { sourceIp } from "@/lib/step19/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";

import { challenge } from "@/lib/step19/store.mjs";
export async function GET(r:NextRequest){try{return noStoreJson({ok:true,...await challenge(sourceIp(r))});}catch(e){return jsonError(e);}}
