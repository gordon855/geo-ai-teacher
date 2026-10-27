import {mkdir,copyFile,readFile} from 'node:fs/promises';
const dest=new URL('../public/vendor/maplibre/6.7.0/',import.meta.url);await mkdir(dest,{recursive:true});
for(const name of ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs'])await copyFile(new URL('../node_modules/maplibre-gl/dist/'+name,import.meta.url),new URL(name,dest));
await copyFile(new URL('../node_modules/maplibre-gl/LICENSE.txt',import.meta.url),new URL('LICENSE.txt',dest));
if(!(await readFile(new URL('maplibre-gl-worker.mjs',dest),'utf8')).includes('./maplibre-gl-shared.mjs'))throw Error('MapLibre worker dependency changed');
