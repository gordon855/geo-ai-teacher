import {redirect} from 'next/navigation';
import {currentPageUser} from '@/lib/step8a/session';
import SecurityCenter from '@/components/security/security-center';
export const dynamic='force-dynamic';
export default async function Page(){const user=await currentPageUser();if(!user)redirect('/teacher/login');if(user.role!=='teacher')redirect('/student');return <SecurityCenter/>;}
