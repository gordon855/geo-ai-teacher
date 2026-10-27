export async function readChatStream(response: Response, onText: (text: string) => void): Promise<unknown> {
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) return response.json();
  const reader=response.body?.getReader();if(!reader)throw new Error('回答流不存在');
  const decoder=new TextDecoder();let buffer='',text='';let payload:unknown;
  const consume=(line:string)=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='delta'){text+=event.text;onText(text);}if(event.type==='result')payload=event.payload;if(event.type==='error')throw new Error(event.message);};
  try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,index));buffer=buffer.slice(index+1);}}buffer+=decoder.decode();if(buffer.trim())consume(buffer);if(!payload)throw new Error('回答未完整返回');return payload;}
  finally{reader.releaseLock();}
}
