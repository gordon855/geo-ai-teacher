import test from 'node:test';
import assert from 'node:assert/strict';
import {TEXTBOOK_HIGHLIGHTED_SENTENCES,getTextbookHighlightsForLesson} from '../lib/step10/textbook-highlights.ts';
test('all original demo highlights load and map to a valid lesson without crashing dashboard SSR',()=>{
 assert.equal(TEXTBOOK_HIGHLIGHTED_SENTENCES.length,68);
 const mapped=Array.from({length:12},(_,i)=>getTextbookHighlightsForLesson(i+1)).flat();
 assert.equal(mapped.length,68);
 assert.equal(new Set(mapped.map(x=>x.id)).size,68);
 for(const unit of [9,27])assert.equal(mapped.filter(x=>x.textbookUnit===unit).length,4);
});
