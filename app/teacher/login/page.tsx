import { redirect } from "next/navigation";
import LoginPanel from "@/components/classroom/login-panel";
import { currentPageUser } from "@/lib/step8a/session";

export const dynamic = "force-dynamic";

export default async function TeacherLoginPage() {
  const user = await currentPageUser();
  if (user?.role === "teacher") redirect("/teacher");
  return <LoginPanel role="teacher" />;
}

