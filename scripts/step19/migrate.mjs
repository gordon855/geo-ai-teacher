import pg from 'pg';
import { readFile } from 'node:fs/promises';
const c=new pg.Client({connectionString:process.env.DATABASE_URL});
try{await c.connect();await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('v19-schema'))");await c.query(await readFile(new URL('../../lib/step19/schema.sql',import.meta.url),'utf8'));
 const old=await c.query("SELECT to_regclass('public.classroom_barrage') AS present");if(old.rows[0].present)await c.query(`INSERT INTO v19_barrage(id,class_id,sender_id,sender_name,content,status,created_at,updated_at) SELECT b.id,b.class_id,b.sender_user_id,COALESCE(u.display_name,'历史账号'),b.content,'legacy',b.created_at::timestamptz,now() FROM classroom_barrage b LEFT JOIN users u ON u.id=b.sender_user_id ON CONFLICT(id) DO NOTHING`);
 await c.query('COMMIT');console.log('V19 additive migration complete. Existing data retained.');}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error('V19 migration failed:',e.message);process.exitCode=1;}finally{await c.end();}
