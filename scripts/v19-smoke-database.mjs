// Runs ONLY in a disposable database whose name starts surveying_v19_test_.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {securityPool,submitBarrage,liveBarrage,staticBarrage,moderation,challenge,createReport,reportStatus,handleReport,requestLog} from '../lib/step19/store.mjs';
const name=new URL(process.env.DATABASE_URL).pathname.slice(1);
assert.match(name,/^surveying_v19_test_[0-9]+$/,'Refusing to test against a production database');
const db=securityPool(),teacher={id:'t',displayName:'测试教师',role:'teacher'},student={id:'s',displayName:'测试学生',role:'student'};
try{
 await db.query(`CREATE TABLE users(id text PRIMARY KEY,username text,display_name text,disabled integer DEFAULT 0); CREATE TABLE classes(id text PRIMARY KEY,name text); CREATE TABLE enrollments(user_id text,class_id text); CREATE TABLE sessions(token_hash text,user_id text,expires_at text,revoked_at text); CREATE TABLE classroom_barrage(id text,class_id text,sender_user_id text,content text,created_at text); INSERT INTO users VALUES('t','teacher','测试教师',0),('s','student','测试学生',0); INSERT INTO classes VALUES('c','测试班'); INSERT INTO enrollments VALUES('s','c'); INSERT INTO classroom_barrage VALUES('legacy','c','s','旧版本留存内容','2026-09-01T00:00:00Z');`);
 await import('./step19-migrate-postgres.mjs');
 assert.equal((await db.query("SELECT status FROM v19_barrage WHERE id='legacy'")).rows[0].status,'legacy');
 assert.equal((await db.query('SELECT count(*) AS n FROM classroom_barrage')).rows[0].n,'1');
 const msg=await submitBarrage(student,{classId:'c',content:'请解释水准仪的视准线'},'test-request');
 assert.equal(msg.status,'pending');assert.equal((await liveBarrage('c')).length,0);
 await moderation(teacher,{action:'approve',id:msg.id,reason:'课程问题'},'test-request');assert.equal((await liveBarrage('c')).length,1);
 await assert.rejects(moderation(teacher,{action:'reject',id:msg.id,reason:'并发旧状态'},'r'));
 await assert.rejects(staticBarrage({id:'outsider',role:'student'},'c'));
 await moderation(teacher,{action:'closed',closed:['*']},'r');assert.equal((await liveBarrage('c')).length,0);
 await moderation(teacher,{action:'closed',closed:[]},'r');assert.equal((await liveBarrage('c')).length,1);
 await moderation(teacher,{action:'hide',id:msg.id,reason:'测试撤下'},'r');assert.equal((await liveBarrage('c')).length,0);assert.equal((await staticBarrage(student,'c',true))[0].status,'hidden');
 await moderation(teacher,{action:'mute',id:msg.id,reason:'测试禁言',days:7},'r');await assert.rejects(submitBarrage(student,{classId:'c',content:'被禁言内容'},'r'),/禁言/);
 await moderation(teacher,{action:'unmute',id:msg.id,reason:'测试解除'},'r');
 const c=await challenge('test-ip'), nums=c.question.match(/\d+/g),answer=String(Number(nums[0])+Number(nums[1]));
 const input={category:'弹幕投诉',target:'barrage:'+msg.id,content:'仅供临时测试数据库的投诉记录。',contact:'',challengeId:c.id,answer,website:''};
 const report=await createReport(null,input,'test-ip','r');assert.equal((await reportStatus(report.receipt,'test-ip')).status,'received');
 await assert.rejects(createReport(null,input,'test-ip','r'),/校验/);
 await handleReport(teacher,{id:report.id,status:'resolved',response:'已核查，测试办结。'},'r');assert.equal((await reportStatus(report.receipt,'test-ip')).response,'已核查，测试办结。');
 const logId=await requestLog({cookies:{get:()=>null},headers:{get:()=>null},nextUrl:{pathname:'/api/test'},method:'GET'});
 await assert.rejects(db.query('DELETE FROM v19_requests WHERE id=$1',[logId]),/minimum six/);
 await assert.rejects(db.query('UPDATE v19_requests SET path=$1 WHERE id=$2',['/changed',logId]),/append-only/);
 await assert.rejects(db.query('UPDATE v19_events SET action=$1',['changed']),/append-only/);
 await db.query("INSERT INTO v19_requests(id,created_at,method,path) VALUES($1,now()-interval '8 months','GET','/old')",[randomUUID()]);
 await db.query("DELETE FROM v19_requests WHERE created_at<now()-interval '7 months'");
 assert.equal((await db.query('SELECT count(*) AS n FROM v19_requests')).rows[0].n,'1');
 console.log('PASS: legacy archive, pending/approve/hide, class permissions, mute, complaint receipt/reply/replay, six-month retention and append-only audit.');
}finally{await db.end();}
