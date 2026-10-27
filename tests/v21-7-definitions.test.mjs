import test from 'node:test';import assert from 'node:assert/strict';
import {assessmentBank,definitions} from '../lib/step21-7/assessment-bank.mjs';
import original from '../lib/step20-1/course-bank.json' with {type:'json'};
import policy from '../lib/step20-1/course-policy.json' with {type:'json'};
import {makePaper,publicQuestions} from '../lib/step20/exam.mjs';
test('68 grounded definitions cover all 17 formal units, answers not exposed',()=>{
 assert.equal(definitions.length,68);assert.equal(new Set(definitions.map(q=>q.id)).size,68);
 for(const u of policy.units){const ds=definitions.filter(q=>q.unit===u);assert.equal(ds.length,4);assert.equal(new Set(ds.map(q=>q.answer.split('：')[0])).size,4);for(const q of ds){const source=original.find(x=>x.unit===u).questions.find(x=>x.id===q.sourceQuestionId);assert.ok(source.prompt.includes(q.sourceExcerpt));assert.match(q.source,/非教材逐字引文/);assert.ok(q.rubric);assert.ok(!q.prompt.includes('请解释以下句段'));}}
 for(const q of publicQuestions(definitions)){assert.equal(q.answer,undefined);assert.equal(q.rubric,undefined);assert.equal(q.sourceExcerpt,undefined);assert.ok(q.questionType);}
});
test('formal papers retain 20 questions, grading weights and coverage',()=>{
 const bank=assessmentBank.flatMap(u=>u.questions);
 for(const units of [...policy.rounds.map(r=>r.units),...policy.units.map(u=>[u]),policy.units])for(let i=0;i<25;i++){
 const qs=makePaper(bank,units,policy.blueprint);assert.equal(qs.length,20);assert.equal(new Set(qs.map(q=>q.id)).size,20);
 for(const u of units)assert.ok(qs.some(q=>q.unit===u));for(const [kind,n] of Object.entries(policy.blueprint))assert.equal(qs.filter(q=>q.kind===kind).length,n);
 assert.ok(qs.filter(q=>q.kind==='principle').every(q=>q.bankVersion==='21.7'));
 }
});
