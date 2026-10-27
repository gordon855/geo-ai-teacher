import {redirect} from 'next/navigation';import Link from 'next/link';import {currentPageUser} from '@/lib/step8a/session';import ScenarioPanel from '@/components/workstations/scenario-panel';
export const dynamic='force-dynamic';
export default async function Page(){const user=await currentPageUser();if(!user)redirect('/student/login');if(user.role!=='student')redirect('/teacher?module=scenarios');return <main style={{maxWidth:1250,margin:'0 auto',padding:24,width:'100%'}}><Link href='/student'>← 返回学生中心</Link><ScenarioPanel role='student'/></main>;}
