'use client';
import {forwardRef,useCallback,useEffect,useImperativeHandle,useRef,useState} from 'react';
import LiveAvatarStage,{type LiveAvatarStageHandle} from './liveavatar-stage';
import styles from './liveavatar-stage.module.css';
export type ClassroomAvatarHandle=LiveAvatarStageHandle&{scheduleText?:(text:string,signal:AbortSignal)=>Promise<{finished:Promise<void>}>};
type Props={active:boolean;panelOpen?:boolean;onReady:(ready:boolean)=>void;preferredProvider?:'lite'|'live'};
const LiteStage=forwardRef<ClassroomAvatarHandle,Props&{url:string}>(function LiteStage({active,panelOpen,onReady,url},ref){
 const frame=useRef<HTMLIFrameElement>(null),ready=useRef(false),loaded=useRef(false),connectSent=useRef(false),ticks=useRef(0);
 const pending=useRef(new Map<string,{resolve:()=>void;reject:(e:Error)=>void;cleanup:()=>void}>());
 const [error,setError]=useState('等待本机课堂服务启动…'),[revision,setRevision]=useState(0);
 const origin=new URL(url).origin,src=new URL('/ui/teacher217.html',url).href;
 const post=useCallback((type:string,extra:Record<string,unknown>={})=>frame.current?.contentWindow?.postMessage({protocol:'teacher213',type,...extra},origin),[origin]);
 const interrupt=useCallback(()=>{post('interrupt');for(const p of pending.current.values()){p.cleanup();p.reject(new DOMException('Aborted','AbortError'));}pending.current.clear();},[post]);
 const stop=useCallback(async()=>{interrupt();post('stop');ready.current=false;onReady(false);},[interrupt,post,onReady]);
 useEffect(()=>{
  function receive(e:MessageEvent){
   if(e.origin!==origin||e.source!==frame.current?.contentWindow||e.data?.protocol!=='teacher213')return;
   const m=e.data;
   if(m.type==='loaded'&&m.version===217){loaded.current=true;if(!ready.current)setError('服务已启动，正在连接课堂数字人…');if(!connectSent.current){connectSent.current=true;post('connect');}}
   else if(m.type==='ready'){ready.current=m.ready===true;onReady(ready.current);if(ready.current)setError('');}
   else if(m.type==='error')setError(String(m.error||'连接失败，请点击画面中的连接按钮重试'));
   else if(m.type==='finished'||m.type==='failed'){const p=pending.current.get(m.id);if(p){p.cleanup();pending.current.delete(m.id);if(m.type==='finished')p.resolve();else{const err=m.error==='Aborted'?new DOMException('Aborted','AbortError'):Error(String(m.error||'播放失败'));p.reject(err);setError(err.message);}}}
  }
  window.addEventListener('message',receive);
  const timer=window.setInterval(()=>{if(loaded.current||ticks.current>60)return;if(++ticks.current>60){setError('等待超时：请检查启动器、网关登录或本机日志，再重试连接。');return;}setRevision(n=>n+1);},5000);
  return()=>{clearInterval(timer);window.removeEventListener('message',receive);void stop();};
 },[origin,post,onReady,stop]);
 useImperativeHandle(ref,()=>({isReady:()=>ready.current,interrupt,stop,schedule:async()=>{throw Error('LiteAvatar使用文本驱动');},scheduleText:async(text,signal)=>{
  if(signal.aborted)throw new DOMException('Aborted','AbortError');if(!ready.current)throw Error('请先连接LiteAvatar课堂模式');if(text.length>3000)throw Error('单段讲解过长');
  const id=crypto.randomUUID();const finished=new Promise<void>((resolve,reject)=>{const abort=()=>interrupt();const timer=window.setTimeout(()=>{const p=pending.current.get(id);if(p){p.cleanup();pending.current.delete(id);reject(Error('LiteAvatar播放超时，请查看本机TTS日志'));}},100000);signal.addEventListener('abort',abort,{once:true});pending.current.set(id,{resolve,reject,cleanup:()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);}});});void finished.catch(()=>{});post('speak',{id,text});return{finished};
 }}),[interrupt,stop,post]);
 if(!active)return null;
 return <div className={styles.stage} data-panel-open={panelOpen}><iframe key={revision} ref={frame} src={src} title="LiteAvatar课堂数字人" allow="autoplay" style={{width:'100%',height:'100%',border:0}} onLoad={()=>post('hello')}/>{error&&<div className={styles.networkBadge}>{error} <a href={src} target="_blank" rel="noopener noreferrer" style={{color:'#8ceaf1'}}>登录网关</a> <button type="button" onClick={()=>{void stop();loaded.current=false;connectSent.current=false;ticks.current=0;setRevision(n=>n+1);setError('正在重试连接…');}}>重试连接</button><span> 若浏览器阻止声音，请点击画面中的“连接课堂数字人”。</span></div>}</div>;
});
export default forwardRef<ClassroomAvatarHandle,Props>(function ClassroomAvatarStage(props,ref){
 const child=useRef<ClassroomAvatarHandle|null>(null);
 const [provider,setProvider]=useState<'live'|'lite'|''>(''),[url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let mounted=true;fetch('/api/avatar/classroom-config',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('读取课堂配置失败，请重新登录教师端');return r.json();}).then(c=>{
  if(!mounted)return;const u=c.liteavatar||'';setUrl(u);let choice='';try{choice=localStorage.getItem('teacher213.provider')||'';}catch{}
  if(props.preferredProvider==='lite'&&!u){setError('请先在教师端LiteAvatar设置中配置服务地址');return;}
  setProvider(props.preferredProvider||(choice==='lite'&&u?'lite':choice==='live'?'live':u?'lite':'live'));
 }).catch(e=>{if(mounted)setError(String(e));});return()=>{mounted=false;};},[props.preferredProvider]);
 useImperativeHandle(ref,()=>({isReady:()=>child.current?.isReady()||false,schedule:(blob,signal)=>{if(!child.current)throw Error('数字人尚未连接');return child.current.schedule(blob,signal);},scheduleText:provider==='lite'?async(text,signal)=>{if(!child.current?.scheduleText)throw Error('LiteAvatar尚未连接');return child.current.scheduleText(text,signal);}:undefined,interrupt:()=>child.current?.interrupt(),stop:async()=>{await child.current?.stop();}}),[provider]);
 async function choose(v:'lite'|'live'){await child.current?.stop();props.onReady(false);setProvider(v);try{localStorage.setItem('teacher213.provider',v);}catch{}}
 return <>{provider==='lite'&&url?<LiteStage key="lite" {...props} url={url} ref={child}/>:provider==='live'?<LiveAvatarStage key="live" {...props} ref={child}/>:null}{error&&<p role="alert">{error}</p>}<label style={{position:'absolute',zIndex:12,top:78,right:20,color:'white',background:'#10273e',padding:10,borderRadius:8}}>数字人 <select aria-label="选择课堂数字人" disabled={!!props.preferredProvider} value={provider} onChange={e=>void choose(e.target.value as 'lite'|'live')} style={{color:'#10273e',padding:6}}><option value="" disabled>正在读取配置</option><option value="live">LiveAvatar</option><option value="lite" disabled={!url}>LiteAvatar · 本机服务</option></select></label></>;
});
