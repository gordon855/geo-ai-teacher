import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {securityPool} from '../lib/step19/store.mjs';import {mutate,detail,list} from '../lib/step21-3/store.mjs';
assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/surveying_v19_test_[0-9]+$/,'仅允许独立测试数据库');
const db=securityPool(),t={id:'t',role:'teacher'},s={id:'s',role:'student'};
try{
 await db.query("CREATE TABLE IF NOT EXISTS lessons(id text PRIMARY KEY,class_id text);CREATE TABLE IF NOT EXISTS attendance(id text PRIMARY KEY,class_id text,lesson_id text,student_user_id text,status text,note text,recorded_by text,created_at text,updated_at text,UNIQUE(lesson_id,student_user_id));INSERT INTO lessons(id,class_id) VALUES('v213-lesson','c') ON CONFLICT DO NOTHING;");
 const sql=readFileSync(new URL('../lib/step21-3/schema.sql',import.meta.url),'utf8');await db.query(sql);await db.query(sql);
 await assert.rejects(mutate(s,{action:'start',classId:'c',lessonId:'v213-lesson',title:'测试',minutes:2}));
 await assert.rejects(mutate(t,{action:'start',classId:'other',lessonId:'v213-lesson',title:'测试',minutes:2}));
 const {id}=await mutate(t,{action:'start',classId:'c',lessonId:'v213-lesson',title:'测试',minutes:2});
 await assert.rejects(mutate(t,{action:'start',classId:'c',lessonId:'v213-lesson',title:'重复',minutes:2}),/已有/);
 await assert.rejects(detail(s,id));await assert.rejects(detail({id:'other',role:'teacher'},id));
 const d=await detail(t,id);assert.match(d.code,/^\d{6}$/);assert.equal(d.rows[0].submitted_at,null);
 const wrong=d.code==='000000'?'111111':'000000';await assert.rejects(mutate(s,{action:'submit',id,code:wrong}),/错误/);
 await assert.rejects(mutate({id:'outsider',role:'student'},{action:'submit',id,code:d.code}),/不属于/);
 await mutate(s,{action:'submit',id,code:d.code});await mutate(s,{action:'submit',id,code:d.code});
 assert.equal((await db.query('SELECT count(*) AS n FROM v213_receipts WHERE session_id=$1',[id])).rows[0].n,'1');
 assert.equal((await db.query("SELECT count(*) AS n FROM attendance WHERE lesson_id='v213-lesson'")).rows[0].n,'0');
 const student=(await list(s,''))[0];assert.ok(student.submitted_at);assert.ok(!('code'in student)&&!('secret'in student));
 await assert.rejects(mutate(t,{action:'review',id,userId:'outsider',status:'present'}));
 await mutate(t,{action:'review',id,userId:'s',status:'present'});assert.equal((await db.query("SELECT status FROM attendance WHERE lesson_id='v213-lesson'")).rows[0].status,'present');
 await mutate(t,{action:'count',id,estimated:2,confirmed:1,note:'人工修正'});assert.equal((await detail(t,id)).counts[0].confirmed,1);
 await mutate(t,{action:'close',id});await assert.rejects(mutate(s,{action:'submit',id,code:d.code}),/结束/);assert.equal((await detail(t,id)).code,null);
 const next=await mutate(t,{action:'start',classId:'c',lessonId:'v213-lesson',title:'过期测试',minutes:1});await db.query("UPDATE v213_checkins SET ends_at=now()-interval '1 second' WHERE id=$1",[next.id]);await assert.rejects(mutate(s,{action:'submit',id:next.id,code:'000000'}),/结束/);
 console.log('PASS 21.3 permissions, membership, duplicate/expired codes, teacher review, count records and additive migration');
}finally{await db.end();}
