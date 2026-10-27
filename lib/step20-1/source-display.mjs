export function sourceLocation(source) {
  if (!source) return '来源页码未标注';
  const citation=String(source.citation||'');
  const slide=citation.match(/第\s*(\d+(?:[—–-]\d+)?)\s*张幻灯片/u);
  if(slide)return `课件第${slide[1]}页`;
  const system=citation.match(/系统页\s*(\d+(?:[—–-]\d+)?)/u);
  // Legacy system pagination is not proven to equal printed book pagination.
  if(system)return `资料第${system[1]}页`;
  const page=citation.match(/第\s*(\d+(?:[—–-]\d+)?)\s*页/u);
  if(page)return `第${page[1]}页`;
  if(Number.isInteger(source.page)&&source.page>0)return `资料第${source.page}页`;
  return '来源页码未标注';
}
export function sourceTitle(source) {
 return String(source?.citation||'课程资料').replace(/系统页\s*(\d+(?:[—–-]\d+)?)/gu,'资料第$1页').replace(/第\s*(\d+)\s*张幻灯片/gu,'课件第$1页');
}
export function displayCitations(text,sources=[]) {
 return String(text||'').replace(/\[S\d+\]/gu,marker=>{
  const s=sources.find(s=>s.id===marker.slice(1,-1));
  return s?`（${sourceLocation(s)}）`:'';
 });
}
// Citation markers can arrive split across token chunks; never speak partial IDs.
export async function* displayCitationStream(chunks,sources) {
 let pending='';
 for await(const chunk of chunks){
  pending+=chunk;
  const open=pending.lastIndexOf('[');
  if(open>=0 && /^\[S?\d*$/u.test(pending.slice(open))){
   const ready=pending.slice(0,open);pending=pending.slice(open);if(ready)yield displayCitations(ready,sources);
  }else{yield displayCitations(pending,sources);pending='';}
 }
 if(pending&&!/^\[S?\d*$/u.test(pending))yield displayCitations(pending,sources);
}
