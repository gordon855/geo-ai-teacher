import pg from 'pg';
import {randomUUID,randomInt} from 'node:crypto';
import {digest,receipt,screenContent,decideStatus,publicMessage,DEFAULT_TERMS} from './policy.mjs';
let pool;
export function securityPool(){return pool ||= new pg.Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:10000,application_name:'surveying-v19-security'});}
export async function transaction(fn){const c=await securityPool().connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function event(c,actor,action,entity,detail,requestId=''){await c.query('INSERT INTO v19_events(id,actor_id,action,entity_id,detail,request_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,action,entity,JSON.stringify(detail),requestId]);}
export async function rate(c,key,max,seconds){
 const r=await c.query(`INSERT INTO v19_limits(key,started_at,count) VALUES($1,now(),1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN v19_limits.started_at < now()-($2*interval '1 second') THEN 1 ELSE v19_limits.count+1 END, started_at=CASE WHEN v19_limits.started_at < now()-($2*interval '1 second') THEN now() ELSE v19_limits.started_at END RETURNING count`,[key,seconds]);
 if(r.rows[0].count>max)throw new Error('请求过于频繁，请稍后重试。');
}
export async function requestLog(req){
 const c=securityPool(), id=randomUUID();let actor=null,account=null;
 const token=req.cookies.get('surveying_class_session')?.value;
 if(token){const r=await c.query('SELECT u.id,u.username FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND u.disabled=0',[digest(token),new Date().toISOString()]);actor=r.rows[0]?.id||null;account=r.rows[0]?.username||null;}
 const trust=process.env.SECURITY_TRUST_PROXY==='1';const h=n=>trust?(req.headers.get(n)||'').slice(0,512):'';
 await c.query('INSERT INTO v19_requests(id,actor_id,account,method,path,source_ip,source_port,target_ip,target_port,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,actor,account,req.method,req.nextUrl.pathname.slice(0,512),h('x-v19-source-ip'),h('x-v19-source-port'),h('x-v19-target-ip'),h('x-v19-target-port'),(req.headers.get('user-agent')||'').slice(0,512)]);
 return id;
}
export async function submitBarrage(user,input,requestId){return transaction(async c=>{
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user.id]);
 const membership=await c.query('SELECT c.name FROM classes c JOIN enrollments e ON e.class_id=c.id WHERE e.user_id=$1 AND c.id=$2',[user.id,input.classId]);if(!membership.rowCount)throw new Error('当前账号不属于所选班级。');
 const settings=await c.query("SELECT key,value FROM v19_settings WHERE key IN ('terms','closed')");const values=Object.fromEntries(settings.rows.map(r=>[r.key,r.value]));
 if(values.closed?.includes(input.classId)||values.closed?.includes('*'))throw new Error('教师已关闭当前课堂弹幕。');
 if((await c.query('SELECT 1 FROM v19_mutes WHERE class_id=$1 AND sender_id=$2 AND until_at>now()',[input.classId,user.id])).rowCount)throw new Error('当前账号处于本班禁言期，可通过投诉举报入口申诉。');
 await rate(c,'barrage:'+user.id,1,5);
 const flags=screenContent(input.content,values.terms||[]),id=randomUUID(),status=flags.length?'flagged':'pending';
 await c.query('INSERT INTO v19_barrage(id,class_id,class_name,sender_id,sender_name,content,status,flags,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,input.classId,membership.rows[0].name,user.id,user.displayName,input.content,status,JSON.stringify(flags),requestId]);
 await event(c,user.id,'barrage_submit',id,{content:input.content,classId:input.classId,status,flags},requestId);
 return {id,status,notice:flags.length?'已提交，内容需教师重点审核，通过后才会展示。':'已提交待审核，通过后才会展示。'};
});}
export async function liveBarrage(classId){const r=await securityPool().query("SELECT * FROM v19_barrage WHERE status='approved' AND display_until>now() AND NOT EXISTS (SELECT 1 FROM v19_settings WHERE key='closed' AND (value ? '*' OR value ? class_id)) AND ($1::text IS NULL OR class_id=$1) ORDER BY reviewed_at ASC LIMIT 50",[classId||null]);return r.rows.map(publicMessage);}
export async function staticBarrage(user,classId,mine=false,page=0){
 const c=securityPool();if(user.role!=='teacher'&&!(await c.query('SELECT 1 FROM enrollments WHERE user_id=$1 AND class_id=$2',[user.id,classId])).rowCount)throw new Error('无权查看该班级。');
 const r=await c.query(`SELECT id,class_id,class_name,content,status,created_at,reviewed_at,display_until,reason FROM v19_barrage WHERE class_id=$1 AND ${mine?'sender_id=$2':"status='approved'"} ORDER BY created_at DESC LIMIT 30 OFFSET $${mine?3:2}`,mine?[classId,user.id,page*30]:[classId,page*30]);return r.rows.map(row=>mine?row:({...row,reason:undefined}));
}
export async function moderation(user,input,requestId){return transaction(async c=>{
 if(user.role!=='teacher')throw new Error('只有教师可以审核。');
 if(input.action==='terms'||input.action==='closed'){
  const key=input.action,value=input.action==='terms'?input.terms:input.closed;
  if(!Array.isArray(value)||value.length>500)throw new Error('规则格式不正确。');
  await c.query('INSERT INTO v19_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify(value)]);await event(c,user.id,'settings_'+key,key,{value},requestId);return {ok:true};
 }
 const r=await c.query('SELECT * FROM v19_barrage WHERE id=$1 FOR UPDATE',[input.id]);const row=r.rows[0];if(!row)throw new Error('弹幕不存在。');
 if(input.action==='mute'||input.action==='unmute'){
  const days=input.action==='unmute'?0:input.days;
  await c.query("INSERT INTO v19_mutes(class_id,sender_id,until_at,reason,actor_id) VALUES($1,$2,now()+($3*interval '1 day'),$4,$5) ON CONFLICT(class_id,sender_id) DO UPDATE SET until_at=excluded.until_at,reason=excluded.reason,actor_id=excluded.actor_id",[row.class_id,row.sender_id,days,input.reason,user.id]);
  await event(c,user.id,input.action,row.id,{classId:row.class_id,senderId:row.sender_id,days,reason:input.reason},requestId);return {ok:true};
 }
 const next=decideStatus(row.status,input.action);
 await c.query("UPDATE v19_barrage SET status=$1,reviewed_at=now(),display_until=CASE WHEN $1='approved' THEN now()+interval '5 minutes' ELSE NULL END,reviewer_id=$2,reason=$3 WHERE id=$4",[next,user.id,input.reason,row.id]);
 await event(c,user.id,'barrage_'+input.action,row.id,{before:row.status,after:next,content:row.content,classId:row.class_id,senderId:row.sender_id,reason:input.reason},requestId);return {ok:true};
});}
export async function clearBarrage(user,input,requestId){return transaction(async c=>{
 const rows=await c.query("SELECT * FROM v19_barrage WHERE status='approved' AND (($1::text IS NOT NULL AND id=$1) OR ($1::text IS NULL AND class_id=$2)) FOR UPDATE",[input.id||null,input.classId||null]);
 for(const row of rows.rows){await c.query("UPDATE v19_barrage SET status='hidden',reason='教师清屏',reviewer_id=$1,reviewed_at=now(),display_until=NULL WHERE id=$2",[user.id,row.id]);await event(c,user.id,'barrage_hide',row.id,{content:row.content,classId:row.class_id,reason:'教师清屏'},requestId);}return {cleared:rows.rowCount};
});}
export async function dashboard(kind,page=0){const c=securityPool();const tables={barrage:'v19_barrage',reports:'v19_reports',events:'v19_events',logs:'v19_requests',mutes:'v19_mutes'};const table=tables[kind];if(!table)throw new Error('未知列表');
 const order=kind==='mutes'?'until_at':'created_at';const columns=kind==='reports'?'id,created_at,updated_at,actor_id,category,target,content,contact,status,response,handler_id':kind==='barrage'?'id,class_id,class_name,sender_id,sender_name,content,status,flags,created_at,reviewed_at,reason':'*';
 const r=await c.query(`SELECT ${columns} FROM ${table} ORDER BY ${order} DESC LIMIT 30 OFFSET $1`,[page*30]);const counts=await c.query(`SELECT (SELECT count(*) FROM v19_barrage WHERE status IN ('pending','flagged')) AS pending,(SELECT count(*) FROM v19_reports WHERE status IN ('received','reviewing')) AS reports,(SELECT min(created_at) FROM v19_requests) AS first_log,(SELECT count(*) FROM ${table}) AS total`);const settings=await c.query('SELECT key,value FROM v19_settings');return {rows:r.rows,...counts.rows[0],settings:Object.fromEntries(settings.rows.map(r=>[r.key,r.value])),defaultTerms:DEFAULT_TERMS};
}
export async function challenge(ip){return transaction(async c=>{await rate(c,'challenge:'+digest(ip),20,60);const a=randomInt(1,20),b=randomInt(1,20),id=randomUUID();await c.query("INSERT INTO v19_challenges(id,answer_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes')",[id,digest(id+':'+(a+b))]);return {id,question:`${a} + ${b} = ?`};});}
export async function createReport(user,input,ip,requestId){await rate(securityPool(),'report-minute:'+digest(ip),5,60);await rate(securityPool(),'report-day:'+digest(ip),20,86400);return transaction(async c=>{
 const proof=await c.query('UPDATE v19_challenges SET used=true WHERE id=$1 AND answer_hash=$2 AND used=false AND expires_at>now() RETURNING id',[input.challengeId,digest(input.challengeId+':'+input.answer.trim())]);if(!proof.rowCount||input.website)throw new Error('校验已过期或答案不正确，请刷新校验题。');
 const id=randomUUID(),token=receipt();await c.query('INSERT INTO v19_reports(id,receipt_hash,actor_id,category,target,content,contact,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,digest(token),user?.id||null,input.category,input.target,input.content,input.contact,requestId]);await event(c,user?.id||'visitor','report_create',id,{category:input.category,target:input.target},requestId);return {id,receipt:token};
});}
export async function reportStatus(token,ip){await rate(securityPool(),'report-status:'+digest(ip),30,60);return transaction(async c=>{const r=await c.query('SELECT id,created_at,updated_at,status,response FROM v19_reports WHERE receipt_hash=$1',[digest(token)]);if(!r.rowCount)throw new Error('回执码无效。');return r.rows[0];});}
export async function handleReport(user,input,requestId){return transaction(async c=>{const r=await c.query('SELECT * FROM v19_reports WHERE id=$1 FOR UPDATE',[input.id]);if(!r.rowCount)throw new Error('举报不存在。');await c.query('UPDATE v19_reports SET status=$1,response=$2,handler_id=$3,updated_at=now() WHERE id=$4',[input.status,input.response,user.id,input.id]);await event(c,user.id,'report_handle',input.id,{before:r.rows[0].status,after:input.status,response:input.response},requestId);return {ok:true};});}

export async function memberClasses(user){return (await securityPool().query(user.role==='teacher'?'SELECT id,name FROM classes ORDER BY name':'SELECT c.id,c.name FROM classes c JOIN enrollments e ON e.class_id=c.id WHERE e.user_id=$1 ORDER BY c.name',user.role==='teacher'?[]:[user.id])).rows;}
