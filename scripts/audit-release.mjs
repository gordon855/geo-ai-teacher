import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),excluded=new Set(['.git','.audit','.private-originals','.playwright-cli','output','node_modules','.next','.npm-cache','.data','backups','dist','coverage','next-env.d.ts','outputs','work','.wrangler','.sites-runtime','.vercel']);
const files=[],findings=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(excluded.has(entry.name)||entry.name.endsWith('.tsbuildinfo')||entry.name.endsWith('.log')||entry.name.startsWith('.env')&&entry.name!=='.env.example')continue;const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else if(entry.isFile())files.push(p);}}
await walk(root);
const manifest=[];
for(const p of files){const rel=path.relative(root,p).replaceAll('\\','/');if(rel==='docs/RELEASE-FILES.json'||rel==='docs/SECURITY-SCAN.json')continue;const bytes=await readFile(p);manifest.push({path:rel,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});if(bytes.includes(0))continue;const lines=bytes.toString('utf8').split(/\r?\n/);
 for(const [i,line]of lines.entries())for(const [rule,pattern]of [['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['cloud-key',/\bLTAI[A-Za-z0-9]{12,}/],['github-token',/\bgh[pousr]_[A-Za-z0-9]{25,}/],['api-token',/\bsk-[A-Za-z0-9_-]{24,}/],['production-domain',/sxiechzywy[.]com/i]])if(pattern.test(line))findings.push({path:rel,line:i+1,rule});
}
await mkdir('docs',{recursive:true});
const scan=JSON.stringify({scope:'Release candidate files only; values never printed. Pattern scanning cannot prove absence of personal data or rights issues.',findings},null,2)+'\n';
await writeFile('docs/SECURITY-SCAN.json',scan);
manifest.push({path:'docs/SECURITY-SCAN.json',bytes:Buffer.byteLength(scan),sha256:createHash('sha256').update(scan).digest('hex')});
manifest.push({path:'docs/RELEASE-FILES.json',bytes:null,sha256:null,note:'Self-entry; hash omitted to avoid recursive hashing.'});
manifest.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile('docs/RELEASE-FILES.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`${manifest.length} release candidate files; ${findings.length} pattern findings. See docs/SECURITY-SCAN.json.`);
if(findings.length)process.exitCode=1;
