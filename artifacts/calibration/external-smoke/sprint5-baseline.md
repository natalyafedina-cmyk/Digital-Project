Candidate: A; external status: SKIPPED_NO_CREDENTIALS

# SOFIA CALIBRATION BASELINE

Baseline: 0c020714860a297dfcf68be92fbf9970d9ad41e4
Mode: external
Scenarios: 0/18
Completed: 0
Verdict: **SEMANTIC_UNVERIFIED**
Semantic release validity: UNVERIFIED

## Release readiness matrix

| Metric | Threshold | Actual | Status | Evidence |
|---|---|---:|---|---|
| critical_failures | 0 | 0.00 | PASS |  |
| no_premature_answer | >= 100% | NOT MEASURED | UNVERIFIED |  |
| lesson_continuity | >= 95% | NOT MEASURED | UNVERIFIED |  |
| parent_rule_compliance | >= 95% | NOT MEASURED | UNVERIFIED |  |
| stt_integrity | >= 100% | NOT MEASURED | UNVERIFIED |  |
| curriculum_integrity | >= 100% | NOT MEASURED | UNVERIFIED |  |
| evidence_integrity | >= 100% | NOT MEASURED | UNVERIFIED |  |
| internal_leakage | >= 100% | NOT MEASURED | UNVERIFIED |  |
| task_duplication | >= 98% | NOT MEASURED | UNVERIFIED |  |
| pedagogical_actions | >= 95% | NOT MEASURED | UNVERIFIED |  |
| pedagogical_next_step | >= 95% (independent Judge) | NOT MEASURED | UNVERIFIED |  |
| child_clarity | >= 90% (independent Judge) | NOT MEASURED | UNVERIFIED |  |
| age_fit | >= 90% (independent Judge) | NOT MEASURED | UNVERIFIED |  |
| student_adaptation | >= 90% (independent Judge) | NOT MEASURED | UNVERIFIED |  |
| english_beginner_support | >= 90% (independent Judge) | NOT MEASURED | UNVERIFIED |  |
| all_subject_coverage | 9 subjects | 0.00 | UNVERIFIED |  |
| subject_semantic:math | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:russian | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:english | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:literature | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:physics | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:biology | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:geography | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:history | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:informatics | >=85% | NOT MEASURED | UNVERIFIED |  |
| p50_seconds | <=7s | NOT MEASURED | UNVERIFIED |  |
| p95_seconds | <=15s | NOT MEASURED | UNVERIFIED |  |

## All subjects

| Subject | Scenarios | Hard pass % | Semantic pass % |
|---|---:|---:|---:|
| math | 0 | NOT MEASURED | NOT MEASURED |
| russian | 0 | NOT MEASURED | NOT MEASURED |
| english | 0 | NOT MEASURED | NOT MEASURED |
| literature | 0 | NOT MEASURED | NOT MEASURED |
| physics | 0 | NOT MEASURED | NOT MEASURED |
| biology | 0 | NOT MEASURED | NOT MEASURED |
| geography | 0 | NOT MEASURED | NOT MEASURED |
| history | 0 | NOT MEASURED | NOT MEASURED |
| informatics | 0 | NOT MEASURED | NOT MEASURED |

## Performance

Timing: EXTERNAL_WALL_CLOCK_EXCLUDES_JUDGE. p50=NOT MEASUREDms; p90=NOT MEASUREDms; p95=NOT MEASUREDms; max=NOT MEASUREDms. Judge timing is separate.
Calls: 0; average/turn=NOT MEASURED; average/scenario=NOT MEASURED; max/turn=0; max/scenario=0.
First-pass=NOT MEASURED%; repair=NOT MEASURED% (0); fallback=NOT MEASURED% (0).

## Top systemic failure clusters (hypotheses, no fixes)



## Representative review sample



## Measurement boundaries

- Runtime help ladder 0–4 versus canonical protocol 0–6: informational, no automatic failure.
- Offline scripted responses measure structure, not model language quality.
- Fallback observation uses equality with current safeResponse fields; policy self-check overrides are included.
- Fake DB is not an RLS/SQL benchmark; existing local SQL tests remain separate.
- Counts are logical LLMProvider.generate calls; adapter-internal fallback HTTP requests are not separately observed.
- No infrastructure retries by default; semantic answers never retried outside runtime critic.


