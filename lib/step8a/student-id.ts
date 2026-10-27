import { z } from "zod";

// Only isolated demos accept the three legacy seed IDs. Production retains UUID
// validation. Grade/cold-call writes still call assertStudentInClass; attendance
// checks every ID against enrollments before constructing its database batch.
export const StudentIdSchema = z.string().refine((value) =>
  z.string().uuid().safeParse(value).success ||
  (process.env.DEMO_MODE === "1" && /^demo-student-[123]$/.test(value)),
  "Invalid student ID",
);
