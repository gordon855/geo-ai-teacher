import StudentAssignmentPanel from "@/components/assignments/student-assignment-panel";
import { redirect } from "next/navigation";
import IntelligentLearningCenter from "@/components/classroom/intelligent-learning-center";
import { getStudentOverview } from "@/lib/step8a/database";
import { currentPageUser } from "@/lib/step8a/session";

export const dynamic = "force-dynamic";

export default async function SmartLearningPage() {
  const user = await currentPageUser();
  if (!user) redirect("/student/login");
  if (user.role !== "student") redirect("/student/login");
  const overview = await getStudentOverview(user.id);
  return <><IntelligentLearningCenter user={user} initialLessonOrdinal={overview.course.currentLessonOrdinal} /><StudentAssignmentPanel /></>;
}