---

Candidate: B; external status: NOT_RUN

# SOFIA CALIBRATION BASELINE

Baseline: 0c020714860a297dfcf68be92fbf9970d9ad41e4
Mode: external
Scenarios: 0/18
Completed: 0
Verdict: **SEMANTIC_UNVERIFIED**
Semantic release validity: UNVERIFIED

## Release readiness matrix

| Metric | Threshold | Actual | Status | Evidence |
|---|---|---:|---|---|
| critical_failures | 0 | 0.00 | PASS |  |
| no_premature_answer | >= 100% | NOT MEASURED | UNVERIFIED |  |
| lesson_continuity | >= 95% | NOT MEASURED | UNVERIFIED |  |
| parent_rule_compliance | >= 95% | NOT MEASURED | UNVERIFIED |  |
| stt_integrity | >= 100% | NOT MEASURED | UNVERIFIED |  |
| curriculum_integrity | >= 100% | NOT MEASURED | UNVERIFIED |  |
| evidence_integrity | >= 100% | NOT MEASURED | UNVERIFIED |  |
| internal_leakage | >= 100% | NOT MEASURED | UNVERIFIED |  |
| task_duplication | >= 98% | NOT MEASURED | UNVERIFIED |  |
| pedagogical_actions | >= 95% | NOT MEASURED | UNVERIFIED |  |
| pedagogical_next_step | >= 95% (independent Judge) | NOT MEASURED | UNVERIFIED |  |
| child_clarity | >= 90% (independent Judge) | NOT MEASURED | UNVERIFIED |  |
| age_fit | >= 90% (independent Judge) | NOT MEASURED | UNVERIFIED |  |
| student_adaptation | >= 90% (independent Judge) | NOT MEASURED | UNVERIFIED |  |
| english_beginner_support | >= 90% (independent Judge) | NOT MEASURED | UNVERIFIED |  |
| all_subject_coverage | 9 subjects | 0.00 | UNVERIFIED |  |
| subject_semantic:math | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:russian | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:english | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:literature | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:physics | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:biology | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:geography | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:history | >=85% | NOT MEASURED | UNVERIFIED |  |
| subject_semantic:informatics | >=85% | NOT MEASURED | UNVERIFIED |  |
| p50_seconds | <=7s | NOT MEASURED | UNVERIFIED |  |
| p95_seconds | <=15s | NOT MEASURED | UNVERIFIED |  |

## All subjects

| Subject | Scenarios | Hard pass % | Semantic pass % |
|---|---:|---:|---:|
| math | 0 | NOT MEASURED | NOT MEASURED |
| russian | 0 | NOT MEASURED | NOT MEASURED |
| english | 0 | NOT MEASURED | NOT MEASURED |
| literature | 0 | NOT MEASURED | NOT MEASURED |
| physics | 0 | NOT MEASURED | NOT MEASURED |
| biology | 0 | NOT MEASURED | NOT MEASURED |
| geography | 0 | NOT MEASURED | NOT MEASURED |
| history | 0 | NOT MEASURED | NOT MEASURED |
| informatics | 0 | NOT MEASURED | NOT MEASURED |

## Performance

Timing: EXTERNAL_WALL_CLOCK_EXCLUDES_JUDGE. p50=NOT MEASUREDms; p90=NOT MEASUREDms; p95=NOT MEASUREDms; max=NOT MEASUREDms. Judge timing is separate.
Calls: 0; average/turn=NOT MEASURED; average/scenario=NOT MEASURED; max/turn=0; max/scenario=0.
First-pass=NOT MEASURED%; repair=NOT MEASURED% (0); fallback=NOT MEASURED% (0).

## Top systemic failure clusters (hypotheses, no fixes)



## Representative review sample



## Measurement boundaries

- Runtime help ladder 0–4 versus canonical protocol 0–6: informational, no automatic failure.
- Offline scripted responses measure structure, not model language quality.
- Fallback observation uses equality with current safeResponse fields; policy self-check overrides are included.
- Fake DB is not an RLS/SQL benchmark; existing local SQL tests remain separate.
- Counts are logical LLMProvider.generate calls; adapter-internal fallback HTTP requests are not separately observed.
- No infrastructure retries by default; semantic answers never retried outside runtime critic.


A/B comparison: NOT_RUN. Candidate B not measured
