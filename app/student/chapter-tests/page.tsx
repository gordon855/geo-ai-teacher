import RetentionPanel from '@/components/retention/retention-panel';
import LoopPanel from '@/components/remediation/loop-panel';
import Link from 'next/link';import {redirect} from 'next/navigation';import {currentPageUser} from '@/lib/step8a/session';import ChapterTests from '@/components/assessments/chapter-tests';
export const dynamic='force-dynamic';
export default async function Page(){const u=await currentPageUser();if(!u||u.role!=='student')redirect('/student/login');return <main style={{maxWidth:1200,margin:'auto',padding:24,background:'#f0f6f8',minHeight:'100vh'}}><nav style={{display:'flex',gap:20,flexWrap:'wrap'}}><Link href='/student'>学生中心</Link><Link href='/'>AI教师问答</Link><Link href='/student/terrain-3d'>地形与城市3D</Link><Link href='/student/smart-learning'>文献与专业术语</Link></nav><ChapterTests role='student'/><LoopPanel role='student'/><RetentionPanel role='student'/></main>;}
