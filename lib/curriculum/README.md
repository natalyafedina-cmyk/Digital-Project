# Student, curriculum and academic lifecycle foundation

Apply/review `supabase/migrations/*_student_curriculum_lifecycle_v1.sql` separately
before merging the application branch. This sprint does not apply production DDL,
create personal enrollments/assignments, backfill skills, or modify `topic_progress`.
The default program is a profile, not a confirmed school curriculum.

Permanent skill identity is `(child_id, skill_id)`. Enrollment and textbook
assignments contain academic context only. Shared editions can be reused by any
child; multiple assignments for the same course are intentional. Unknown ISBN,
part counts, pages and unit structure remain null/absent. Seed provenance is the
product owner's confirmed sprint specification, reflected in `catalog-data.json`.
Only 51 provided high-level blocks and 63 provided starter skill IDs are seeded.

`getActiveLearningContext(childId, subjectId, courseId, repository, options)` reads
an owned child, one currently active enrollment, its year/program, at most 12
assignments for the selected course and only their editions. It can additionally
load one explicitly requested, verified skill/state. It never reads learning
history or converts free-text topics. Math/history without an explicit course
stay unspecified; single-course subjects choose their course automatically.

The server validates the existing browser session's bearer token with Supabase
and queries using the public publishable key plus that token. RLS remains the
ownership boundary. No service-role key or new login/cookie architecture is used.
Without an enrollment, the child's legacy grade is used. Anonymous lessons retain
the existing configured default. Missing new tables during migration rollout
return the legacy context; other database errors do not silently use another child.

`transitionAcademicEnrollment` and `replaceTextbookAssignment` invoke atomic,
SECURITY INVOKER SQL functions under parent ownership RLS. Transitions preserve
child identity and existing learning data; replacements close the previous book
on the day before the new book begins. No current code writes skill state or skill
evidence: these remain read-only to authenticated clients until a future engine
is introduced. STT confidence is stored as recognition metadata, with no scoring
trigger or mastery algorithm. Support stages remain 0–4.

The parent academic block is read-only. Course chips pass `?course=...` into the
existing subject/mode routes. New sessions record course identity; unique-course
legacy sessions remain restorable without backfill. Generic math/history sessions
are not automatically classified by topic text.

## Validation

`npm test` includes context/configuration, tutor integration and repository bounds.
The SQL suite checks actual catalog counts, RLS ownership, write restrictions,
foreign-key indexes, prerequisite cycles, duplicate active enrollments, textbook
intervals and academic transitions. It runs only against a local disposable DB:

```sh
npm install --prefix /tmp/curriculum-sql-check --no-save --package-lock=false @electric-sql/pglite
PGLITE_MODULE_PATH=/tmp/curriculum-sql-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/check-student-curriculum-migration.mjs
```

The embedded PostgreSQL runner requires no Supabase credentials and does not change
application dependencies. It loads the existing local schema and runs fake fixtures
inside a rolled-back transaction. This is a local PostgreSQL/RLS check, not proof
that a production migration has been applied. Native Supabase CLI is not required.
