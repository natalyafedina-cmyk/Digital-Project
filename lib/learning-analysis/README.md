# Universal learning pipeline (Sprint 3)

The tutor uses the existing provider interfaces without changing adapters. Attempts
receive an optional bounded semantic analysis (temperature 0; 8-second deadline).
Management/help/fresh-task requests normally need generation only. Existing intent
heuristics are signals: mixed turns with an explicit attempt can still be analyzed.
Analyzer failure or low confidence returns unknown, never a learning error.

Skill candidates are read from the actual active subject/course catalog, at most 12,
ordered using the enrollment's curriculum context. Model IDs outside this set are
removed. No free-text legacy topics are backfilled or converted. Skill state sent
to the planner is a small status/counter signal, not full evidence history.

All generations pass the deterministic critic. Complex rules or beginner error
responses may use the bounded semantic critic. There is at most one repair. If
checks still fail, a generic scaffold/self-check replaces the response. Critic
flags evaluate the tutor; they never change learner correctness or skill evidence.
First reliable incorrect attempts receive self-check feedback with no completed
answer. English support remains Russian with a request for an English retry.
Structured numeric scaffolds derive operands from content; no fixed example lives
in runtime. Generation cannot override the analyzer's correctness.

Parent rules are interpreted semantically, previewed and saved only after explicit
parent confirmation. Ambiguous scope/time/skill asks clarification. Legacy raw
rules remain scoped instructions. The resolver filters active/child/subject/course/
skill/trigger/time, ordering priority then specificity then ID. Hard pedagogy,
privacy and evidence integrity always outrank parental preferences. Replacement
confirmation saves the new rule before disabling the old one, preventing loss of
the existing rule if saving fails. No migration interprets or mutates old rules.

Evidence requires a verified skill, an actual answer/partial answer, observable
summary, analysis confidence >= .70 and STT confidence >= .65 when provided.
Absent STT confidence stays absent. Writes have a separate 3-second timeout and
technical-only failure log; accepted text remains available on memory failure.

The new SQL migration uses SECURITY INVOKER + ownership RLS, validates evidence
against the session/skill context, deduplicates (child,skill,turn), and atomically
updates counters through an evidence trigger. A state trigger blocks direct writes
outside the engine. Independent and hinted successes have distinct counters and
weights. Broad status requires repeated independent successes and at least two
sessions/dates for mastery; two independent failures after the latest independent
success can mark needs_review. One failure preserves mastered. Confidence is an
explicit coverage signal (reliable evidence_count / 5, capped at 1), not a scientific
probability. mastery_score is not assigned; an existing value remains unchanged.
No automatic personality, preferences or interests updates exist.

## Validation and rollout

`npm test` runs offline unit/integration contracts and 74 golden fixture scenarios.
`npm run golden` is an explicit optional real-provider analyzer runner; without
configured credentials it skips. Offline fixture payloads check pipeline contracts,
not proof of live-model semantic accuracy. No external model run is required by
normal tests or build. Fixtures contain the legacy phrases; runtime scans reject
their reintroduction.

For local disposable PostgreSQL/RLS validation, use a temporary PGlite install:

```sh
PGLITE_MODULE_PATH=/tmp/curriculum-sql-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/check-universal-learning-core.mjs
```

Apply/review the NEW `*_universal_learning_core_v1.sql` migration separately before
merging. Do not reapply/edit Sprint 2 migrations. This branch does not change child
identity, enrollment, curriculum/catalog content, images or production services.
