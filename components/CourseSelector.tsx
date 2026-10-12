import Link from "next/link";
import { coursesForSubject, courseQuery } from "@/lib/curriculum/catalog";
export default function CourseSelector({ subjectId, selectedCourseId, mode }: {
  subjectId: string; selectedCourseId?: string | null; mode?: string;
}) {
  const courses = coursesForSubject(subjectId);
  if (courses.length <= 1) return null;
  const base = `/subject/${subjectId}${mode ? `/${mode}` : ""}`;
  return (
    <nav className="flex flex-wrap gap-2 my-4" aria-label="Курс предмета">
      {courses.map(course => (
        <Link key={course.id} href={base + courseQuery(course.id)} aria-current={selectedCourseId === course.id ? "page" : undefined}
          className={`rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-sm ${selectedCourseId === course.id ? "bg-violet-600 text-white" : "bg-white text-violet-700"}`}>
          {course.displayName}
        </Link>
      ))}
    </nav>
  );
}
