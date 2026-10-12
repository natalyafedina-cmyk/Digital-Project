import type { AcademicSummary } from "@/lib/curriculum/client-context";
export default function AcademicContext({ summary }: { summary: AcademicSummary }) {
  return (
    <section className="rounded-[24px] bg-white p-5 shadow-sm mb-4" aria-label="Учебный контекст">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
        <span>Учебный год: <strong>{summary.academicYear || "не указан"}</strong></span>
        <span>Класс: <strong>{summary.grade}</strong></span>
        <span>Программа: <strong>{summary.program || "не указана"}</strong>{summary.program && !summary.programConfirmed ? " (не подтверждена)" : ""}</span>
        <span>Активных учебников: <strong>{summary.textbookCount}</strong></span>
      </div>
    </section>
  );
}
