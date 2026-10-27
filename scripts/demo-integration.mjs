// Real HTTP integration checks. Run only against an isolated, disposable demo.
// Seeds fictional practice/PPT data; never deletes volumes or existing accounts.
import assert from 'node:assert/strict';
import {access,readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';

assert.equal(process.env.GEOAI_INTEGRATION_TEST,'1','Set GEOAI_INTEGRATION_TEST=1 to authorize synthetic writes in your isolated demo.');
assert.match(process.env.COMPOSE_PROJECT_NAME||'',/^geoai_demo_[a-f0-9]+$/);
const origin=process.env.CLASSROOM_PUBLIC_ORIGIN||'http://localhost:3000';
assert.ok(['http://localhost:3000','http://127.0.0.1:3000'].includes(origin));
const phase=process.argv[2]||'seed';assert.ok(['seed','exercise','verify'].includes(phase));
const statePath=new URL('../.audit/integration-state.json',import.meta.url);
if(phase==='seed'){
 try{
  await access(statePath);
  throw new Error('Integration state already exists. Use verify; seed must not replace existing test or user courseware.');
 }catch(error){if(error.code!=='ENOENT')throw error;}
}
const results=[];
const passed=name=>{results.push(name);console.log(`PASS ${name}`);};
async function request(route,{cookie='',method='GET',body,status=200}={}){
 const headers={origin};if(cookie)headers.cookie=cookie;
 if(body&&!(body instanceof FormData))headers['content-type']='application/json';
 const response=await fetch(origin+route,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,status,`${method} ${route}: expected ${status}, received ${response.status}`);
 return response;
}
async function login(username,password,role){
 const response=await request('/api/classroom/auth/login',{method:'POST',body:{username,password,expectedRole:role}});
 assert.equal((await response.json()).user.role,role);
 const cookie=response.headers.get('set-cookie');assert.ok(cookie?.includes('HttpOnly'));
 return cookie.split(';')[0];
}
const teacher=await login('demo_teacher',process.env.CLASSROOM_ADMIN_PASSWORD,'teacher');
const studentPassword=process.env.DEMO_STUDENT_1_PASSWORD||process.env.DEMO_STUDENT_PASSWORD;
let student=await login('demo_student_1',studentPassword,'student');
const student2=await login('demo_student_2',process.env.DEMO_STUDENT_PASSWORD,'student');
passed('teacher and two student logins against real database');
for(const page of ['/','/teacher/login','/student/login'])await request(page);
for(const [route,cookie] of [['/api/classroom/overview',teacher],['/api/classroom/student/overview',student]])assert.equal((await(await request(route,{cookie})).json()).ok,true);
await request('/api/classroom/overview',{cookie:student,status:403});
await request('/api/presentation',{method:'POST',cookie:student,body:{},status:403});
await request('/api/classroom/auth/login',{method:'POST',body:{username:'demo_student_1',password:studentPassword,expectedRole:'teacher'},status:401});
passed('frontend login pages, backend overviews and teacher-only API isolation');
await request('/teacher',{cookie:teacher});await request('/student',{cookie:student});
await request('/teacher',{cookie:student,status:307});
passed('authenticated dashboard SSR and student-to-teacher redirect');
const overview=(await(await request('/api/classroom/overview',{cookie:teacher})).json()).data;
const classId=overview.course.id,lessonId=overview.lessons[0].id;
assert.equal(classId,'class-demo-217');
let state;
if(phase==='seed'){
 const marker=`integration-${randomUUID()}`;
 await request('/api/classroom/learning-progress',{method:'POST',cookie:student,status:201,body:{lessonOrdinal:1,moduleType:'translation',itemId:marker,score:81,responseText:'Synthetic surveying translation for persistence verification.',feedback:'Integration test only; no provider used.'}});
 const upload=async file=>{const form=new FormData();form.set('file',new File([await readFile(new URL(`../tests/fixtures/v215/${file}`,import.meta.url))],'integration-demo.pptx',{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));return(await(await request('/api/presentation',{method:'POST',cookie:teacher,body:form,status:201})).json()).presentation;};
 const first=await upload('wide.pptx'),second=await upload('portrait.pptx');
 assert.notEqual(first.version,second.version);
 await request('/api/presentation/file?v='+encodeURIComponent(first.version),{cookie:student,status:409});
 state={project:process.env.COMPOSE_PROJECT_NAME,marker,presentationVersion:second.version,fileSha256:createHash('sha256').update(await readFile(new URL('../tests/fixtures/v215/portrait.pptx',import.meta.url))).digest('hex')};
 await mkdir(new URL('../.audit/',import.meta.url),{recursive:true});await writeFile(statePath,JSON.stringify(state,null,2)+'\n',{flag:'wx'});
 passed('same-name PPT replacement changes version and rejects stale download');
}else{
 state=JSON.parse(await readFile(statePath,'utf8'));assert.equal(state.project,process.env.COMPOSE_PROJECT_NAME);
}
await request('/api/classroom/auth/logout',{method:'POST',cookie:student});
student=await login('demo_student_1',studentPassword,'student');
const progress=await(await request('/api/classroom/learning-progress',{cookie:student})).json();
assert.ok(progress.data.recent.some(x=>x.item_id===state.marker&&Number(x.score)===81));
const other=await(await request('/api/classroom/learning-progress',{cookie:student2})).json();
assert.ok(!other.data.recent.some(x=>x.item_id===state.marker));
passed('saved translation practice survives re-login and is isolated from another student');
const presentation=(await(await request('/api/presentation',{cookie:student})).json()).presentation;
assert.equal(presentation.version,state.presentationVersion);
const bytes=await(await request('/api/presentation/file?v='+encodeURIComponent(state.presentationVersion),{cookie:student})).arrayBuffer();
assert.equal(createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),state.fileSha256);
passed('student sees teacher PPT and stored file bytes match');
if(phase!=='verify'){
 await request('/api/classroom/grades',{method:'PUT',cookie:teacher,body:{classId,studentUserId:'demo-student-1',category:'seminar',rawScore:87,note:'Synthetic integration grade'}});
 await request('/api/classroom/attendance',{method:'PUT',cookie:teacher,body:{classId,lessonId,entries:[{studentUserId:'demo-student-1',status:'late',note:'Synthetic integration attendance'}]}});
 await request('/api/classroom/cold-call',{method:'POST',cookie:teacher,body:{action:'score',classId,lessonId,studentUserId:'demo-student-1',questionId:'demo-1-term',score:8,teacherNote:'Synthetic integration question'}});
 // A syntactically valid UUID not enrolled in this class must still be rejected.
 const headers={origin,cookie:teacher,'content-type':'application/json'};
 const denied=await fetch(origin+'/api/classroom/grades',{method:'PUT',headers,body:JSON.stringify({classId,studentUserId:randomUUID(),category:'seminar',rawScore:99})});
 assert.ok(denied.status>=400,'nonmember grade must be rejected');
 passed('teacher grade/attendance/cold-call writes and rejection of a nonmember');
}
const grades=await(await request('/api/classroom/grades?classId='+classId,{cookie:teacher})).json();
assert.equal(Number(grades.rows.find(x=>x.id==='demo-student-1').scores.seminar),87);
const attendance=await(await request('/api/classroom/attendance?'+new URLSearchParams({classId,lessonId}),{cookie:teacher})).json();
assert.equal(attendance.entries.find(x=>x.studentUserId==='demo-student-1').status,'late');
passed('grade and attendance persisted in PostgreSQL');
await writeFile(new URL(`../.audit/integration-${phase}-results.json`,import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),phase,project:state.project,results,limitations:'Real HTTP/PG/storage checks; not browser UI, generative translation, microphone or GPU acceptance.'},null,2)+'\n');
