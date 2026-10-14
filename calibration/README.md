# Sofia calibration and release gate

This evaluation layer imports the unchanged `/api/tutor` route, real academic-context repositories, curriculum catalog, request resolver, analyzer, planner, parent rules, critic and evidence eligibility. Auth and database access are isolated using AsyncLocalStorage and an in-memory PostgREST-like query adapter. Nothing connects to Supabase. Vision outcomes are synthetic; no OCR/TTS charges occur. The fake evidence repository records RPC requests and models counters using the existing evidence contract; it does **not** validate production SQL/RLS.

## Run safely

- `npm test`: existing tests plus offline harness/framework tests; never paid APIs.
- `npm run calibrate:offline`: full structural baseline, scripted semantic responses; product failures are recorded, not fixed.
- `RUN_CALIBRATION_EXTERNAL=1 npm run calibrate:smoke`: 18 representative scenarios, real configured candidate generation and real production prompts/settings.
- `RUN_CALIBRATION_EXTERNAL=1 npm run calibrate:external -- --candidate A,B --concurrency 2`: full isolated benchmark. Candidate B is optional.
- `npm run calibrate:report`: summarize saved results.
- `npm run calibrate:gate`: exit 0 only READY, 1 measured failure, 2 unverified/incomplete. A successful measurement command is **not** a passing release gate.

Filters: `--subject`, `--category`, `--id`, `--candidate A|B|A,B`, `--no-judge`, `--output`. Repeats: `--repeats 3` only for a selected subset of at most 20 scenarios; default one. Concurrency 1–4, default 2. Scenario candidate-time budget 60 seconds (Judge time excluded), each Judge deadline 20 seconds, underlying production provider/semantic deadlines retained. No infrastructure retry by default (maximum zero, not hiding transport instability). Runtime's one critic repair remains unchanged and is counted separately.

A uses existing `LLM_*` / Yandex configuration **only if already configured**. B uses `CALIBRATION_B_PROVIDER`, `_BASE_URL`, `_API_KEY`, `_MODEL` (and `_FOLDER_ID` for Yandex). Judge uses corresponding `CALIBRATION_JUDGE_*`. Configuration is passed to the existing provider factory as a separate object; process.env and production variables are never mutated. Do not put credentials in files/reports. HTTPS/provider validation remains in the existing adapter. Missing A = SKIPPED_NO_CREDENTIALS; missing B = NOT_RUN; missing Judge = NOT_MEASURED.

## Measurement and certification

The 0–4 semantic rubric separates scientific correctness from child clarity, age fit, naturalness, concept load, jargon handling, focus, adaptation and pedagogy. Optional dimensions cover beginner English, humanities, method switching and visuals. Scores below 3 on relevant dimensions fail that scenario. Unknown dimensions, scores outside integer 0–4, unknown flags and malformed JSON become JUDGE_ERROR. No chain of thought is requested or stored.

Independent Judge means a configured **different model identifier** from the candidate. This is configuration-level independence, not a guarantee of unrelated model families. Self-judged scores are diagnostic only and never certify READY. Full certification requires 120+ completed scenarios, all subjects, no critical hard failure, independent semantic judging, all category thresholds and external latency targets. No single mean hides a failed subject/category.

Reports keep OFFLINE, A, B and Judge results separate. Offline wall-clock is mock timing, never user latency; no offline clarity percentages are invented. Percentiles use nearest-rank. Hard/semantic scenario pass rates use worst applicable turn; performance rates use generated turns, excluding deterministic clarification/transcript messages. Trace records durations/kinds only, never system prompts or credentials. Candidate calls and Judge latency are separate.

Critic instrumentation wraps the real acceptResponse function without changing it, capturing original/repair candidates and final output. Fallback observation compares all safeResponse fields with the accepted response before route normalization; includes mandatory stage-zero self-check overrides. This is an observational classification, not a new runtime event. Reports expose that limitation.

Scenario contracts assert goals, target/state/action/evidence; scripted offline prose is **not** an ideal answer and cannot measure model quality. Counterfactual adaptation scenarios explicitly override synthetic known skill statuses; they are not inferred child mastery. Failed semantic responses, top layer hypotheses, IDs, compact call traces and 20 representative examples appear in JSON/Markdown. Layer classification is a hypothesis; a script-generated bad candidate is not evidence against Qwen.

Existing 74 `tests/golden/scenarios.json` rows, stateful fixtures and integration tests remain intact. Canonical ladder 0–6 versus runtime 0–4 is informational. TTS independence is checked separately at the text route boundary; full browser rendering/speech and production SQL are outside this calibration harness.

Reports also record the evaluated Git commit and a SHA-256 fingerprint of app/lib sources. The baseline field identifies the Sprint 5 seed baseline; use evaluatedCommit/runtimeFingerprint to compare later runs.

## Sprint 5.1 GitHub Actions

`.github/workflows/tutor-calibration.yml` runs secret-free offline checks on relevant
PRs to main. Paid runs require owner-triggered `workflow_dispatch`, default
`mode=smoke`, `candidate=A`. Full always runs an approximately 18-scenario smoke
first. A healthy smoke can be pedagogically NOT_READY; configuration, missing
independent Judge, zero completions, authentication or infrastructure failures
stop full. The infrastructure cutoff is 20% failed logical calls, Judge errors or
timeouts; at least one measured Judge result is required. No retries are added.
Optional unconfigured B is NOT_RUN and does not block A.

One-time repository configuration (Settings → Secrets and variables → Actions):

- Secret `MWS_CALIBRATION_API_KEY` (evaluation-only MWS key).
- Variable `MWS_CALIBRATION_BASE_URL`:
  `https://gpt.mwsapis.ru/projects/project-kubysha55/openai/v1` (also fallback).
- Variable `CALIBRATION_A_MODEL`: `qwen3-6-35b-a3b` (also fallback).
- Variable `CALIBRATION_JUDGE_MODEL`: actual independent deployment ID, preferably
  `gpt-5.4`. No Judge default; absent or identical ID stops paid execution.

These settings never change Railway or production. Never paste keys into chat.
Codex currently has no MWS credential binding; no external baseline was measured
in Sprint 5.1. A GitHub secret is not automatically accessible inside Codex.

Actions must know this workflow on the default branch before the UI can offer
manual dispatch. This sprint only pushes the existing feature branch; activation
through the repository's normal review/merge process remains a separate action.
Once available, choose this evaluated branch/ref explicitly when dispatching.

Artifacts retain JSON/Markdown for 90 days, named by candidate, mode, SHA and run
attempt. Download accepted baselines for longer retention. Reports are uploaded
before the final full A gate; exit 1 means measured NOT_READY, exit 2 means
incomplete/unverified. Offline structural failures are recorded, not converted
into a false passing release certificate.

To compare a future run with an accepted external baseline, supply both
`baseline_run_id` and the exact `baseline_artifact` from that same repository.
It must contain one `ci-full/sprint5-baseline.json`. With no accepted run supplied,
the committed Sprint 5 offline report is the initial reference. Comparisons
require identical modes and scenario IDs; unavailable or incompatible values
are NOT_COMPARABLE, never zero. Hard gate regressions remain visible regardless
of improvements in clarity. No automatic baseline promotion is performed.

Local saved-report utilities (no paid calls):

```sh
node scripts/calibration-preflight.mjs path/to/smoke/sprint5-baseline.json
node scripts/compare-calibration.mjs previous.json current.json work/comparison A
```

The comparison writes Markdown/JSON and appends a compact summary to
`GITHUB_STEP_SUMMARY` when set. Use `-` instead of previous.json if none exists.
The helpers do not modify runtime behavior or report scores.
