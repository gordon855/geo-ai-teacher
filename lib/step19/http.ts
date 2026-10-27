import type {NextRequest} from 'next/server';
export async function readSmallJson(request:NextRequest){const reader=request.body?.getReader();if(!reader)throw new Error('请求内容为空');let size=0;const chunks:Uint8Array[]=[];try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>16384){await reader.cancel();throw new Error('请求内容超过16KB');}chunks.push(r.value);}}finally{reader.releaseLock();}const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(data));}
export const requestId=(r:NextRequest)=>r.headers.get('x-v19-request-id')||'';
export const sourceIp=(r:NextRequest)=>process.env.SECURITY_TRUST_PROXY==='1'?(r.headers.get('x-v19-source-ip')||'unknown'):'untrusted';
