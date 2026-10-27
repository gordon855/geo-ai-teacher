import test from 'node:test';
import assert from 'node:assert/strict';
import {generateExactTranslation,normalizeSelection,usableTranslation} from '../lib/step19/selection-translation.mjs';
import {screenContent,decideStatus,publicMessage,receipt,digest} from '../lib/step19/policy.mjs';
const clause='Neglecting for the present various forms of rough leveling instruments';
test('whole clause: rejected one-word answer is repaired without changing the requested target',async()=>{
 let calls=0;const result=await generateExactTranslation(clause,[{role:'user',content:clause}],async(messages)=>{calls++;assert.match(messages[0].content,/Neglecting for the present various forms/);return JSON.stringify({targetText:clause,translation:calls===1?'暂且忽略':'暂且不讨论各种形式的粗略水准测量仪器。'});});assert.equal(calls,2);assert.equal(result.translation,'暂且不讨论各种形式的粗略水准测量仪器。');
});
test('word, phrase and sentence preserve exact source boundary',async()=>{
 for(const [source,translation] of [['level','水准仪'],['line of sight','视准线'],['The telescope rotates about a vertical axis.','望远镜绕竖直轴旋转。']]){let seen;const result=await generateExactTranslation(source,[],async messages=>{seen=messages;return JSON.stringify({targetText:source,translation});});assert.equal(result.targetText,source);assert.ok(seen[0].content.includes(JSON.stringify(source)));}
});
test('a stale or shorter target cannot be returned as success',async()=>{
 assert.equal(usableTranslation({targetText:'Neglecting',translation:'暂且忽略'},clause),false);
 await assert.rejects(generateExactTranslation(clause,[],async()=>JSON.stringify({targetText:clause,translation:'暂且忽略'})),/完整译文/);
});
test('normalization keeps all selected words across DOM line breaks',()=>assert.equal(normalizeSelection('Neglecting\n for the present\n various forms'),'Neglecting for the present various forms'));
test('all new barrage remains pending even when no risk word is detected',()=>{assert.deepEqual(screenContent('请解释视准轴'),[]);assert.equal(decideStatus('pending','approve'),'approved');assert.throws(()=>decideStatus('rejected','approve'));assert.throws(()=>decideStatus('hidden','approve'));assert.equal(decideStatus('approved','hide'),'hidden');});
test('risk hints handle compatibility characters and whitespace, without claiming exhaustive detection',()=>{assert.ok(screenContent('代 开 发 票').includes('代开发票'));assert.ok(screenContent('www.example.com').includes('链接或引流信息'));assert.ok(screenContent('特殊词',['特殊词']).includes('特殊词'));});
test('public barrage projection never includes private sender identity',()=>{const view=publicMessage({id:'a',class_id:'c',class_name:'测试班',sender_id:'private',sender_name:'姓名',content:'内容',created_at:new Date(),reviewed_at:new Date(),display_until:new Date()});assert.equal(view.anonymousLabel,'匿名学生');assert.equal(JSON.stringify(view).includes('private'),false);assert.equal('senderName' in view,false);});
test('complaint receipts are unguessable and only digests need storage',()=>{const a=receipt(),b=receipt();assert.match(a,/^[a-f0-9]{48}$/);assert.notEqual(a,b);assert.match(digest(a),/^[a-f0-9]{64}$/);});
