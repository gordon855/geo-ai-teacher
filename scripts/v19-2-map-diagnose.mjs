// Run inside the actual app container. Does not print cookies or credentials.
import {Agent,ProxyAgent,request} from 'undici';
const proxy=process.env.MAP_OUTBOUND_PROXY||process.env.HTTPS_PROXY||process.env.https_proxy;
const dispatcher=proxy?new ProxyAgent(proxy):new Agent({connect:{timeout:8000,autoSelectFamily:true},connections:2});
const sources={dem:process.env.MAP_DEM_TILEJSON_URL||'https://tiles.mapterhorn.com/tilejson.json',vector:process.env.MAP_VECTOR_TILEJSON_URL||'https://tiles.openfreemap.org/planet/latest'};
async function get(url,redirects=0){
 const response=await request(url,{dispatcher,signal:AbortSignal.timeout(15000),headers:{'accept-encoding':'identity'}});
 if(response.statusCode>=300&&response.statusCode<400&&response.headers.location){
  await response.body.dump();if(redirects>=3)throw new Error('HTTP excessive redirects');
  const next=new URL(String(response.headers.location),url);if(next.protocol!=='https:')throw new Error('HTTP insecure redirect');
  return get(next,redirects+1);
 }return response;
}
console.log(JSON.stringify({version:'19.2',time:new Date().toISOString(),proxyConfigured:Boolean(proxy)}));
let failed=false;
for(const [kind,source]of Object.entries(sources)){
 let stage='metadata';const start=Date.now();
 try{
  if(source.startsWith('/')){console.log(JSON.stringify({kind,status:'local-source-requires-browser-test'}));continue;}
  const response=await get(source);
  if(response.statusCode!==200){await response.body.dump();throw new Error('HTTP '+response.statusCode);}
  const metadata=await response.body.json();stage='tile';
  const url=new URL(metadata.tiles[0],source).href.replace(/%7B/gi,'{').replace(/%7D/gi,'}').replace('{z}','8').replace('{x}','208').replace('{y}','98');
  const tile=await get(url);const bytes=(await tile.body.arrayBuffer()).byteLength;
  if(tile.statusCode!==200||!bytes)throw new Error('HTTP '+tile.statusCode+' / bytes='+bytes);
  console.log(JSON.stringify({kind,status:'PASS',bytes,elapsedMs:Date.now()-start}));
 }catch(error){failed=true;console.log(JSON.stringify({kind,stage,status:'FAIL',code:error.code||error.cause?.code||error.name,detail:/^HTTP /.test(error.message)?error.message:'请求失败，请检查容器DNS、出站HTTPS或上游可达性',elapsedMs:Date.now()-start}));}
}
await dispatcher.close();process.exitCode=failed?1:0;
