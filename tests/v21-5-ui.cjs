// Real PPT renderer/browser/fullscreen. Mock only authenticated HTTP, avatar modal and speech output.
const {build}=require('esbuild'),{chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'v215-ui-'));
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Stage from './components/presentation/teacher-presentation-workspace';createRoot(document.getElementById('root')).render(<Stage teacherName="郭老师"/>);`,resolveDir:root,loader:'tsx'},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',plugins:[{name:'mock-avatar',setup(b){b.onResolve({filter:/fullscreen-local-digital-teacher$/},()=>({path:'avatar',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export default function Avatar(){return null}`,loader:'tsx',resolveDir:root}));}}]});
const server=http.createServer((req,res)=>{if(req.url==='/ui.js'||req.url==='/ui.css'){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(out,req.url.slice(1))));}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="/ui.css"><style>body{font-family:Arial;background:#edf5f7;margin:0}*{box-sizing:border-box}</style><div id="root"></div><script src="/ui.js"></script></html>')}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;try{
 browser=await chromium.launch({headless:true});
 for(const shape of ['wide','portrait']){
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.spoken=[];Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel:()=>{},speak:u=>{window.spoken.push(u.text);u.onstart?.();u.onend?.();}}});});
 const deck=fs.readFileSync(path.join(process.env.TEST_DECK_DIR||path.join(__dirname,'fixtures/v215'),shape+'.pptx'));
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/file'))return route.fulfill({body:deck,contentType:'application/octet-stream'});if(url.pathname.endsWith('/highlights'))return route.fulfill({json:{terms:[]}});if(url.pathname.endsWith('/translate')){const {selection}=route.request().postDataJSON();return route.fulfill({json:{translation:{selectedText:selection,translation:'精密度与准确度',contextMeaning:'测量结果的一致性与接近真值的程度',explanation:'结合测绘语境解释',citation:'测试教材',otherMeanings:[]}}});}return route.fulfill({json:{presentation:{version:shape,originalName:shape+'.pptx',size:deck.length,updatedAt:new Date().toISOString(),updatedBy:'郭老师'}}});});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'全屏',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='全屏'&&!b.disabled)).catch(async e=>{console.error(await page.locator('body').innerText(),errors);throw e});
 await page.getByRole('button',{name:'全屏',exact:true}).click();await page.waitForFunction(()=>document.fullscreenElement?.tagName==='ARTICLE');
 await page.waitForTimeout(800);
 const dimensions=await page.evaluate(()=>{const stage=document.fullscreenElement,viewport=stage.querySelector('[class*=viewport]'),canvas=viewport.firstElementChild;return {w:innerWidth,h:innerHeight,stage:stage.getBoundingClientRect().toJSON(),canvas:canvas.getBoundingClientRect().toJSON(),scroll:viewport.scrollWidth,sw:viewport.clientWidth,sh:viewport.clientHeight,scrollH:viewport.scrollHeight};});
 assert.equal(dimensions.stage.width,1440);assert.equal(dimensions.stage.height,900);assert.ok(dimensions.canvas.width<=1440.5&&dimensions.canvas.height<=900.5,JSON.stringify(dimensions));assert.ok(dimensions.scroll<=dimensions.sw+1&&dimensions.scrollH<=dimensions.sh+1,JSON.stringify(dimensions));
 await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.fullscreenElement?.textContent.includes('2 / 2'));await page.keyboard.press('ArrowLeft');
 await page.mouse.move(600,885);await page.getByRole('button',{name:'自动朗读关',exact:true}).click();
 await page.evaluate(()=>{const root=document.fullscreenElement.querySelector('[class*=canvas]');const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(n.textContent.includes('Precision')){const r=document.createRange();r.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(r);root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));break;}}});
 await page.locator('[role=status]').getByText('精密度与准确度',{exact:true}).waitFor();await page.waitForFunction(()=>window.spoken.length===1);
 await page.screenshot({path:`/tmp/v215-${shape}-fullscreen.png`});
 await page.getByRole('button',{name:'字幕开',exact:true}).click();assert.equal(await page.locator('[role=status]').count(),0);
 await page.getByRole('button',{name:'退出全屏',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement);
 assert.equal(await page.getByRole('link',{name:'一键启动本机 LiteAvatar'}).getAttribute('href'),'liteavatar215://start/classroom');
 assert.deepEqual(errors,[]);await page.close();console.log('PASS',shape,'real renderer, full slide bounds, no clipping, arrow navigation, translation overlay, speech dispatch, toggle, exit');
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(out,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
