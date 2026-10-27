import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { zipSync, strToU8 } from 'fflate';

register('./support/resolve-loader.mjs', import.meta.url);
mock.module('server-only', { namedExports: {} });
mock.module('../lib/step8a/database.ts', { namedExports: { ensureSchema: async () => {} } });
mock.module('../lib/step14/presentation-analysis.mjs', { namedExports: { analyzePresentationDeck: () => ({slideCount:2,underlineCount:1,termCount:3}) } });
let role='teacher';
mock.module('../lib/step8a/session.ts', { namedExports: {
  requireRequestRole: async () => role==='teacher' ? {ok:true,user:{displayName:'测试教师'}} : {ok:false,status:role?403:401,error:'无权限'},
  currentRequestUser: async () => role ? {role} : null,
} });
mock.module('../lib/step8a/api.ts', { namedExports: {
  assertSameOrigin: (r) => { if(r.headers.get('origin')!=='https://test.local') throw Error('来源错误'); },
  noStoreJson: (p,init={}) => Response.json(p,{...init,headers:{'Cache-Control':'no-store'}}),
  jsonError: e => Response.json({ok:false,error:e.message},{status:400}),
} });
const sql=new PGlite();
class Pool { on(){} async query(q,args) {const r=args?.length?await sql.query(q,args):(await sql.exec(q)).at(-1)||{rows:[]};return {...r,rowCount:r.affectedRows ?? r.rows.length};} async connect(){return {query:this.query.bind(this),release(){}};} }
mock.module('pg',{defaultExport:{Pool,types:{setTypeParser(){}}}});
const {createPostgresD1Database}=await import('../lib/mainland/postgres-d1.mjs');
const objects=new Map();
globalThis.__SURVEYING_RUNTIME_ENV__={ DB:createPostgresD1Database({connectionString:'postgres://test'}), BUCKET:{
  async put(k,b){objects.set(k,b.slice());},async head(k){const b=objects.get(k);return b?{size:b.length}:null;},async get(k){const b=objects.get(k);return b?{arrayBuffer:async()=>b.slice().buffer}:null;},
}};
const store=await import('../lib/step11-7/presentation-store.mjs');
const api=await import('../app/api/presentation/catalog/route.ts');
const fileApi=await import('../app/api/presentation/file/route.ts');
// Fixed ZIP timestamps keep repeated fixture generation byte-identical.
function ppt(text){return zipSync({'ppt/presentation.xml':strToU8('<p:presentation>'+text+'</p:presentation>'),'ppt/slides/slide1.xml':strToU8('<p:sld/>')},{mtime:new Date(2020,0,1)});}
function request(url,init={}) {const r=new Request('https://test.local'+url,{...init,headers:{origin:'https://test.local',...init.headers}});r.nextUrl=new URL(r.url);return r;}
test('PPT catalog uses existing PostgreSQL data and authorized routes',async(t)=>{
 try {
 await sql.exec('CREATE TABLE presentations(id text PRIMARY KEY,original_name text NOT NULL,object_key text UNIQUE,size integer,version text UNIQUE,slide_text_json text,updated_by text,updated_at text,is_current integer DEFAULT 1);CREATE UNIQUE INDEX presentations_current_idx ON presentations(is_current) WHERE is_current=1');
 const a=await store.replacePresentation({bytes:ppt('A'),originalName:'原有21.2课件.pptx',updatedBy:'老师'});
 let b;
 await t.test('uploads do not change current; duplicate data is deduplicated',async()=>{
 b=await store.savePresentation({bytes:ppt('B'),originalName:'新课件B.pptx',updatedBy:'老师'});
 assert.equal((await store.readPresentationMetadata()).version,a.version);
 assert.equal((await store.listPresentationCatalog()).length,2);
 const duplicate=await store.savePresentation({bytes:ppt('B'),originalName:'同内容重命名.pptx',updatedBy:'老师'});
 assert.equal(duplicate.duplicate,true);assert.equal((await store.listPresentationCatalog()).length,2);
 });
 await t.test('select B then A, preserving both files; stale file request is rejected',async()=>{
 await store.selectPresentation(b.version);assert.equal((await store.readCurrentPresentation()).metadata.version,b.version);
 assert.equal((await store.listPresentationCatalog()).filter(p=>p.isCurrent).length,1);
 assert.equal((await fileApi.GET(request('/api/presentation/file?v='+a.version))).status,409);
 const response=await fileApi.GET(request('/api/presentation/file?v='+b.version));assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),ppt('B'));
 await store.selectPresentation(a.version);assert.equal((await store.readCurrentPresentation()).metadata.version,a.version);assert.equal(objects.size,2);
 });
 await t.test('invalid, unavailable and corrupt files never clear current',async()=>{
 await assert.rejects(store.selectPresentation('0'.repeat(16)));
 objects.delete(b.objectKey);await assert.rejects(store.selectPresentation(b.version));
 await assert.rejects(store.savePresentation({bytes:ppt('C'),originalName:'old.ppt',updatedBy:'t'}));
 await assert.rejects(store.savePresentation({bytes:new Uint8Array(25),originalName:'bad.pptx',updatedBy:'t'}));
 assert.equal((await store.readPresentationMetadata()).version,a.version);
 });
 await t.test('students and anonymous users cannot list, upload or activate',async()=>{
 for (const r of ['student',null]) {role=r;for(const method of ['GET','POST','PATCH']) {const response=await api[method](request('/api/presentation/catalog',{method}));assert.equal(response.status,r?403:401);}}
 role='teacher';
 const r=await api.GET(request('/api/presentation/catalog'));const data=await r.json();assert.equal(data.presentations.length,2);assert.ok(!('objectKey' in data.presentations[0]));assert.equal(r.headers.get('cache-control'),'no-store');
 });
 await t.test('teacher upload and activate flow; reject cross-origin changes',async()=>{
 const form=new FormData();form.set('file',new File([ppt('C')],'课件C.pptx'));
 const uploaded=await api.POST(request('/api/presentation/catalog',{method:'POST',body:form}));assert.equal(uploaded.status,201);const c=(await uploaded.json()).presentation;
 assert.equal((await store.readPresentationMetadata()).version,a.version);
 const switched=await api.PATCH(request('/api/presentation/catalog',{method:'PATCH',body:JSON.stringify({version:c.version})}));assert.equal(switched.status,200);assert.equal((await store.readPresentationMetadata()).version,c.version);
 const denied=await api.PATCH(request('/api/presentation/catalog',{method:'PATCH',body:JSON.stringify({version:a.version}),headers:{origin:'https://foreign.local'}}));assert.equal(denied.status,400);assert.equal((await store.readPresentationMetadata()).version,c.version);
 });
 } finally {await sql.close();delete globalThis.__SURVEYING_RUNTIME_ENV__;}
});
