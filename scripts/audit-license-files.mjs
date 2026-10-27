// Inventory local license evidence; this does not grant rights or approve release.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const root=process.cwd();
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const project=JSON.parse(await readFile('package.json','utf8'));
const direct=new Set(Object.keys(project.dependencies||{}));
const directDev=new Set(Object.keys(project.devDependencies||{}));
const rows=[];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [directory,entry] of Object.entries(lock.packages)){
  if(!directory)continue;
  const record={path:directory,version:entry.version,declaredLicense:entry.license??null,
    development:!!entry.dev,optional:!!entry.optional,installed:false,licenseFiles:[]};
  try{
    const metadata=await readFile(path.join(root,directory,'package.json'));
    const pkg=JSON.parse(metadata.toString('utf8'));
    record.installed=true;
    record.name=pkg.name;
    record.installedVersion=pkg.version;
    record.direct=directory===`node_modules/${pkg.name}`&&(direct.has(pkg.name)||directDev.has(pkg.name));
    record.directRuntime=record.direct&&direct.has(pkg.name);
    record.packageJsonSha256=digest(metadata);
    record.packageLicense=pkg.license??pkg.licenses??null;
    for(const item of await readdir(path.join(root,directory),{withFileTypes:true})){
      if(!item.isFile()||!/^(licen[sc]e|copying|notice|copyright)(\b|[._-])/i.test(item.name))continue;
      const bytes=await readFile(path.join(root,directory,item.name));
      record.licenseFiles.push({path:`${directory}/${item.name}`,bytes:bytes.length,sha256:digest(bytes)});
    }
  }catch(error){
    if(error.code!=='ENOENT')throw error;
    record.unavailableReason='Package not installed for this host or package.json absent; do not infer absence of upstream license.';
  }
  rows.push(record);
}
const installed=rows.filter(row=>row.installed);
const report={checkedAt:new Date().toISOString(),applicationVersion:project.version,
  lockfileSha256:digest(await readFile('package-lock.json')),
  scope:'Local lockfile and package-root LICENSE/LICENCE/COPYING/NOTICE/COPYRIGHT files only. Nested/bundled component coverage and legal compatibility require separate review. Missing file is not proof of no license. No package or license grant is modified.',
  counts:{lockedPackageEntries:rows.length,installed:installed.length,
    directRuntime:installed.filter(row=>row.directRuntime).length,
    withoutTopLevelLicenseFile:installed.filter(row=>!row.licenseFiles.length).length},
  packages:rows};
await writeFile('docs/THIRD-PARTY-LICENSE-EVIDENCE.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.counts));
console.log('Direct runtime packages without a top-level license file: '+installed.filter(row=>row.directRuntime&&!row.licenseFiles.length).map(row=>row.name).join(', '));
