import {NextRequest,NextResponse} from 'next/server';
import {currentRequestUser} from './lib/step8a/session';
import {requestLog} from './lib/step19/store.mjs';
export async function proxy(request:NextRequest){
 if(request.nextUrl.pathname.startsWith("/teacher") && request.nextUrl.pathname!=="/teacher/login"){const user=await currentRequestUser(request);if(!user||user.role!=="teacher")return NextResponse.redirect(new URL(user?"/student":"/student/login",request.url));}
 try{const id=await requestLog(request);const headers=new Headers(request.headers);headers.set('x-v19-request-id',id);const response=NextResponse.next({request:{headers}});response.headers.set('X-Audit-Request-Id',id);return response;}
 catch{console.error('[security-audit] Request audit unavailable');return NextResponse.json({ok:false,error:'安全日志服务暂不可用，请稍后重试。'},{status:503});}
}
// Tile requests are signed, read-only, contain no course data and can number in the hundreds per view.
// The authenticated map-config request remains audited; excluding tiles prevents one map pan from flooding PostgreSQL.
export const config={matcher:['/api/((?!health|training/map-proxy/).*)','/reports','/classroom/barrage','/teacher/:path*']};
