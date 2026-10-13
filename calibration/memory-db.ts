import catalog from "@/lib/curriculum/catalog-data.json";
import type { Scenario } from "./types";
import { summarizeEvidence, type Evidence } from "@/lib/evidence-engine";
type Row = Record<string, unknown>;
export class MemoryDB {
  tables: Record<string, Row[]>;
  writes: Row[] = [];
  evidenceRows: Row[] = [];
  constructor(s: Scenario) {
    const target = s.lessonState?.target;
    this.tables = {
      children: [{ id: "synthetic-child", name: "Ученица", grade: 7 }],
      student_enrollments: [
        {
          id: "synthetic-enrollment",
          child_id: "synthetic-child",
          academic_year_id: "2026-2027",
          grade: 7,
          curriculum_program_id: "ru.fgos_ooo.base",
          program_confirmed: true,
          status: "active",
          started_on: "2026-09-01",
          ended_on: null,
        },
      ],
      academic_years: [
        {
          id: "2026-2027",
          label: "2026/2027",
          starts_on: "2026-09-01",
          ends_on: "2027-08-31",
        },
      ],
      curriculum_programs: catalog.curriculum_programs,
      skills: catalog.skills.map((s) => ({ ...s, active: true })),
      curriculum_units: catalog.curriculum_units,
      curriculum_unit_skills: catalog.curriculum_unit_skills,
      textbook_editions: catalog.textbook_editions,
      student_textbook_assignments: [],
      tutor_rules: structuredClone(s.parentRules) as Row[],
      study_sessions: [
        {
          id: "synthetic-session",
          child_id: "synthetic-child",
          subject: s.subjectId,
          mode: "practice",
          course_id: target?.courseId || s.courseId,
          target_skill_id: target?.skillId || null,
          target_curriculum_unit_id: target?.curriculumUnitId || null,
          lesson_state: structuredClone(s.lessonState),
        },
      ],
      student_skill_state: s.skillId
        ? [
            {
              child_id: "synthetic-child",
              skill_id: s.skillId,
              status: s.studentStatus,
              independent_successes: s.studentStatus === "mastered" ? 4 : 0,
              hinted_successes: 0,
              failures: 0,
              last_seen_at: null,
            },
          ]
        : [],
      session_skills: [],
    };
  }
  from(table: string) {
    const rows = this.tables[table] || [];
    const predicates: Array<(r: Row) => boolean> = [];
    let limit = Infinity,
      single = false,
      fields: string[] | null = null,
      orderKey: string | undefined,
      ascending = true,
      operation = "read",
      payload: Row | Row[] = {};
    const q = {
      select: (selection?: string) => {
        fields =
          selection && selection !== "*"
            ? selection.split(",").map((k) => k.trim())
            : null;
        return q;
      },
      eq: (key: string, v: unknown) => {
        predicates.push((r) => r[key] === v);
        return q;
      },
      lte: (key: string, v: unknown) => {
        predicates.push((r) => String(r[key]) <= String(v));
        return q;
      },
      in: (key: string, v: unknown[]) => {
        predicates.push((r) => v.includes(r[key]));
        return q;
      },
      or: (expr: string) => {
        const alternatives = expr.split(",").map((part) => {
          const [key, op, ...parts] = part.split(".");
          const v = parts.join(".");
          return (r: Row) =>
            op === "is"
              ? r[key] == null
              : op === "gte"
                ? String(r[key]) >= v
                : String(r[key]) === v;
        });
        predicates.push((r) => alternatives.some((p) => p(r)));
        return q;
      },
      order: (key: string, opts?: { ascending?: boolean }) => {
        orderKey = key;
        ascending = opts?.ascending !== false;
        return q;
      },
      limit: (n: number) => {
        limit = n;
        return q;
      },
      maybeSingle: () => {
        single = true;
        return q;
      },
      single: () => {
        single = true;
        return q;
      },
      update: (v: Row) => {
        operation = "update";
        payload = v;
        return q;
      },
      insert: (v: Row | Row[]) => {
        operation = "insert";
        payload = v;
        return q;
      },
      abortSignal: () => q,
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        try {
          let selected = rows.filter((r) => predicates.every((p) => p(r)));
          if (orderKey) {
            const k = orderKey;
            selected.sort(
              (a, b) =>
                (typeof a[k] === "number" && typeof b[k] === "number"
                  ? Number(a[k]) - Number(b[k])
                  : String(a[k]) < String(b[k])
                    ? -1
                    : String(a[k]) > String(b[k])
                      ? 1
                      : 0) * (ascending ? 1 : -1),
            );
          }
          selected = selected.slice(0, limit);
          if (operation === "update") {
            for (const row of selected)
              Object.assign(row, structuredClone(payload));
            this.writes.push({
              table,
              operation,
              payload: structuredClone(payload),
            });
          }
          if (operation === "insert") {
            const entries = Array.isArray(payload) ? payload : [payload];
            if (
              table === "session_skills" &&
              entries.some((e) =>
                rows.some(
                  (r) =>
                    r.session_id === e.session_id &&
                    r.skill_id === e.skill_id &&
                    r.role === e.role,
                ),
              )
            )
              return Promise.resolve(
                resolve({ data: null, error: { code: "23505" } }),
              );
            rows.push(...structuredClone(entries));
            this.tables[table] = rows;
            selected = entries;
            this.writes.push({
              table,
              operation,
              payload: structuredClone(payload),
            });
          }
          const projected = selected.map((row) =>
            fields
              ? Object.fromEntries(
                  fields.filter((k) => k in row).map((k) => [k, row[k]]),
                )
              : row,
          );
          return Promise.resolve(
            resolve({
              data: single
                ? structuredClone(projected[0] || null)
                : structuredClone(projected),
              error: null,
            }),
          );
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
        }
      },
    };
    return q;
  }
  rpc(_name: string, p: Row) {
    if (
      this.evidenceRows.some(
        (e) => e.p_turn_id === p.p_turn_id && e.p_skill_id === p.p_skill_id,
      )
    )
      return Promise.resolve({ data: null, error: null });
    this.evidenceRows.push(structuredClone(p));
    const skill = String(p.p_skill_id),
      state = this.tables.student_skill_state.find((r) => r.skill_id === skill);
    const history: Evidence[] = this.evidenceRows
      .filter((e) => e.p_skill_id === skill)
      .map((e) => ({
        correctness: e.p_correctness as Evidence["correctness"],
        supportStage: Number(e.p_support_stage),
        sessionId: String(e.p_session_id),
        date: "2026-10-13",
      }));
    const summary = summarizeEvidence(
      history,
      String(state?.status || "not_seen"),
    );
    if (state) Object.assign(state, summary);
    else
      this.tables.student_skill_state.push({
        child_id: "synthetic-child",
        skill_id: skill,
        ...summary,
      });
    return {
      abortSignal: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: null, error: null })),
    };
  }
  get session() {
    return this.tables.study_sessions[0];
  }
}
