# Stateful lesson orchestration v1

Signed-in sessions load compact `study_sessions.lesson_state` before resolution. Course/target columns are authoritative; legacy state initializes lazily. Resolution selects actual catalog IDs and never produces evidence. A balanced subject shortlist (at most 12 units and 12 skills total) allows a new goal to resolve course and target in one semantic call; the selected course's catalog/context is then reloaded. Ambiguity or rejected IDs produces clarification. Catalog limits favor precision over coverage; no global catalog or learner history is sent.

Expected short learner answers reuse the session target (Analyzer + Generator). Existing safety hints identify ordinary support/method followups (Generator). New semantic goals use Resolver + Generator. Semantic Critic is optional for existing high-risk conditions; regeneration stays bounded to one. Every call uses the existing provider interface and deadlines; no provider settings change.

Planner owns ordered actions, target, support stage, expected action and method. Generator executes the plan. Fresh tasks are separate from explanations and stored as `lastTask` only after acceptance. Failed generation cannot advance an absent task into await-attempt. Target links do not imply mastery. Evidence uses the support stage at the time of the learner attempt, before reset for a new independent task. A prerequisite detour retains the complete original target.

Migration is additive and must be reviewed/applied separately after the feature branch review. Run offline `npm test`; run `PGLITE_MODULE_PATH=<local PGlite module> node scripts/check-pedagogy-orchestrator.mjs` for disposable SQL tests. No production credentials are used.
