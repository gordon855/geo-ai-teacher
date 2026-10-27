import {createHmac,timingSafeEqual} from 'node:crypto';
export function codeFor(secret,id,now=Date.now()){return String(parseInt(createHmac('sha256',secret).update(id+':'+Math.floor(now/30000)).digest('hex').slice(0,12),16)%1000000).padStart(6,'0');}
export function acceptsCode(secret,id,code,now=Date.now()){if(!/^\d{6}$/.test(code))return false;const same=t=>timingSafeEqual(Buffer.from(t),Buffer.from(code));return same(codeFor(secret,id,now))||(now%30000<5000&&same(codeFor(secret,id,now-30000)));}
export const isOpen=(s,now=Date.now())=>!!s&&!s.closed_at&&new Date(s.ends_at).getTime()>now;
