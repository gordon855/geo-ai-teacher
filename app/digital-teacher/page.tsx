import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/lib/step8a/session";
import ChatWorkspace from "@/components/chat-workspace";
import { config } from "@/lib/step21-1/core.mjs";
export const dynamic = "force-dynamic";
export default async function DigitalTeacher() {
  const user = await currentPageUser();
  if (!user) redirect('/student/login');
  const service = config();
  return <><div className="v212-conversation-banner"><div><strong>知性女教师 · 直接对话</strong><span>输入或说出问题，阅读文字并听讲解。内置 2.5D 多口型动画。</span></div><Link href="/">返回问答工作台</Link>{user.role === 'teacher' && service.enabled && service.bridgeConfigured && service.liteavatar ? <a href="/teacher/liteavatar">教师端 LiteAvatar 一键启动 ↗</a> : null}</div><ChatWorkspace direct /></>;
}
