import Link from "next/link";
import { redirect } from "next/navigation";
import Terrain3dLab from "@/components/training/terrain-lab";
import { currentPageUser } from "@/lib/step8a/session";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function StudentTerrainPage() {
  const user = await currentPageUser();
  if (!user) redirect("/student/login");
  if (user.role !== "student") redirect("/student/login");
  return <main className={styles.page}>
    <header><Link href="/student"><i>测</i><span><b>经纬拾光</b><small>测绘专业外语 · VERSION 21</small></span></Link><nav><Link href="/student">学习首页</Link><Link href="/student/smart-learning">智能实训</Link><Link className={styles.active} href="/student/terrain-3d">3D地形</Link><Link href="/">AI教师问答</Link></nav></header>
    <div className={styles.content}><Terrain3dLab role="student" userName={user.displayName} /></div>
  </main>;
}
