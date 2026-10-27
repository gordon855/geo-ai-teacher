import test from 'node:test';import assert from 'node:assert/strict';
import {fitSlideWidth,translationSpeech} from '../lib/step21-5/presentation.mjs';
test('wide, portrait and square slides fit both viewport dimensions without cropping',()=>{
 for(const [w,h] of [[1920,1080],[1440,900],[390,844]])for(const [sw,sh] of [[16,9],[4,3],[3,4],[1,1]]){const width=fitSlideWidth(w,h,sw,sh);assert.ok(width<=w);assert.ok(width*sh/sw<=h);assert.ok(width>0);}
 assert.equal(fitSlideWidth(0,0,16,9),1);
});
test('speech uses current translation and context; no undefined fields',()=>{
 assert.equal(translationSpeech({translation:'精密度',contextMeaning:'重复测量的一致性'}),'精密度。重复测量的一致性');
 assert.equal(translationSpeech({translation:'准确度'}),'准确度');
});
