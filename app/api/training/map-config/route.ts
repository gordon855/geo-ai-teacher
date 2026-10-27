import type { NextRequest } from 'next/server';
import { currentRequestUser } from '@/lib/step8a/session';
import { noStoreJson, jsonError } from '@/lib/step8a/api';
import { createMapProxyToken, getMapSource, shouldProxyMapSource, type MapSourceKind } from '@/lib/step19/map-proxy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function browserSource(kind: MapSourceKind) {
 const source=getMapSource(kind);
 if(!shouldProxyMapSource(source)) return {url:source,proxied:false};
 const token=encodeURIComponent(createMapProxyToken(kind));
 return {url:`/api/training/map-proxy/${kind}/tilejson?token=${token}`,proxied:true};
}
function publicTemplate(value: string | undefined) {
 const s=value?.trim();if(!s)return '';
 if(s.startsWith('/')&&!s.startsWith('//'))return s;
 try{const u=new URL(s);if(u.protocol==='https:'&&!u.username&&!u.password)return u.toString();}catch{}
 return '';
}
export async function GET(request: NextRequest) {
 try { if(!await currentRequestUser(request)) return noStoreJson({ok:false,error:'请先登录。'},{status:401});
 const dem=browserSource('dem'),vector=browserSource('vector');
 return noStoreJson({version:'20',delivery:dem.proxied||vector.proxied?'same-origin-proxy':'direct',dem:dem.url,encoding:process.env.MAP_DEM_ENCODING==='mapbox'?'mapbox':'terrarium',vector:vector.url,imagery:publicTemplate(process.env.MAP_RASTER_TILE_URL),attribution:process.env.MAP_CUSTOM_ATTRIBUTION||''});
 }catch(error){return jsonError(error);}
}
