import pg from 'pg';
import {readFile} from 'node:fs/promises';
const c=new pg.Client({connectionString:process.env.DATABASE_URL});
try{await c.connect();await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(191919)');await c.query(await readFile(new URL('../lib/step19/schema.sql',import.meta.url),'utf8'));
 const exists=await c.query("SELECT to_regclass('public.classroom_barrage') AS t");
 if(exists.rows[0].t)await c.query(`INSERT INTO v19_barrage(id,class_id,class_name,sender_id,sender_name,content,status,created_at,reason) SELECT b.id,b.class_id,COALESCE(c.name,'历史班级'),b.sender_user_id,COALESCE(u.display_name,'历史账号'),b.content,'legacy',b.created_at::timestamptz,'升级前历史内容，仅归档不重新上屏' FROM classroom_barrage b LEFT JOIN classes c ON c.id=b.class_id LEFT JOIN users u ON u.id=b.sender_user_id ON CONFLICT(id) DO NOTHING`);
 await c.query('COMMIT');console.log('[v19] additive migration complete; old tables untouched');}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error('[v19] migration failed:',e.message);process.exitCode=1;}finally{await c.end();}
