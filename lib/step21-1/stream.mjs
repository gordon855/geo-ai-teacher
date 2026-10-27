// OpenAI-compatible SSE; generator supplied by the course service, never arbitrary URLs.
/** @param {Function} generate @param {{signal?: AbortSignal, model?: string, timeoutMs?: number, heartbeatMs?: number}} options */
export function answerStream(generate,{signal,model='surveying-course',timeoutMs=55000,heartbeatMs=2000}={}){
 const abort=new AbortController(),enc=new TextEncoder(),id='chatcmpl-'+crypto.randomUUID(),created=Math.floor(Date.now()/1000);let finish=()=>{};
 const onAbort=()=>abort.abort();signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)abort.abort();
 return new ReadableStream({start(out){let ended=false;const send=v=>{if(!ended)out.enqueue(enc.encode('data: '+JSON.stringify(v)+'\n\n'));};const chunk=(delta,reason=null)=>({id,object:'chat.completion.chunk',created,model,choices:[{index:0,delta,finish_reason:reason}]});
 const heart=setInterval(()=>{if(!ended)out.enqueue(enc.encode(': keepalive\n\n'));},heartbeatMs);const timer=setTimeout(()=>abort.abort(),timeoutMs);
 finish=()=>{ended=true;clearInterval(heart);clearTimeout(timer);signal?.removeEventListener('abort',onAbort);};send(chunk({role:'assistant'}));
 void(async()=>{try{for await(const text of generate(abort.signal)){if(abort.signal.aborted)break;send(chunk({content:text}));}if(abort.signal.aborted&&!ended)send(chunk({content:'\n本次回答已中断或超时，请重试。'}));}catch{if(!ended)send(chunk({content:'\n课程服务暂不可用，请重试。'}));}finally{if(!ended){send(chunk({},'stop'));out.enqueue(enc.encode('data: [DONE]\n\n'));}finish();try{out.close();}catch{}}})();},cancel(){finish();abort.abort();}});
}
