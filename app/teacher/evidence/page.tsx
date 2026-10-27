import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentPageUser} from '@/lib/step8a/session';
import RetentionPanel from '@/components/retention/retention-panel';
export const dynamic='force-dynamic';
export default async function Page(){const u=await currentPageUser();if(!u)redirect('/teacher/login');if(u.role!=='teacher')redirect('/student');return <main style={{maxWidth:1500,margin:'auto',padding:24}}><Link href='/teacher'>返回教师工作台</Link><RetentionPanel role='teacher'/></main>;}
