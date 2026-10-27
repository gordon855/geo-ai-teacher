// Browser integration harness: production React flow; mock voice, gateway and course API.
// ESBUILD_PATH and PLAYWRIGHT_PATH point to separately installed test dependencies.
const path=require('path'),http=require('http'),assert=require('node:assert/strict');
const esbuild=require(process.env.ESBUILD_PATH||'esbuild'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 let server,browser;const speech=[],evaluations=[],lectures=[];let allowReady=false,gateOpen=false;
 try{
 const event={id:'event217',classId:'c',lessonId:'lesson1',student:{id:'s',name:'张同学',studentNo:'001'},question:{id:'q',kind:'concept',prompt:'什么是随机误差？',source:'Unit 1'},spokenText:'请张同学回答：什么是随机误差？',answerWindowSeconds:60};
 const output=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Teacher from './components/avatar/fullscreen-local-digital-teacher';const isPpt=location.search.includes('ppt');createRoot(document.getElementById('root')).render(<Teacher open preferredProvider="lite" coldCallRequest={isPpt?null:${JSON.stringify(event)}} presentationLecture={isPpt?{requestId:'slide3',version:'deck217',presentationName:'测绘课件.pptx',slideNumber:3,slideCount:10}:null} onClose={()=>window.closedPanel=true} onFallbackVoice={()=>{}}/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:'/tmp/v217-qa.js',format:'iife',jsx:'automatic',tsconfig:path.join(root,'tsconfig.json'),loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'mock-boundaries',setup(b){b.onResolve({filter:/liveavatar-stage$/},()=>({path:'live',namespace:'qa'}));b.onResolve({filter:/use-smart-voice$/},()=>({path:'voice',namespace:'qa'}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},a=>({loader:'jsx',resolveDir:root,contents:a.path==='live'?`export default function Live(){throw Error('Unexpected LiveAvatar fallback')}`:a.path==='link'?`export default function Link(p){return <a {...p}/>} `:`export function useSmartVoice(){return {isRecording:false,isTranscribing:false,error:'',clearError(){},cancelRecording(){},recordUntilSilence(){return new Promise(resolve=>{window.resolveVoice=resolve})}}}` }));}}]});
 let port;
 server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end(output.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'');return;}
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(output.outputFiles[0].text);return;}
 if(url.pathname==='/api/avatar/classroom-config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({liteavatar:`http://127.0.0.1:${port}`}));return;}
 if(url.pathname==='/ui/teacher217.html'){
 if(!gateOpen){res.statusCode=502;res.end('gateway loading');return;}
 res.setHeader('Content-Type','text/html');res.end(`<body>Mock RTC gateway<script>const tell=(type,x={})=>parent.postMessage({protocol:'teacher213',type,...x},location.origin);addEventListener('message',e=>{if(e.source!==parent)return;const m=e.data;if(m.type==='hello')tell('loaded',{version:217});if(m.type==='connect'){fetch('/connect').then(r=>r.json()).then(x=>{if(x.ready)tell('ready',{ready:true});})}if(m.type==='speak'){fetch('/speech',{method:'POST',body:JSON.stringify(m)}).then(()=>tell('finished',{id:m.id}));}});tell('loaded',{version:217});</script>`);return;}
 if(url.pathname==='/connect'){res.end(JSON.stringify({ready:allowReady}));return;}
 let body='';for await(const part of req)body+=part;
 if(url.pathname==='/speech'){speech.push(JSON.parse(body).text);res.end('ok');return;}
 if(url.pathname==='/api/classroom/cold-call'){
 if(req.method!=='POST')throw Error('Explicit task must not poll broadcast');evaluations.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({attempt:{responseText:JSON.parse(body).studentAnswer,score:8,timedOut:false,evaluation:{score:8,verdict:'基本正确',feedback:'已正确描述观测差异。',correction:'还应补充排除粗差和系统误差后仍然存在。',standardAnswer:'随机误差',rubric:'定义和特征',teacherReviewRequired:true}}}));return;}
 if(url.pathname==='/api/presentation/explain'){lectures.push(JSON.parse(body));res.setHeader('Content-Type','text/event-stream');res.end('data: '+JSON.stringify({type:'delta',text:'本页讲解：水准仪用于测定高差。'})+'\n\ndata: {"type":"done"}\n\n');return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1500,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}`);await page.waitForTimeout(900);assert.equal(speech.length,0);gateOpen=true;await page.waitForTimeout(5400);assert.equal(speech.length,0);
 allowReady=true;await page.getByRole('button',{name:'重试连接'}).click();await page.waitForFunction(()=>typeof window.resolveVoice==='function');assert.ok(speech.join('').includes('张同学'));assert.ok(speech.join('').includes('随机误差'));assert.equal(evaluations.length,0);
 await page.evaluate(()=>window.resolveVoice('仪器观测中不规则的差异'));await page.getByRole('button',{name:'确认回答并讲评'}).waitFor();await page.waitForTimeout(400);assert.equal(evaluations.length,0);
 await page.getByLabel('输入被点名学生的回答').fill('排除粗差与系统误差后仍存在的不规则差异');await page.getByRole('button',{name:'确认回答并讲评'}).click();await page.getByText('本轮课堂提问已完成。',{exact:false}).waitFor();assert.equal(evaluations.length,1);assert.equal(evaluations[0].action,'evaluate');assert.ok(speech.join('').includes('还应补充'));assert.equal(errors.length,0,errors.join('\n'));
 await page.goto(`http://127.0.0.1:${port}/?ppt`);await page.waitForFunction(()=>typeof window.resolveVoice==='function');assert.deepEqual(lectures,[{version:'deck217',slideNumber:3}]);assert.ok(speech.join('').includes('本页讲解'));assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS browser: startup retry, RTC-ready gating, named question, transcription confirmation, single evaluation, correction speech, exact PPT slide');
 }finally{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());}
})().catch(e=>{console.error(e);process.exitCode=1;});
