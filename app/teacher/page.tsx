import { redirect } from "next/navigation";
import TeacherDashboard from "@/components/classroom/teacher-dashboard";
import { currentPageUser } from "@/lib/step8a/session";

export const dynamic = "force-dynamic";

export default async function TeacherPage({searchParams}: {searchParams: Promise<{module?: string}>}) {
  const user = await currentPageUser();
  if (!user) redirect("/teacher/login");
  if (user.role !== "teacher") redirect("/student");
  return <TeacherDashboard key={(await searchParams).module || "dashboard"} initialModule={(await searchParams).module} teacherName={user.displayName} mustChangePassword={user.mustChangePassword} />;
}
