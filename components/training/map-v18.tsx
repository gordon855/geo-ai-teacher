"use client";
import { useEffect, useRef, useState } from 'react';
import type { Map as MapInstance, GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import { SCENES, distanceKm, type LocationKey, type TerrainPoint } from '@/lib/step18/scenes';
import styles from './map-v18.module.css';
import { MAP_WORKER, checkMapWorker } from '@/lib/step20/map-worker';
import { resolveMapSources } from '@/lib/step19/map-browser';
export type { TerrainPoint } from '@/lib/step18/scenes';
type Config={version:string;delivery:'same-origin-proxy'|'direct';dem:string;encoding:'terrarium'|'mapbox';vector:string;imagery:string;attribution:string};
const EMPTY: TerrainPoint[][]=[];
export function terrainStyle(c:Config,city:boolean,exaggeration:number):StyleSpecification {
 return {version:8,sources:{
  dem:{type:'raster-dem',url:c.dem,encoding:c.encoding,tileSize:512,maxzoom:12,attribution:'<a href="https://mapterhorn.com/attribution/" target="_blank">© Mapterhorn</a>'},
  world:{type:'vector',url:c.vector,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> · <a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a>'},
  ...(c.imagery?{imagery:{type:'raster' as const,tiles:[c.imagery],tileSize:256,attribution:c.attribution}}:{}),
  routes:{type:'geojson',data:{type:'FeatureCollection',features:[]}},nodes:{type:'geojson',data:{type:'FeatureCollection',features:[]}}
 },layers:[
  {id:'ground',type:'background',paint:{'background-color':'#d4dfd7'}},
  ...(c.imagery?[{id:'imagery',type:'raster' as const,source:'imagery',layout:{visibility:'none' as const}}]:[]),
  {id:'relief',type:'color-relief',source:'dem',layout:{visibility:city?'none':'visible'},paint:{'color-relief-color':['interpolate',['linear'],['elevation'],-50,'#a8cbbb',0,'#b6ccad',400,'#9bb891',900,'#b8be92',1500,'#c2b59b',2300,'#b4a291',3500,'#d4cec0',5000,'#f6f7f3']}},
  {id:'shade',type:'hillshade',source:'dem',paint:{'hillshade-method':'multidirectional','hillshade-exaggeration':0.65,'hillshade-shadow-color':'#314c58','hillshade-highlight-color':'#fff0ca'}},
  {id:'water',type:'fill',source:'world','source-layer':'water',paint:{'fill-color':'#78b3c4'}},
  {id:'rivers',type:'line',source:'world','source-layer':'waterway',paint:{'line-color':'#78b3c4','line-width':['interpolate',['linear'],['zoom'],8,0.5,16,4]}},
  {id:'road-case',type:'line',source:'world','source-layer':'transportation',minzoom:10,paint:{'line-color':'#a5b5b5','line-width':['interpolate',['linear'],['zoom'],10,1,16,7,19,20]}},
  {id:'roads',type:'line',source:'world','source-layer':'transportation',minzoom:10,paint:{'line-color':'#fff1d7','line-width':['interpolate',['linear'],['zoom'],10,0.3,16,4,19,16]}},
  {id:'footprints',type:'fill',source:'world','source-layer':'building',minzoom:13,paint:{'fill-color':'#aec4c8'}},
  {id:'buildings',type:'fill-extrusion',source:'world','source-layer':'building',minzoom:13,filter:['!=',['get','hide_3d'],true],layout:{visibility:city?'visible':'none'},paint:{'fill-extrusion-height':['coalesce',['to-number',['get','render_height']],12],'fill-extrusion-base':['coalesce',['to-number',['get','render_min_height']],0],'fill-extrusion-color':['interpolate',['linear'],['coalesce',['to-number',['get','render_height']],12],0,'#bfd0d3',30,'#80a6b5',120,'#367c92',300,'#195c77'],'fill-extrusion-opacity':0.97,'fill-extrusion-vertical-gradient':true}},
  {id:'route-case',type:'line',source:'routes',paint:{'line-color':'#12303d','line-width':8}},
  {id:'route-lines',type:'line',source:'routes',paint:{'line-color':['match',['%', ['get','index'],5],0,'#10e6dc',1,'#ffce72',2,'#ff8fbe',3,'#a9a1fa','#9bdf75'],'line-width':4}},
  {id:'nodes',type:'circle',source:'nodes',paint:{'circle-radius':9,'circle-color':'#0b384e','circle-stroke-color':'#48f1e6','circle-stroke-width':2}},
  {id:'places',type:'symbol',source:'world','source-layer':'place',minzoom:9,filter:['in',['get','class'],['literal',['city','town','village','suburb']]],layout:{'text-field':['coalesce',['get','name:zh'],['get','name']],'text-font':['Microsoft YaHei','Arial'],'text-size':12},paint:{'text-color':'#153f4e','text-halo-color':'#ffffff','text-halo-width':1.5}},
  {id:'node-labels',type:'symbol',source:'nodes',layout:{'text-field':['get','label'],'text-font':['Arial'],'text-size':10,'text-allow-overlap':true},paint:{'text-color':'#ffffff'}}
 ],terrain:{source:'dem',exaggeration},sky:{'sky-color':'#94bcd1','horizon-color':'#d9e6e5','fog-color':'#d9e6e5','sky-horizon-blend':0.7,'horizon-fog-blend':0.5},light:{anchor:'viewport',color:'#ffffff',intensity:0.55,position:[1.15,210,40]}};
}
export default function TerrainMap({locationKey,editable,route,comparisonRoutes=EMPTY,onRouteChange}:{locationKey:LocationKey;editable:boolean;route:TerrainPoint[];comparisonRoutes?:TerrainPoint[][];onRouteChange?:(p:TerrainPoint[])=>void}) {
 const scene=SCENES[locationKey]; const host=useRef<HTMLDivElement>(null); const map=useRef<MapInstance|null>(null);
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[fatal,setFatal]=useState(false),[retry,setRetry]=useState(0),[factor,setFactor]=useState(scene.exaggeration),[pitch,setPitch]=useState(65),[terrain,setTerrain]=useState(true),[buildings,setBuildings]=useState(scene.city),[draw,setDraw]=useState(false),[expanded,setExpanded]=useState(false),[orbit,setOrbit]=useState(false),[info,setInfo]=useState(''),[demReady,setDemReady]=useState(false),[vectorReady,setVectorReady]=useState(false),[delivery,setDelivery]=useState(''),[imagery,setImagery]=useState(false),[hasImagery,setHasImagery]=useState(false);
 const live=useRef({editable,route,onRouteChange,draw}); useEffect(()=>{live.current={editable,route,onRouteChange,draw};},[editable,route,onRouteChange,draw]);
 useEffect(()=>{if(!host.current)return;let disposed=false;let instance:MapInstance|undefined;let resize:ResizeObserver|undefined;let dataTimer:ReturnType<typeof setTimeout>|undefined;const abort=new AbortController();const sourceHealth={dem:false,vector:false,failures:new Set<string>()};setReady(false);setError('');setFatal(false);setDemReady(false);setVectorReady(false);setDelivery('');setFactor(scene.exaggeration);setPitch(65);setTerrain(true);setBuildings(scene.city);setDraw(false);setOrbit(false);setImagery(false);setInfo('');
  Promise.all([import('maplibre-gl'),fetch('/api/training/map-config',{cache:'no-store',signal:abort.signal}).then(async r=>{const p=await r.json();if(!r.ok)throw new Error(p.error||'地图配置读取失败');return p as Config;})]).then(async ([gl,c])=>{
   if(disposed||!host.current)return;setHasImagery(Boolean(c.imagery));setDelivery(c.delivery==='same-origin-proxy'?'服务器同源代理':'直接数据源');
   const resolvedStyle=await resolveMapSources(terrainStyle(c,scene.city,scene.exaggeration),abort.signal);if(disposed||!host.current)return;
   await checkMapWorker(abort.signal);if(disposed||!host.current)return;gl.setWorkerUrl(new URL(MAP_WORKER,window.location.origin).href);
   instance=new gl.Map({container:host.current,style:resolvedStyle,center:scene.center,zoom:scene.zoom,bearing:scene.bearing,pitch:65,maxPitch:78,minZoom:5,maxZoom:19,localIdeographFontFamily:'Microsoft YaHei, PingFang SC, sans-serif'});map.current=instance;
   instance.addControl(new gl.NavigationControl({visualizePitch:true}),'bottom-right');instance.addControl(new gl.ScaleControl({unit:'metric'}),'bottom-left');
   instance.on('style.load',()=>{setReady(true);dataTimer=setTimeout(()=>{if(disposed||(sourceHealth.dem&&sourceHealth.vector))return;const missing=[!sourceHealth.vector?'矢量底图':'',!sourceHealth.dem?'DEM高程':''].filter(Boolean).join('和');const detail=sourceHealth.failures.size?'数据请求已返回错误':'数据请求尚未完成';setError(`${missing}在18秒内没有载入（${detail}）。当前使用服务器同源代理；请先点击重试，若仍失败请检查服务器能否访问外部地图数据源。`);},18_000);});instance.on('pitchend',()=>{if(instance)setPitch(Math.round(instance.getPitch()));});
   const updateSource=(sourceId:string)=>{if(!instance||!instance.getSource(sourceId)||!instance.isSourceLoaded(sourceId))return;if(sourceId==='dem'){sourceHealth.dem=true;setDemReady(true);}if(sourceId==='world'){sourceHealth.vector=true;setVectorReady(true);}if(sourceHealth.dem&&sourceHealth.vector){if(dataTimer)clearTimeout(dataTimer);setError('');}};
   instance.on('sourcedata',event=>{const sourceId=(event as {sourceId?:string}).sourceId;if(sourceId==='dem'||sourceId==='world')updateSource(sourceId);});
   instance.on('idle',()=>{updateSource('dem');updateSource('world');});
   instance.on('error',event=>{const sourceId=(event as {sourceId?:string}).sourceId;if(sourceId==='dem'||sourceId==='world')sourceHealth.failures.add(sourceId);const status=(event.error as Error & {status?:number})?.status;setError('地图瓦片请求或解码失败'+(status?'（HTTP '+status+'）':'')+'。元数据已解析，故障位于瓦片传输或渲染环节，请检查地图代理日志。');});
   instance.on('click',event=>{const l=live.current;if(l.editable&&l.draw){if(l.route.length>=100){setInfo('最多100个节点，请先撤销或清空。');return;}l.onRouteChange?.([...l.route,[event.lngLat.lng,event.lngLat.lat]]);return;}
    const h=instance?.queryTerrainElevation(event.lngLat);const ex=instance?.getTerrain()?.exaggeration||1;const b=instance?.getLayer('buildings')?instance.queryRenderedFeatures(event.point,{layers:['buildings']})[0]:null;
    setInfo(`${event.lngLat.lng.toFixed(5)}° / ${event.lngLat.lat.toFixed(5)}° · ${h!==null&&h!==undefined?`DEM参考高程 ${(h/ex).toFixed(0)} m`:'高程数据未就绪'}${b?` · 建筑数据高度 ${b.properties?.render_height??12} m（非实测）`:''}`);
   });resize=new ResizeObserver(()=>instance?.resize());resize.observe(host.current);
  }).catch(e=>{if(!disposed&&e.name!=='AbortError'){setError('三维地图未能启动：需要支持WebGL2的浏览器及可访问的地图数据。'+e.message);setFatal(true);}});
  return()=>{disposed=true;abort.abort();if(dataTimer)clearTimeout(dataTimer);resize?.disconnect();instance?.remove();map.current=null;};
 },[scene,retry]);
 useEffect(()=>{const m=map.current;if(!m||!ready)return;const lines=[...comparisonRoutes,...(route.length>1?[route]:[])];(m.getSource('routes') as GeoJSONSource)?.setData({type:'FeatureCollection',features:lines.map((p,i)=>({type:'Feature',properties:{index:i},geometry:{type:'LineString',coordinates:p}}))});(m.getSource('nodes') as GeoJSONSource)?.setData({type:'FeatureCollection',features:route.map((p,i)=>({type:'Feature',properties:{label:String(i+1)},geometry:{type:'Point',coordinates:p}}))});},[ready,route,comparisonRoutes]);
 useEffect(()=>{const m=map.current;if(!m||!ready)return;m.setTerrain(terrain?{source:'dem',exaggeration:factor}:null);m.setLayoutProperty('buildings','visibility',buildings?'visible':'none');m.setLayoutProperty('relief','visibility',imagery||scene.city?'none':'visible');if(m.getLayer('imagery'))m.setLayoutProperty('imagery','visibility',imagery?'visible':'none');},[ready,terrain,factor,buildings,imagery,scene.city]);
 useEffect(()=>{if(!orbit)return;let frame=0,last=0;const spin=(t:number)=>{if(last&&map.current)map.current.setBearing(map.current.getBearing()+Math.min(t-last,100)*0.005);last=t;frame=requestAnimationFrame(spin);};frame=requestAnimationFrame(spin);return()=>cancelAnimationFrame(frame);},[orbit]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 return <div className={`${styles.map} ${expanded?styles.expanded:''} v18-terrain-map`}><div ref={host} className={styles.canvas}/><div className={styles.title}><small>GEOSPATIAL EXPLORER / 21</small><h2>{scene.name}</h2><p>{scene.english} · {scene.note}</p></div>
 <div className={styles.tools}><div className={styles.row}><button disabled={!ready} aria-pressed={terrain} onClick={()=>{setTerrain(!terrain);map.current?.easeTo({pitch:terrain?0:65,duration:650});}}>{terrain?'3D 地形':'二维对照'}</button><button disabled={!ready} onClick={()=>{setOrbit(false);setTerrain(true);setFactor(scene.exaggeration);map.current?.flyTo({center:scene.center,zoom:scene.zoom,bearing:scene.bearing,pitch:65});}}>重置视角</button><button disabled={!ready} aria-pressed={orbit} onClick={()=>setOrbit(!orbit)}>{orbit?'停止环绕':'环绕观察'}</button><button aria-pressed={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'退出全屏':'展开地图'}</button></div>
 <label>地形夸张 <b>{factor.toFixed(1)}×</b><input aria-label="地形夸张" type="range" min="1" max="3.5" step="0.1" disabled={!ready||!terrain} value={factor} onChange={e=>setFactor(Number(e.target.value))}/></label>
 <label>俯仰角 <b>{pitch}°</b><input aria-label="俯仰角" type="range" min="0" max="75" value={pitch} disabled={!ready} onChange={e=>{setPitch(Number(e.target.value));map.current?.setPitch(Number(e.target.value));}}/></label>
 <div className={styles.row}><button disabled={!ready} aria-pressed={buildings} onClick={()=>setBuildings(!buildings)}>{buildings?'建筑立体已开启':'显示三维建筑'}</button>{hasImagery?<button disabled={!ready} aria-pressed={imagery} onClick={()=>setImagery(!imagery)}>{imagery?'高程配色':'影像底图'}</button>:null}</div>
 {buildings?<p>开放轮廓按高度拉伸，非实景模型；缺失高度按12m示意。缩放至街区查看，覆盖随地区变化。</p>:<p>拖动平移 · 右键拖动旋转 / 俯仰 · 滚轮缩放<br/>夸张仅改变显示，高程读数为DEM参考值。</p>}</div>
 {editable?<div className={styles.draw}><button disabled={!ready} aria-pressed={draw} onClick={()=>setDraw(!draw)}>{draw?'结束绘制':'绘制路线'}</button><button disabled={!route.length} onClick={()=>onRouteChange?.(route.slice(0,-1))}>撤销</button><button disabled={!route.length} onClick={()=>{if(window.confirm('清空当前未提交的路线？'))onRouteChange?.([]);}}>清空</button><span>{route.length} 节点 · 约 {distanceKm(route).toFixed(2)} km</span></div>:null}
 <div className={styles.status} aria-live="polite">{fatal?'地图启动失败':!ready?'正在初始化三维场景…':demReady&&vectorReady?`矢量底图与DEM已载入 · ${delivery}`:vectorReady?'矢量底图已载入 · 正在等待DEM高程':demReady?'DEM高程已载入 · 正在等待矢量底图':`正在载入矢量底图与DEM · ${delivery||'准备数据通道'}`}</div>
 {error?<div className={styles.error} role="alert">{error}<button onClick={()=>setRetry(x=>x+1)}>重试</button></div>:null}{info?<button className={styles.info} onClick={()=>setInfo('')}>{info}　×</button>:null}</div>;
}
