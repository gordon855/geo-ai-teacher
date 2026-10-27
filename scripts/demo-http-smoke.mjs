import assert from 'node:assert/strict';
const origin='http://localhost:3000';
for(const [username,password,role] of [['demo_teacher',process.env.CLASSROOM_ADMIN_PASSWORD,'teacher'],['demo_student_1',process.env.DEMO_STUDENT_PASSWORD,'student']]){
 const response=await fetch(origin+'/api/classroom/auth/login',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({username,password,expectedRole:role})});
 assert.equal(response.status,200,`${role} login`);
 const result=await response.json();assert.equal(result.user.role,role);assert.equal(result.user.mustChangePassword,true);
 assert.ok(response.headers.get('set-cookie')?.includes('HttpOnly'));
 const wrong=await fetch(origin+'/api/classroom/auth/login',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({username,password,expectedRole:role==='teacher'?'student':'teacher'})});
 assert.equal(wrong.status,401,'role mismatch must fail');
}
console.log('HTTP login and role mismatch checks passed. This is not browser or hardware acceptance.');
