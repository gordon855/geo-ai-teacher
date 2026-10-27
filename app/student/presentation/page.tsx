import { redirect } from "next/navigation";
import StudentPresentationWorkspace from "@/components/presentation/student-presentation-workspace";
import { currentPageUser } from "@/lib/step8a/session";

export const dynamic = "force-dynamic";

export default async function StudentPresentationPage() {
  const user = await currentPageUser();
  if (!user) redirect("/student/login");
  if (user.role === "teacher") redirect("/student/login");
  return <StudentPresentationWorkspace user={user} />;
}
