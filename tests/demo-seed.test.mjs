import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pbkdf2Sync} from 'node:crypto';
test('demo seed authenticatable hashes, enrollment, restart safety and remote guard',async()=>{
 const db=new PGlite();
 class Pool {
  on(){}
  async query(sql,args){const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};}
  async connect(){return {query:this.query.bind(this),release(){}};}
  async end(){}
 }
 mock.module('pg',{defaultExport:{Pool,types:{setTypeParser(){}}}});
 const before={DATABASE_URL:process.env.DATABASE_URL,DEMO_MODE:process.env.DEMO_MODE,DEMO_STUDENT_PASSWORD:process.env.DEMO_STUDENT_PASSWORD};
 Object.assign(process.env,{DATABASE_URL:'postgres://test:test@localhost/geoai_demo',DEMO_MODE:'1',DEMO_STUDENT_PASSWORD:'FictionalTestPassword123'});
 try{
  await import('../scripts/init-demo.mjs');
  const {rows}=await db.query('SELECT * FROM users ORDER BY username');assert.equal(rows.length,3);
  const [,rounds,salt,key]=rows[0].password_hash.split('$');
  assert.equal(pbkdf2Sync(process.env.DEMO_STUDENT_PASSWORD,Buffer.from(salt,'base64url'),Number(rounds),32,'sha256').toString('base64url'),key);
  assert.equal((await db.query('SELECT * FROM enrollments')).rows.length,3);
  await db.query("UPDATE users SET password_hash='changed-by-user',must_change_password=0 WHERE username='demo_student_1'");
  await import('../scripts/init-demo.mjs?restart');
  assert.equal((await db.query("SELECT password_hash FROM users WHERE username='demo_student_1'")).rows[0].password_hash,'changed-by-user');
  process.env.DATABASE_URL='postgres://test:test@remote.invalid/geoai_demo';
  await assert.rejects(import('../scripts/init-demo.mjs?remote'),/restricted to local/);
 }finally{for(const [key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;await db.close();}
});
