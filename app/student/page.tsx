import { redirect } from "next/navigation";
import StudentDashboard from "@/components/classroom/student-dashboard";
import { currentPageUser } from "@/lib/step8a/session";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const user = await currentPageUser();
  if (!user) redirect("/student/login");
  if (user.role !== "student") redirect("/student/login");
  return <StudentDashboard user={user} />;
}
