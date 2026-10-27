import {readFile,writeFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
const rows=gunzipSync(Buffer.from((await readFile('lib/cloud/knowledge-chunks.jsonl.gz.b64','utf8')).replace(/\s/g,''),'base64')).toString().trim().split('\n').map(JSON.parse);
const highlights=JSON.parse(await readFile('lib/step10/textbook-highlights.json','utf8'));
const tidy=s=>s.replace(/\s+/g,' ').trim();const bank=[];
for(let unit=1;unit<=54;unit++){
 const chunks=rows.filter(r=>r.attributes.source_type==='textbook'&&Number(r.attributes.unit)===unit);
 const text=chunks.map(r=>r.content.replace(/^\s*[#>].*$/gm,'')).join('\n');
 const questions=[],seen=new Set();let sentences=highlights.filter(h=>h.unit===unit).map(h=>({en:h.original,zh:h.textbookTranslation,source:`教材原始划线 Unit ${unit} · 第${h.sequence}组`}));
 if(!sentences.length){const notes=text.split(/Notes\s+to\s+the\s+Text/i).slice(1).join('\n');for(const m of notes.matchAll(/(?:^|\n)\s*\d+[.．]\s*([\s\S]*?)译文\s*[:：]\s*([\s\S]*?)(?=\n\s*\d+[.．]\s|$)/g)){const en=tidy(m[1]),zh=tidy(m[2]);if(en&&zh)sentences.push({en,zh,source:`教材 Notes to the Text · Unit ${unit}（未核实原书划线）`});}}
 for(const [i,v] of sentences.entries()){if(seen.has(v.en))continue;seen.add(v.en);questions.push({id:`U${unit}-S${i}-T`,unit,kind:'sentence',prompt:'请将以下完整句段译成中文：\n'+v.en,answer:v.zh,source:v.source});questions.push({id:`U${unit}-S${i}-P`,unit,kind:'principle',prompt:'请解释以下句段涉及的专业原理、适用条件，并举例说明：\n'+v.en,answer:'以英文原意为准，解释概念、条件和例子。教材译文参考：'+v.zh,source:v.source});}
 const words=text.split(/(?:New\s*)?Words?\s+and\s+Expressions?/i).slice(1).join('\n').split(/Notes\s+to\s+the\s+Text/i)[0]||'';
 let n=0;for(const raw of words.replace(/\[[^\]]*\]/g,'').split(/\n+/)){const line=tidy(raw.replace(/\[[^\]]*\]/g,''));const m=line.match(/^([A-Za-z][A-Za-z\s.'()/-]*?)\s*(?:(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|pl|abbr)\.\s*|[:：]\s*)([\s\S]*[\u4e00-\u9fff][\s\S]*)$/i);if(!m)continue;const en=tidy(m[1]),zh=tidy(m[2]);if(en.length>100||seen.has(en.toLowerCase()))continue;seen.add(en.toLowerCase());questions.push({id:`U${unit}-V${n}-E`,unit,kind:'en-zh',prompt:'请写出本单元测绘语境中的中文含义：'+en,answer:zh,source:`教材单元末重点词汇 · Unit ${unit}`},{id:`U${unit}-V${n}-C`,unit,kind:'zh-en',prompt:'请写出本单元对应的英文词或短语：'+zh,answer:en,source:`教材单元末重点词汇 · Unit ${unit}`});n++;}
 if(questions.length<20||!questions.some(q=>q.kind==='sentence'))throw Error(`Unit ${unit} insufficient: ${questions.length}`);
 bank.push({unit,title:chunks[0]?.content.split('\n')[0].replace(/^#+\s*/,''),underlineVerified:highlights.some(h=>h.unit===unit),questions});
}
await writeFile('lib/step20/bank.json',JSON.stringify(bank,null,2)+'\n');console.log(`${bank.length} units, ${bank.reduce((n,u)=>n+u.questions.length,0)} questions`);
