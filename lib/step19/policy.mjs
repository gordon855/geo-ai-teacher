import { createHash, randomBytes } from 'node:crypto';
export const digest = s => createHash('sha256').update(String(s)).digest('hex');
export const receipt = () => randomBytes(24).toString('hex');
export const DEFAULT_TERMS=['代开发票','出售银行卡','买卖身份证','裸聊','办假证','出售枪支','冰毒交易','辱骂老师'];
export function screenContent(text, custom=[]) {
 const s=text.normalize('NFKC').toLowerCase().replace(/[\s\u200b-\u200f\ufeff]/gu,'');
 const flags=[...new Set([...DEFAULT_TERMS,...custom].filter(t=>t&&s.includes(t.normalize('NFKC').toLowerCase().replace(/\s/gu,''))))];
 if(/https?:\/\/|www\.|(?:微信|加群|qq)[：:\s]*[a-z0-9]{5,}/iu.test(text))flags.push('链接或引流信息');
 return flags;
}
export function decideStatus(current,action){
 const allowed={approve:['pending','flagged'],reject:['pending','flagged'],hide:['approved']};
 if(!allowed[action]?.includes(current))throw new Error('状态已变化或不支持此操作，请刷新后重试。');
 return {approve:'approved',reject:'rejected',hide:'hidden'}[action];
}
export function publicMessage(row){return {id:row.id,classId:row.class_id,className:row.class_name,anonymousLabel:'匿名学生',content:row.content,createdAt:new Date(row.reviewed_at||row.created_at).toISOString(),expiresAt:new Date(row.display_until||row.created_at).toISOString()};}
