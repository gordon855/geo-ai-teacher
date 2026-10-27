import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import schema from '../lib/mainland/base-schema.json' with {type:'json'};
import {convertSqliteQueryToPostgres} from '../lib/mainland/postgres-d1.mjs';
test('fresh base schema supports all ordered versioned schemas and is idempotent',async()=>{
 const db=new PGlite();
 try{
  for(let pass=0;pass<2;pass++){
   for(const sql of schema)await db.exec(convertSqliteQueryToPostgres(sql));
   for(const version of ['step19','step20','step20-1','step20-2','step20-3','step21','step21-1','step21-3','step21-6'])await db.exec(await readFile(new URL(`../lib/${version}/schema.sql`,import.meta.url),'utf8'));
  }
  const result=await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  assert.ok(result.rows.some(r=>r.table_name==='users'));assert.ok(result.rows.some(r=>r.table_name==='presentations'));
 }finally{await db.close();}
});
