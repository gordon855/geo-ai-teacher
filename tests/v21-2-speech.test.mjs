import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechQueue, takeSpeechSegment, speechText } from '../lib/step21-2/speech-queue.mjs';
const tick = () => new Promise(r => setTimeout(r, 0));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test('Chinese punctuation needs no following space; final short tail survives', () => {
  const s = '水准测量通过水平视线求取两点间高差。然后校核。';
  const a = takeSpeechSegment(s); assert.equal(a.segment, '水准测量通过水平视线求取两点间高差。');
  assert.equal(takeSpeechSegment(a.rest, true).segment, '然后校核。');
  assert.equal(speechText('高差[S12]是 h。'), '高差是 h。');
});
test('all characters survive streamed chunking, including citation fragments and emoji', () => {
  const text = '地形测量中的控制点 [S12] 🌏'.repeat(35) + '结束。';
  let tail = text; let joined = '';
  while (tail) { const x = takeSpeechSegment(tail, true); assert.ok(x.segment); assert.ok(!/[\uD800-\uDBFF]$/.test(x.segment)); joined += x.segment; tail = x.rest; }
  assert.equal(joined, text);
});
test('first sentence plays before final result, final flush never duplicates', async () => {
  const played = []; const q = new SpeechQueue({ fetchAudio: async t => new Blob([t]), playAudio: async (b, t) => { played.push(t); } });
  const first = '全站仪能够同时测量角度和距离。';
  q.push(first); await tick(); assert.deepEqual(played, [first]);
  q.push(first + '这是一句补充。', true); await tick();
  assert.deepEqual(played, [first, '这是一句补充。']);
});
test('prefetch is bounded; playback remains ordered when later audio arrives first', async () => {
  const requests = []; const played = []; const gates = [];
  const q = new SpeechQueue({ fetchAudio: t => { requests.push(t); const gate = deferred(); gates.push(gate); return gate.promise; }, playAudio: async (b,t) => { played.push(t); } });
  const sentences = ['第一句的语音应该按照顺序播报。','第二句虽然先到达也不能抢先说。','第三句在前两句之后开始合成。'];
  q.push(sentences.join(''), true); await tick(); assert.equal(requests.length, 2);
  gates[1].resolve(new Blob()); await tick(); assert.equal(played.length, 0);
  gates[0].resolve(new Blob()); await tick(); assert.deepEqual(played, sentences.slice(0,2));
  gates[2].resolve(new Blob()); await tick(); assert.deepEqual(played, sentences);
});
test('cancellation aborts synthesis and prevents stale playback', async () => {
  const wait = deferred(); let played = false; let signal;
  const q = new SpeechQueue({ fetchAudio: (t,s) => { signal=s; return wait.promise; }, playAudio: async () => { played=true; } });
  q.push('这一句话足够长并且会被用户中途取消。'); await tick(); q.cancel();
  assert.equal(signal.aborted, true); wait.resolve(new Blob()); await tick(); assert.equal(played, false);
});
test('upstream rewritten final answer stops old audio instead of reading conflicting text', async () => {
  let calls=0; const q = new SpeechQueue({ fetchAudio: async () => new Blob(), playAudio: async () => {calls++;} });
  q.push('原始答案'); q.push('经过审核的修订答案',true); await tick(); assert.equal(calls,0);
});
test('TTS failure is reported once and later text does not restart failed queue', async () => {
  let errors=0; let calls=0;
  const q=new SpeechQueue({fetchAudio: async()=>{calls++;throw Error('TTS offline');},playAudio:async()=>{},onError:()=>{errors++;}});
  const first='这个回答即使语音失败也应当保留文字。';q.push(first);await tick();q.push(first+'继续回答。',true);await tick();
  assert.equal(errors,1);assert.equal(calls,1);
});
