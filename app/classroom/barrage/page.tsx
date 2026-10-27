import {redirect} from 'next/navigation';
import {currentPageUser} from '@/lib/step8a/session';
import BarrageArchive from '@/components/security/barrage-archive';
export const dynamic='force-dynamic';
export default async function Page(){if(!await currentPageUser())redirect('/student/login');return <BarrageArchive/>;}
