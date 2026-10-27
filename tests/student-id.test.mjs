import test from 'node:test';
import assert from 'node:assert/strict';
import {StudentIdSchema} from '../lib/step8a/student-id.ts';
test('production keeps UUID validation; only demo mode accepts the three existing seed IDs',()=>{
 const before=process.env.DEMO_MODE;
 try{
  delete process.env.DEMO_MODE;
  assert.equal(StudentIdSchema.safeParse('b16ff1a0-619e-4b8a-9ad6-0ef92ff9a001').success,true);
  assert.equal(StudentIdSchema.safeParse('demo-student-1').success,false);
  process.env.DEMO_MODE='1';
  for(const id of ['demo-student-1','demo-student-2','demo-student-3'])assert.equal(StudentIdSchema.safeParse(id).success,true);
  for(const id of ['teacher','demo-student-4','../user','',null])assert.equal(StudentIdSchema.safeParse(id).success,false);
 }finally{if(before===undefined)delete process.env.DEMO_MODE;else process.env.DEMO_MODE=before;}
});
