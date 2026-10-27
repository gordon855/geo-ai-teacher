import schema from '../lib/mainland/base-schema.json' with {type:'json'};
import {createPostgresD1Database} from '../lib/mainland/postgres-d1.mjs';
import {randomBytes,pbkdf2Sync} from 'node:crypto';
if(!process.env.DATABASE_URL) throw Error('DATABASE_URL required. Use the isolated demo Compose deployment.');
const url=new URL(process.env.DATABASE_URL);
if(process.env.DEMO_MODE==='1' && (!['postgres','localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/geoai_demo')) throw Error('Demo initialization is restricted to local geoai_demo.');
const db=createPostgresD1Database();
try {
 await db.batch(schema.map(sql=>db.prepare(sql)));
 if(process.env.DEMO_MODE==='1') {
  const password=process.env.DEMO_STUDENT_PASSWORD||'';
  if(password.length<10||password.startsWith('GENERATE_'))throw Error('Run npm run demo:setup first.');
  const now=new Date().toISOString();
  const statements=[db.prepare('INSERT INTO classes(id,name,course_code,term,total_hours,current_lesson_ordinal,created_at,updated_at) VALUES(?,?,?,?,24,1,?,?) ON CONFLICT(id) DO NOTHING').bind('class-demo-217','GeoAI Demo Class','DEMO-GEO-217','Demo term',now,now)];
  for(let i=1;i<=3;i++) {
   const id=`demo-student-${i}`,username=`demo_student_${i}`,salt=randomBytes(16);
   const hash=['pbkdf2-sha256',210000,salt.toString('base64url'),pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64url')].join('$');
   statements.push(db.prepare("INSERT INTO users(id,username,display_name,role,password_hash,must_change_password,disabled,created_at,updated_at) VALUES(?,?,?,'student',?,1,0,?,?) ON CONFLICT(username) DO NOTHING").bind(id,username,`Demo Student ${i}`,hash,now,now));
   statements.push(db.prepare('INSERT INTO enrollments(class_id,user_id,student_no,created_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').bind('class-demo-217',id,`DEMO${i}`,now));
  }
  await db.batch(statements);
 }
 console.log('Base schema ready; fictional demo seed is idempotent.');
} finally {await db.close();}
