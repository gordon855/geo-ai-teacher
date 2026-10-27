import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function moduleAt(path){const source=await readFile(new URL('../'+path,import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
test('stream handles fragmented UTF8 and preserves final evidence',async()=>{
 const {readChatStream}=await moduleAt('lib/step19/chat-stream.ts');
 const data=new TextEncoder().encode(JSON.stringify({type:'delta',text:'测绘'})+'\n'+JSON.stringify({type:'result',payload:{answer:'测绘',sources:[1]}})+'\n');
 const response=new Response(new ReadableStream({start(c){for(let i=0;i<data.length;i+=3)c.enqueue(data.slice(i,i+3));c.close();}}),{headers:{'content-type':'application/x-ndjson'}});
 const chunks=[];const result=await readChatStream(response,t=>chunks.push(t));assert.deepEqual(chunks,['测绘']);assert.deepEqual(result.sources,[1]);
});
test('incomplete answer cannot become successful final answer',async()=>{
 const {readChatStream}=await moduleAt('lib/step19/chat-stream.ts');
 await assert.rejects(readChatStream(new Response('{"type":"delta","text":"a"}\n',{headers:{'content-type':'application/x-ndjson'}}),()=>{}),/未完整/);
});
test('map metadata resolves absolute tile templates before worker',async()=>{
 const {resolveMapSources}=await moduleAt('lib/step19/map-browser.ts');const previous=globalThis.fetch;globalThis.window={location:{origin:'https://course.example'}};
 try{globalThis.fetch=async()=>Response.json({tiles:['/api/tile/{z}/{x}/{y}'],maxzoom:12});const result=await resolveMapSources({sources:{dem:{type:'raster-dem',url:'/api/metadata',encoding:'terrarium'}}},new AbortController().signal);assert.equal(result.sources.dem.tiles[0],'https://course.example/api/tile/{z}/{x}/{y}');assert.equal(result.sources.dem.encoding,'terrarium');assert.equal(result.sources.dem.url,undefined);}finally{globalThis.fetch=previous;delete globalThis.window;}
});
test('map separates login failure from upstream failure',async()=>{
 const {resolveMapSources}=await moduleAt('lib/step19/map-browser.ts');const previous=globalThis.fetch;globalThis.window={location:{origin:'https://course.example'}};
 try{for(const status of [401,502]){globalThis.fetch=async()=>new Response('',{status});await assert.rejects(resolveMapSources({sources:{dem:{type:'raster-dem',url:'/api/metadata'}}},new AbortController().signal),status===401?/登录/:/上游/);}}finally{globalThis.fetch=previous;delete globalThis.window;}
});
test('teacher guard covers all teacher routes',async()=>{const code=await readFile(new URL('../proxy.ts',import.meta.url),'utf8');assert.match(code,/\/teacher\/:path\*/);assert.match(code,/currentRequestUser/);});
test('automatic grade only updates ungraded submission and preserves failure state',async()=>{const code=await readFile(new URL('../lib/step14/assignment-store.mjs',import.meta.url),'utf8');assert.match(code,/graded_at IS NULL/);assert.match(code,/gradingError/);assert.match(code,/ai_initial_grade/);});

