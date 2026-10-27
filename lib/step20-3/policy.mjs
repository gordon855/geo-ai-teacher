import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {validateVariants} from '../step20-2/policy.mjs';
export const RULE=Object.freeze({version:'20.3-r1',days:[3,7],count:3,percent:80,minItem:3,weeklyCap:2,timezone:'Asia/Shanghai',officialGrades:false});
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sourceRevision=l=>digest([l.source_changed,l.verify_status,l.verify_marks,l.verify_questions]);
export function classify(marks,rule=RULE){if(marks.length!==3||marks.some(m=>m.uncertain))return{outcome:'review',score:null};const score=Math.round(marks.reduce((n,m)=>n+m.score,0)/15*100);return{score,outcome:score>=rule.percent&&marks.every(m=>m.score>=rule.minItem)?'retained':'needs_support'};}
export function ruleWith(percent,minItem){if(!Number.isFinite(percent)||percent<60||percent>100||!Number.isFinite(minItem)||minItem<0||minItem>5)throw Error('规则须为60–100%，单题0–5分');return{...RULE,percent,minItem,version:`20.3-r1:${percent}:${minItem}`};}
export const eligible=l=>!l.source_changed&&l.verify_status==='graded'&&classify(l.verify_marks||[]).outcome==='retained';
export function variants(value,anchors,previous){const qs=validateVariants(value,anchors),compact=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');for(const q of qs)if(previous.some(p=>compact(p.prompt)===compact(q.prompt)||compact(p.context)===compact(q.context)))throw Error('新题与历史练习重复');return qs;}
export const signTick=(timestamp,key)=>createHmac('sha256',key).update('obe203:'+timestamp).digest('hex');
export function validTick(timestamp,signature,key,now=Date.now()){if(!key||!/^\d{13}$/.test(timestamp)||Math.abs(now-Number(timestamp))>60000||!/^\w{64}$/.test(signature))return false;return timingSafeEqual(Buffer.from(signTick(timestamp,key)),Buffer.from(signature));}
