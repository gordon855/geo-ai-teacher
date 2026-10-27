import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('setup creates fresh credentials and refuses to overwrite them',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'geoai-setup-'));
 try{
  await mkdir(path.join(dir,'scripts'));
  await copyFile(new URL('../scripts/demo-setup.mjs',import.meta.url),path.join(dir,'scripts/demo-setup.mjs'));
  await copyFile(new URL('../.env.example',import.meta.url),path.join(dir,'.env.example'));
  const run=()=>spawnSync(process.execPath,['scripts/demo-setup.mjs'],{cwd:dir,encoding:'utf8'});
  assert.equal(run().status,0);
  const content=await readFile(path.join(dir,'.env'),'utf8');
  assert.match(content,/COMPOSE_PROJECT_NAME=geoai_demo_[a-f0-9]{12}/);
  assert.doesNotMatch(content,/GENERATE_/);
  assert.notEqual(run().status,0);
  assert.equal(await readFile(path.join(dir,'.env'),'utf8'),content);
 }finally{await rm(dir,{recursive:true,force:true});}
});
