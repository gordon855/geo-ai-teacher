export const SCENE_KEYS = ['taihang','wutai','huashan','guilin','shanghai','chongqing','shenzhen','taiyuan','grand_canyon','mount_st_helens'] as const;
export type LocationKey = typeof SCENE_KEYS[number];
export type TerrainPoint = [number, number];
type Scene = { name: string; english: string; note: string; center: TerrainPoint; zoom: number; bearing: number; exaggeration: number; city: boolean };
export const SCENES: Record<LocationKey, Scene> = {
 taihang:{name:'太行山 · 王莽岭',english:'TAIHANG MOUNTAINS',note:'山西 · 山脊、陡崖与河谷',center:[113.60,35.681],zoom:12.2,bearing:-32,exaggeration:1.8,city:false},
 wutai:{name:'五台山',english:'MOUNT WUTAI',note:'山西 · 高山地形与测线规划',center:[113.566,39.029],zoom:12,bearing:24,exaggeration:1.6,city:false},
 huashan:{name:'华山',english:'MOUNT HUA',note:'陕西 · 陡坡与山体判读',center:[110.088,34.485],zoom:12.4,bearing:-20,exaggeration:1.7,city:false},
 guilin:{name:'桂林 · 漓江山地',english:'GUILIN KARST',note:'广西 · 峰林与河谷地貌',center:[110.443,25.075],zoom:12.4,bearing:20,exaggeration:2.5,city:false},
 shanghai:{name:'上海 · 陆家嘴',english:'SHANGHAI / LUJIAZUI',note:'建筑轮廓与高度数据可视化',center:[121.503,31.238],zoom:15.8,bearing:-32,exaggeration:1,city:true},
 chongqing:{name:'重庆 · 解放碑',english:'CHONGQING',note:'山地城市与建筑空间关系',center:[106.579,29.559],zoom:15.6,bearing:30,exaggeration:1,city:true},
 shenzhen:{name:'深圳 · 福田',english:'SHENZHEN / FUTIAN',note:'城市建筑高度与空间判读',center:[114.054,22.539],zoom:15.6,bearing:-24,exaggeration:1,city:true},
 taiyuan:{name:'太原 · 城市中心',english:'TAIYUAN',note:'开放建筑覆盖较稀疏，可放大查看',center:[112.563,37.87],zoom:15.6,bearing:25,exaggeration:1,city:true},
 grand_canyon:{name:'美国 · 大峡谷',english:'GRAND CANYON',note:'峡谷横断面与地形对照',center:[-112.13,36.105],zoom:12,bearing:-18,exaggeration:1.8,city:false},
 mount_st_helens:{name:'美国 · 圣海伦火山',english:'MOUNT ST. HELENS',note:'火山地貌与山体对照',center:[-122.19,46.20],zoom:12.3,bearing:22,exaggeration:1.6,city:false}
};
export function safeLocation(value?: string): LocationKey { return SCENE_KEYS.includes(value as LocationKey) ? value as LocationKey : 'taihang'; }
export function distanceKm(points: TerrainPoint[]) { let d=0; const r=Math.PI/180; for(let i=1;i<points.length;i++){ const a=points[i-1],b=points[i]; const h=Math.sin((b[1]-a[1])*r/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin((b[0]-a[0])*r/2)**2; d+=12742*Math.asin(Math.sqrt(Math.min(1,h))); } return d; }
