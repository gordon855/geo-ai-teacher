import {z} from 'zod';
import {securityPool,rate} from '../step19/store.mjs';
export const submitSchema=z.object({id:z.string().uuid(),classId:z.string().min(1).max(100),content:z.string().trim().min(1,'请填写留言').max(2000,'最多2000字')}).strict();
const updateSchema=z.object({id:z.string().uuid(),status:z.enum(['new','read','handled'])}).strict();
const listSchema=z.object({classId:z.string().min(1).max(100),status:z.enum(['all','new','read','handled']).default('all'),page:z.coerce.number().int().min(0).max(10000).default(0)});
export class MessageError extends Error{constructor(status,message){super(message);this.status=status;}}
function role(u,r){if(!u)throw new MessageError(401,'请先登录');if(u.role!==r)throw new MessageError(403,'当前账号无权执行此操作');if(u.mustChangePassword)throw new MessageError(403,'请先修改初始密码');}
export function createMessageStore(db=securityPool(),limit=rate){return {
 async submit(u,input){role(u,'student');const x=submitSchema.parse(input);
  if(!(await db.query('SELECT 1 FROM enrollments WHERE class_id=$1 AND user_id=$2',[x.classId,u.id])).rowCount)throw new MessageError(403,'你不属于所选班级');
  // Rate counter is separate: no content/message ID is linked to the account.
  await limit(db,'message216:'+u.id,5,600);
  await db.query('INSERT INTO v216_messages(id,class_id,content) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[x.id,x.classId,x.content]);return {ok:true,id:x.id};},
 async list(u,input){role(u,'teacher');const x=listSchema.parse(input);
  // Existing teacher roles share administration of all classes.
  const rows=(await db.query("SELECT id,class_id,content,status,created_at,updated_at FROM v216_messages WHERE class_id=$1 AND ($2='all' OR status=$2) ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET $3",[x.classId,x.status,x.page*20])).rows;
  const counts=(await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='new')::int AS unread FROM v216_messages WHERE class_id=$1",[x.classId])).rows[0];return {rows:rows.slice(0,20),hasMore:rows.length>20,...counts};},
 async update(u,input){role(u,'teacher');const x=updateSchema.parse(input);const q=await db.query('UPDATE v216_messages SET status=$1,updated_at=now() WHERE id=$2 RETURNING id,status',[x.status,x.id]);if(!q.rowCount)throw new MessageError(404,'留言不存在');return {ok:true,...q.rows[0]};}
};}
