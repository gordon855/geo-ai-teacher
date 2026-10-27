import { redirect } from "next/navigation";
import { currentPageUser } from "@/lib/step8a/session";

export const dynamic = "force-dynamic";

export default async function TeacherOnlyAvatarLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentPageUser();
  if (!user) redirect("/teacher/login");
  if (user.role !== "teacher") redirect("/student");
  return children;
}
