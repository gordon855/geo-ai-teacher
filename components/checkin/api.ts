export async function req(url:string,body?:unknown){const r=await fetch(url,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok)throw Error(typeof p.error==='string'?p.error:'操作失败');return p;}
export const send=(body:unknown)=>req('/api/checkin',body);
