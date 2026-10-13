-- Additive compact lesson state; existing ownership RLS/grants remain in force.
alter table public.study_sessions
 add column target_curriculum_unit_id text references public.curriculum_units(id),
 add column target_skill_id text references public.skills(id),
 add column lesson_phase text check (lesson_phase in ('orient','explain','await_attempt','support','retry','verify_independence','clarify','complete')),
 add column lesson_state jsonb;
create index study_sessions_target_unit_idx on public.study_sessions(target_curriculum_unit_id);
create index study_sessions_target_skill_idx on public.study_sessions(target_skill_id);
alter table public.turn_analytics
 add column request_resolution jsonb,
 add column pedagogy_decision jsonb,
 add column lesson_phase text;
comment on column public.study_sessions.lesson_state is 'Versioned compact pedagogical state. No chat, prompts, profile or evidence history.';
