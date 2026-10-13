-- Sprint 2: additive foundation only. Review/apply separately from application merge.
-- No personal enrollment, assignment, mastery backfill, or legacy data mutation.
begin;

create table public.academic_years (
  id text primary key, label text not null,
  starts_on date not null, ends_on date not null,
  check (ends_on >= starts_on)
);
create table public.curriculum_programs (
  id text primary key, name text not null, country_code text not null,
  standard text not null, version text, active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);
create table public.subjects (
  id text primary key, display_name text not null,
  sort_order integer not null, active boolean not null default true
);
create table public.courses (
  id text primary key, subject_id text not null references public.subjects(id),
  display_name text not null, grade_from integer, grade_to integer,
  sort_order integer not null, active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  unique (id, subject_id),
  check (grade_from is null or grade_from > 0),
  check (grade_to is null or grade_to >= grade_from)
);
create table public.curriculum_program_courses (
  program_id text not null references public.curriculum_programs(id),
  grade integer not null check (grade > 0),
  course_id text not null references public.courses(id),
  classification text not null check (classification in ('federal','regional','school','additional')),
  metadata jsonb not null default '{}'::jsonb,
  primary key (program_id, grade, course_id)
);
create table public.curriculum_units (
  id text primary key,
  program_id text not null references public.curriculum_programs(id),
  course_id text not null references public.courses(id),
  grade integer not null check (grade > 0), parent_id text,
  unit_type text not null, title text not null, order_index integer not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (id, program_id, course_id, grade),
  foreign key (parent_id, program_id, course_id, grade)
    references public.curriculum_units(id, program_id, course_id, grade),
  check (parent_id is null or parent_id <> id)
);
create table public.skills (
  id text primary key, subject_id text not null references public.subjects(id),
  course_id text, title text not null,
  skill_type text not null check (skill_type in
    ('concept','procedure','factual_knowledge','reasoning','interpretation','communication','language','grammar','vocabulary','pronunciation','analysis')),
  description text, grade_from integer, grade_to integer,
  active boolean not null default true, metadata jsonb not null default '{}'::jsonb,
  foreign key (course_id, subject_id) references public.courses(id, subject_id),
  check (grade_from is null or grade_from > 0),
  check (grade_to is null or grade_to >= grade_from)
);
create table public.skill_prerequisites (
  skill_id text not null references public.skills(id),
  prerequisite_skill_id text not null references public.skills(id),
  relation_type text not null default 'prerequisite', priority integer not null default 1,
  primary key (skill_id, prerequisite_skill_id), check (skill_id <> prerequisite_skill_id)
);
create table public.textbook_editions (
  id text primary key, course_id text not null references public.courses(id),
  title text not null, authors jsonb not null default '[]'::jsonb,
  publisher text, publication_year integer, series text, isbn text,
  part_count integer, grade_from integer, grade_to integer,
  metadata jsonb not null default '{}'::jsonb,
  unique (id, course_id), check (part_count is null or part_count > 0),
  check (grade_from is null or grade_from > 0),
  check (grade_to is null or grade_to >= grade_from)
);
create table public.textbook_units (
  id text primary key,
  textbook_edition_id text not null references public.textbook_editions(id),
  parent_id text, unit_type text not null, title text not null,
  part_number integer, order_index integer not null, page_start integer, page_end integer,
  metadata jsonb not null default '{}'::jsonb,
  unique (id, textbook_edition_id),
  foreign key (parent_id, textbook_edition_id) references public.textbook_units(id, textbook_edition_id),
  check (parent_id is null or parent_id <> id),
  check (page_start is null or page_start > 0),
  check (page_end is null or page_end >= page_start)
);
create table public.curriculum_unit_skills (
  curriculum_unit_id text not null references public.curriculum_units(id),
  skill_id text not null references public.skills(id),
  primary key (curriculum_unit_id, skill_id)
);
create table public.textbook_unit_skills (
  textbook_unit_id text not null references public.textbook_units(id),
  skill_id text not null references public.skills(id),
  primary key (textbook_unit_id, skill_id)
);
create table public.student_profiles (
  child_id uuid primary key references public.children(id),
  support_language text not null default 'ru',
  explicit_interests jsonb not null default '[]'::jsonb,
  learning_preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(), child_id uuid not null references public.children(id),
  academic_year_id text not null references public.academic_years(id),
  grade integer not null check (grade > 0),
  curriculum_program_id text not null references public.curriculum_programs(id),
  program_confirmed boolean not null default false,
  status text not null check (status in ('planned','active','completed','cancelled')),
  started_on date not null, ended_on date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, child_id), check (ended_on is null or ended_on >= started_on)
);
create unique index student_enrollments_one_active_year_idx
  on public.student_enrollments(child_id, academic_year_id) where status = 'active';
create table public.student_subject_enrollments (
  enrollment_id uuid not null references public.student_enrollments(id),
  subject_id text not null references public.subjects(id),
  status text not null check (status in ('planned','active','completed','cancelled')),
  created_at timestamptz not null default now(), primary key (enrollment_id, subject_id)
);
create table public.student_textbook_assignments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.student_enrollments(id),
  course_id text not null references public.courses(id), textbook_edition_id text not null,
  role text not null check (role in ('primary','additional','workbook','task_collection','reference')),
  valid_from date not null, valid_to date,
  status text not null check (status in ('planned','active','completed','cancelled')),
  created_at timestamptz not null default now(),
  foreign key (textbook_edition_id, course_id) references public.textbook_editions(id, course_id),
  check (valid_to is null or valid_to >= valid_from)
);
create table public.student_skill_state (
  child_id uuid not null references public.children(id), skill_id text not null references public.skills(id),
  status text not null default 'not_seen' check (status in
    ('not_seen','introduced','learning','nearly_mastered','mastered','needs_review')),
  mastery_score numeric check (mastery_score between 0 and 100),
  confidence numeric not null default 0 check (confidence between 0 and 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  independent_successes integer not null default 0 check (independent_successes >= 0),
  hinted_successes integer not null default 0 check (hinted_successes >= 0),
  failures integer not null default 0 check (failures >= 0),
  last_seen_at timestamptz, last_independent_success_at timestamptz,
  trend text not null default 'unknown', next_review_at timestamptz,
  updated_at timestamptz not null default now(), primary key (child_id, skill_id)
);
create table public.student_skill_evidence (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id), skill_id text not null references public.skills(id),
  session_id uuid references public.study_sessions(id), evidence_type text not null,
  correctness text not null check (correctness in ('correct','incorrect','partial','unknown')),
  support_stage integer check (support_stage between 0 and 4),
  stt_confidence numeric check (stt_confidence between 0 and 1),
  analyzer_confidence numeric check (analyzer_confidence between 0 and 1),
  weight numeric check (weight >= 0), metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.session_skills (
  session_id uuid not null references public.study_sessions(id), skill_id text not null references public.skills(id),
  role text not null check (role in ('target','prerequisite','detected')),
  created_at timestamptz not null default now(), primary key (session_id, skill_id, role)
);
create table public.academic_transition_snapshots (
  id uuid primary key default gen_random_uuid(), child_id uuid not null references public.children(id),
  from_enrollment_id uuid not null, to_enrollment_id uuid not null,
  snapshot jsonb not null, created_at timestamptz not null default now(),
  foreign key (from_enrollment_id, child_id) references public.student_enrollments(id, child_id),
  foreign key (to_enrollment_id, child_id) references public.student_enrollments(id, child_id),
  check (from_enrollment_id <> to_enrollment_id)
);

-- Nullable only: legacy rows remain valid; no topic-to-skill conversion.
alter table public.study_sessions add column course_id text references public.courses(id);
alter table public.turn_analytics
  add column course_id text references public.courses(id),
  add column skill_id text references public.skills(id),
  add column stt_confidence numeric check (stt_confidence between 0 and 1);
alter table public.learning_method_events
  add column course_id text references public.courses(id),
  add column skill_id text references public.skills(id);
alter table public.learning_observations
  add column course_id text references public.courses(id),
  add column skill_id text references public.skills(id);
create index courses_lifecycle_fk_1_idx on public.courses(subject_id);
create index curriculum_program_courses_lifecycle_fk_1_idx on public.curriculum_program_courses(course_id);
create index curriculum_units_lifecycle_fk_1_idx on public.curriculum_units(program_id);
create index curriculum_units_lifecycle_fk_2_idx on public.curriculum_units(course_id);
create index curriculum_units_lifecycle_fk_3_idx on public.curriculum_units(parent_id, program_id, course_id, grade);
create index skills_lifecycle_fk_1_idx on public.skills(subject_id);
create index skills_lifecycle_fk_2_idx on public.skills(course_id, subject_id);
create index skill_prerequisites_lifecycle_fk_1_idx on public.skill_prerequisites(prerequisite_skill_id);
create index curriculum_unit_skills_lifecycle_fk_1_idx on public.curriculum_unit_skills(skill_id);
create index textbook_unit_skills_lifecycle_fk_1_idx on public.textbook_unit_skills(skill_id);
create index textbook_editions_lifecycle_fk_1_idx on public.textbook_editions(course_id);
create index textbook_units_lifecycle_fk_1_idx on public.textbook_units(textbook_edition_id);
create index textbook_units_lifecycle_fk_2_idx on public.textbook_units(parent_id, textbook_edition_id);
create index student_enrollments_lifecycle_fk_1_idx on public.student_enrollments(child_id);
create index student_enrollments_lifecycle_fk_2_idx on public.student_enrollments(academic_year_id);
create index student_enrollments_lifecycle_fk_3_idx on public.student_enrollments(curriculum_program_id);
create index student_subject_enrollments_lifecycle_fk_1_idx on public.student_subject_enrollments(subject_id);
create index student_textbook_assignments_lifecycle_fk_1_idx on public.student_textbook_assignments(enrollment_id, course_id, status);
create index student_textbook_assignments_lifecycle_fk_2_idx on public.student_textbook_assignments(course_id);
create index student_textbook_assignments_lifecycle_fk_3_idx on public.student_textbook_assignments(textbook_edition_id, course_id);
create index student_skill_state_lifecycle_fk_1_idx on public.student_skill_state(skill_id);
create index student_skill_evidence_lifecycle_fk_1_idx on public.student_skill_evidence(child_id, skill_id, created_at);
create index student_skill_evidence_lifecycle_fk_2_idx on public.student_skill_evidence(skill_id);
create index student_skill_evidence_lifecycle_fk_3_idx on public.student_skill_evidence(session_id);
create index session_skills_lifecycle_fk_1_idx on public.session_skills(skill_id);
create index academic_transition_snapshots_lifecycle_fk_1_idx on public.academic_transition_snapshots(child_id);
create index academic_transition_snapshots_lifecycle_fk_2_idx on public.academic_transition_snapshots(from_enrollment_id, child_id);
create index academic_transition_snapshots_lifecycle_fk_3_idx on public.academic_transition_snapshots(to_enrollment_id, child_id);
create index study_sessions_lifecycle_fk_1_idx on public.study_sessions(course_id);
create index turn_analytics_lifecycle_fk_1_idx on public.turn_analytics(course_id);
create index turn_analytics_lifecycle_fk_2_idx on public.turn_analytics(skill_id);
create index learning_method_events_lifecycle_fk_1_idx on public.learning_method_events(course_id);
create index learning_method_events_lifecycle_fk_2_idx on public.learning_method_events(skill_id);
create index learning_observations_lifecycle_fk_1_idx on public.learning_observations(course_id);
create index learning_observations_lifecycle_fk_2_idx on public.learning_observations(skill_id);

alter table public.academic_years enable row level security;
revoke all on public.academic_years from anon, authenticated;
grant select on public.academic_years to authenticated;
create policy catalog_read on public.academic_years for select to authenticated using (true);

alter table public.curriculum_programs enable row level security;
revoke all on public.curriculum_programs from anon, authenticated;
grant select on public.curriculum_programs to authenticated;
create policy catalog_read on public.curriculum_programs for select to authenticated using (true);

alter table public.subjects enable row level security;
revoke all on public.subjects from anon, authenticated;
grant select on public.subjects to authenticated;
create policy catalog_read on public.subjects for select to authenticated using (true);

alter table public.courses enable row level security;
revoke all on public.courses from anon, authenticated;
grant select on public.courses to authenticated;
create policy catalog_read on public.courses for select to authenticated using (true);

alter table public.curriculum_program_courses enable row level security;
revoke all on public.curriculum_program_courses from anon, authenticated;
grant select on public.curriculum_program_courses to authenticated;
create policy catalog_read on public.curriculum_program_courses for select to authenticated using (true);

alter table public.curriculum_units enable row level security;
revoke all on public.curriculum_units from anon, authenticated;
grant select on public.curriculum_units to authenticated;
create policy catalog_read on public.curriculum_units for select to authenticated using (true);

alter table public.skills enable row level security;
revoke all on public.skills from anon, authenticated;
grant select on public.skills to authenticated;
create policy catalog_read on public.skills for select to authenticated using (true);

alter table public.skill_prerequisites enable row level security;
revoke all on public.skill_prerequisites from anon, authenticated;
grant select on public.skill_prerequisites to authenticated;
create policy catalog_read on public.skill_prerequisites for select to authenticated using (true);

alter table public.textbook_editions enable row level security;
revoke all on public.textbook_editions from anon, authenticated;
grant select on public.textbook_editions to authenticated;
create policy catalog_read on public.textbook_editions for select to authenticated using (true);

alter table public.textbook_units enable row level security;
revoke all on public.textbook_units from anon, authenticated;
grant select on public.textbook_units to authenticated;
create policy catalog_read on public.textbook_units for select to authenticated using (true);

alter table public.curriculum_unit_skills enable row level security;
revoke all on public.curriculum_unit_skills from anon, authenticated;
grant select on public.curriculum_unit_skills to authenticated;
create policy catalog_read on public.curriculum_unit_skills for select to authenticated using (true);

alter table public.textbook_unit_skills enable row level security;
revoke all on public.textbook_unit_skills from anon, authenticated;
grant select on public.textbook_unit_skills to authenticated;
create policy catalog_read on public.textbook_unit_skills for select to authenticated using (true);

alter table public.student_profiles enable row level security;
revoke all on public.student_profiles from anon, authenticated;
grant select, insert, update on public.student_profiles to authenticated;
create policy parent_read on public.student_profiles for select to authenticated using (exists (select 1 from public.children c where c.id = student_profiles.child_id and c.parent_id = (select auth.uid())));
create policy parent_insert on public.student_profiles for insert to authenticated with check (exists (select 1 from public.children c where c.id = student_profiles.child_id and c.parent_id = (select auth.uid())));
create policy parent_update on public.student_profiles for update to authenticated using (exists (select 1 from public.children c where c.id = student_profiles.child_id and c.parent_id = (select auth.uid()))) with check (exists (select 1 from public.children c where c.id = student_profiles.child_id and c.parent_id = (select auth.uid())));

alter table public.student_enrollments enable row level security;
revoke all on public.student_enrollments from anon, authenticated;
grant select, insert, update on public.student_enrollments to authenticated;
create policy parent_read on public.student_enrollments for select to authenticated using (exists (select 1 from public.children c where c.id = student_enrollments.child_id and c.parent_id = (select auth.uid())));
create policy parent_insert on public.student_enrollments for insert to authenticated with check (exists (select 1 from public.children c where c.id = student_enrollments.child_id and c.parent_id = (select auth.uid())));
create policy parent_update on public.student_enrollments for update to authenticated using (exists (select 1 from public.children c where c.id = student_enrollments.child_id and c.parent_id = (select auth.uid()))) with check (exists (select 1 from public.children c where c.id = student_enrollments.child_id and c.parent_id = (select auth.uid())));

alter table public.student_subject_enrollments enable row level security;
revoke all on public.student_subject_enrollments from anon, authenticated;
grant select, insert, update on public.student_subject_enrollments to authenticated;
create policy parent_read on public.student_subject_enrollments for select to authenticated using (exists (select 1 from public.student_enrollments e join public.children c on c.id = e.child_id where e.id = student_subject_enrollments.enrollment_id and c.parent_id = (select auth.uid())));
create policy parent_insert on public.student_subject_enrollments for insert to authenticated with check (exists (select 1 from public.student_enrollments e join public.children c on c.id = e.child_id where e.id = student_subject_enrollments.enrollment_id and c.parent_id = (select auth.uid())));
create policy parent_update on public.student_subject_enrollments for update to authenticated using (exists (select 1 from public.student_enrollments e join public.children c on c.id = e.child_id where e.id = student_subject_enrollments.enrollment_id and c.parent_id = (select auth.uid()))) with check (exists (select 1 from public.student_enrollments e join public.children c on c.id = e.child_id where e.id = student_subject_enrollments.enrollment_id and c.parent_id = (select auth.uid())));

alter table public.student_textbook_assignments enable row level security;
revoke all on public.student_textbook_assignments from anon, authenticated;
grant select, insert, update on public.student_textbook_assignments to authenticated;
create policy parent_read on public.student_textbook_assignments for select to authenticated using (exists (select 1 from public.student_enrollments e join public.children c on c.id = e.child_id where e.id = student_textbook_assignments.enrollment_id and c.parent_id = (select auth.uid())));
create policy parent_insert on public.student_textbook_assignments for insert to authenticated with check (exists (select 1 from public.student_enrollments e join public.children c on c.id = e.child_id where e.id = student_textbook_assignments.enrollment_id and c.parent_id = (select auth.uid())));
create policy parent_update on public.student_textbook_assignments for update to authenticated using (exists (select 1 from public.student_enrollments e join public.children c on c.id = e.child_id where e.id = student_textbook_assignments.enrollment_id and c.parent_id = (select auth.uid()))) with check (exists (select 1 from public.student_enrollments e join public.children c on c.id = e.child_id where e.id = student_textbook_assignments.enrollment_id and c.parent_id = (select auth.uid())));

alter table public.student_skill_state enable row level security;
revoke all on public.student_skill_state from anon, authenticated;
-- Read-only foundation: future evidence/mastery engine owns writes.
grant select on public.student_skill_state to authenticated;
create policy parent_read on public.student_skill_state for select to authenticated using (exists (select 1 from public.children c where c.id = student_skill_state.child_id and c.parent_id = (select auth.uid())));

alter table public.student_skill_evidence enable row level security;
revoke all on public.student_skill_evidence from anon, authenticated;
-- Read-only foundation: future evidence/mastery engine owns writes.
grant select on public.student_skill_evidence to authenticated;
create policy parent_read on public.student_skill_evidence for select to authenticated using (exists (select 1 from public.children c where c.id = student_skill_evidence.child_id and c.parent_id = (select auth.uid())) and (session_id is null or exists (select 1 from public.study_sessions s where s.id = student_skill_evidence.session_id and s.child_id = student_skill_evidence.child_id)));

alter table public.session_skills enable row level security;
revoke all on public.session_skills from anon, authenticated;
grant select, insert on public.session_skills to authenticated;
create policy parent_read on public.session_skills for select to authenticated using (exists (select 1 from public.study_sessions s join public.children c on c.id = s.child_id where s.id = session_skills.session_id and c.parent_id = (select auth.uid())));
create policy parent_insert on public.session_skills for insert to authenticated with check (exists (select 1 from public.study_sessions s join public.children c on c.id = s.child_id where s.id = session_skills.session_id and c.parent_id = (select auth.uid())));

alter table public.academic_transition_snapshots enable row level security;
revoke all on public.academic_transition_snapshots from anon, authenticated;
grant select, insert on public.academic_transition_snapshots to authenticated;
create policy parent_read on public.academic_transition_snapshots for select to authenticated using (exists (select 1 from public.children c where c.id = academic_transition_snapshots.child_id and c.parent_id = (select auth.uid())));
create policy parent_insert on public.academic_transition_snapshots for insert to authenticated with check (exists (select 1 from public.children c where c.id = academic_transition_snapshots.child_id and c.parent_id = (select auth.uid())));

-- Atomic academic transition; invoker permissions and existing ownership RLS apply.
create function public.transition_student_enrollment(
  p_from_enrollment_id uuid, p_academic_year_id text, p_grade integer,
  p_curriculum_program_id text, p_started_on date
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  previous public.student_enrollments%rowtype;
  next_id uuid;
begin
  select * into strict previous from public.student_enrollments
    where id = p_from_enrollment_id and status = 'active' for update;
  if p_started_on <= previous.started_on or p_academic_year_id = previous.academic_year_id then
    raise exception 'Invalid academic transition';
  end if;
  update public.student_enrollments set status = 'completed', ended_on = p_started_on - 1,
    updated_at = now() where id = previous.id;
  insert into public.student_enrollments
    (child_id, academic_year_id, grade, curriculum_program_id, program_confirmed, status, started_on)
    values (previous.child_id, p_academic_year_id, p_grade, p_curriculum_program_id, false, 'active', p_started_on)
    returning id into next_id;
  insert into public.academic_transition_snapshots (child_id, from_enrollment_id, to_enrollment_id, snapshot)
    values (previous.child_id, previous.id, next_id,
      jsonb_build_object('from_grade', previous.grade, 'to_grade', p_grade,
        'skill_state_count', (select count(*) from public.student_skill_state where child_id = previous.child_id)));
  -- No writes to children.grade, skill state, sessions, rules, evidence, or analytics.
  return next_id;
end;
$$;
revoke all on function public.transition_student_enrollment(uuid,text,integer,text,date) from public, anon;
grant execute on function public.transition_student_enrollment(uuid,text,integer,text,date) to authenticated;

-- Replace exactly one assignment; other simultaneous books and permanent skills remain untouched.
create function public.replace_student_textbook(
  p_assignment_id uuid, p_textbook_edition_id text, p_valid_from date
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  previous public.student_textbook_assignments%rowtype;
  next_id uuid;
begin
  select * into strict previous from public.student_textbook_assignments
    where id = p_assignment_id and status = 'active' and valid_to is null for update;
  if p_valid_from <= previous.valid_from then raise exception 'Invalid textbook interval'; end if;
  update public.student_textbook_assignments set valid_to = p_valid_from - 1, status = 'completed'
    where id = previous.id;
  insert into public.student_textbook_assignments
    (enrollment_id, course_id, textbook_edition_id, role, valid_from, status)
    values (previous.enrollment_id, previous.course_id, p_textbook_edition_id, previous.role, p_valid_from, 'active')
    returning id into next_id;
  return next_id;
end;
$$;
revoke all on function public.replace_student_textbook(uuid,text,date) from public, anon;
grant execute on function public.replace_student_textbook(uuid,text,date) to authenticated;

-- Protect future catalog prerequisites from cycles as well as self-edges.
create function public.check_skill_prerequisite_cycle()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if exists (
    with recursive dependencies(id) as (
      select new.prerequisite_skill_id
      union
      select p.prerequisite_skill_id from public.skill_prerequisites p
        join dependencies d on p.skill_id = d.id
        where (p.skill_id, p.prerequisite_skill_id) <> (new.skill_id, new.prerequisite_skill_id)
    ) select 1 from dependencies where id = new.skill_id
  ) then raise exception 'Cyclic skill prerequisite'; end if;
  return new;
end;
$$;
revoke all on function public.check_skill_prerequisite_cycle() from public, anon, authenticated;
create trigger skill_prerequisite_cycle_guard before insert or update on public.skill_prerequisites
  for each row execute function public.check_skill_prerequisite_cycle();

insert into public.academic_years (id, label, starts_on, ends_on) values
  ('2026-27', '2026/27', '2026-09-01', '2027-08-31')
on conflict do nothing;

insert into public.curriculum_programs (id, name, country_code, standard, version, active, metadata) values
  ('ru.fgos_ooo.base', 'Базовый профиль ФГОС ООО', 'RU', 'ФГОС ООО', null, true, '{"default_profile": true, "school_program_confirmed": false}'::jsonb)
on conflict do nothing;

insert into public.subjects (id, display_name, sort_order, active) values
  ('math', 'Математика', 1, true),
  ('russian', 'Русский язык', 2, true),
  ('english', 'Английский язык', 3, true),
  ('literature', 'Литература', 4, true),
  ('physics', 'Физика', 5, true),
  ('biology', 'Биология', 6, true),
  ('geography', 'География', 7, true),
  ('history', 'История', 8, true),
  ('informatics', 'Информатика', 9, true)
on conflict do nothing;

insert into public.courses (id, subject_id, display_name, grade_from, grade_to, sort_order, active, metadata) values
  ('math.algebra', 'math', 'Алгебра', null, null, 1, true, '{}'::jsonb),
  ('math.geometry', 'math', 'Геометрия', null, null, 2, true, '{}'::jsonb),
  ('math.probability_statistics', 'math', 'Вероятность и статистика', null, null, 3, true, '{}'::jsonb),
  ('russian.language', 'russian', 'Русский язык', null, null, 4, true, '{}'::jsonb),
  ('english.language', 'english', 'Английский язык', null, null, 5, true, '{}'::jsonb),
  ('literature.general', 'literature', 'Литература', null, null, 6, true, '{}'::jsonb),
  ('physics.general', 'physics', 'Физика', null, null, 7, true, '{}'::jsonb),
  ('biology.general', 'biology', 'Биология', null, null, 8, true, '{}'::jsonb),
  ('geography.general', 'geography', 'География', null, null, 9, true, '{}'::jsonb),
  ('history.russia', 'history', 'История России', null, null, 10, true, '{}'::jsonb),
  ('history.world', 'history', 'Всеобщая история', null, null, 11, true, '{}'::jsonb),
  ('history.moscow_region', 'history', 'История Московской области', null, null, 12, true, '{}'::jsonb),
  ('informatics.general', 'informatics', 'Информатика', null, null, 13, true, '{}'::jsonb)
on conflict do nothing;

insert into public.curriculum_program_courses (program_id, grade, course_id, classification, metadata) values
  ('ru.fgos_ooo.base', 7, 'math.algebra', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'math.geometry', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'math.probability_statistics', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'russian.language', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'english.language', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'literature.general', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'physics.general', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'biology.general', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'geography.general', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'history.russia', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'history.world', 'federal', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'history.moscow_region', 'regional', '{"default_profile": true}'::jsonb),
  ('ru.fgos_ooo.base', 7, 'informatics.general', 'federal', '{"default_profile": true}'::jsonb)
on conflict do nothing;

insert into public.curriculum_units (id, program_id, course_id, grade, parent_id, unit_type, title, order_index, metadata) values
  ('ru.fgos_ooo.base.math.algebra.7.unit1', 'ru.fgos_ooo.base', 'math.algebra', 7, null, 'unit', 'Выражения, тождества, уравнения', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.algebra.7.unit2', 'ru.fgos_ooo.base', 'math.algebra', 7, null, 'unit', 'Функции и их графики', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.algebra.7.unit3', 'ru.fgos_ooo.base', 'math.algebra', 7, null, 'unit', 'Степень с натуральным показателем', 3, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.algebra.7.unit4', 'ru.fgos_ooo.base', 'math.algebra', 7, null, 'unit', 'Многочлены', 4, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.algebra.7.unit5', 'ru.fgos_ooo.base', 'math.algebra', 7, null, 'unit', 'Формулы сокращённого умножения', 5, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.algebra.7.unit6', 'ru.fgos_ooo.base', 'math.algebra', 7, null, 'unit', 'Системы линейных уравнений', 6, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.geometry.7.unit1', 'ru.fgos_ooo.base', 'math.geometry', 7, null, 'unit', 'Начальные геометрические сведения', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.geometry.7.unit2', 'ru.fgos_ooo.base', 'math.geometry', 7, null, 'unit', 'Треугольники', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.geometry.7.unit3', 'ru.fgos_ooo.base', 'math.geometry', 7, null, 'unit', 'Параллельные прямые', 3, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.geometry.7.unit4', 'ru.fgos_ooo.base', 'math.geometry', 7, null, 'unit', 'Соотношения между сторонами и углами треугольника', 4, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit1', 'ru.fgos_ooo.base', 'math.probability_statistics', 7, null, 'unit', 'Представление данных', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit2', 'ru.fgos_ooo.base', 'math.probability_statistics', 7, null, 'unit', 'Описательная статистика', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit3', 'ru.fgos_ooo.base', 'math.probability_statistics', 7, null, 'unit', 'Случайная изменчивость', 3, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit4', 'ru.fgos_ooo.base', 'math.probability_statistics', 7, null, 'unit', 'Графы', 4, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit5', 'ru.fgos_ooo.base', 'math.probability_statistics', 7, null, 'unit', 'Логические утверждения и высказывания', 5, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit6', 'ru.fgos_ooo.base', 'math.probability_statistics', 7, null, 'unit', 'Случайные опыты и случайные события', 6, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit7', 'ru.fgos_ooo.base', 'math.probability_statistics', 7, null, 'unit', 'Множества', 7, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit8', 'ru.fgos_ooo.base', 'math.probability_statistics', 7, null, 'unit', 'Математическое описание случайных явлений', 8, '{}'::jsonb),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit9', 'ru.fgos_ooo.base', 'math.probability_statistics', 7, null, 'unit', 'Рассеивание данных', 9, '{}'::jsonb),
  ('ru.fgos_ooo.base.russian.language.7.unit1', 'ru.fgos_ooo.base', 'russian.language', 7, null, 'unit', 'Общие сведения о языке', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.russian.language.7.unit2', 'ru.fgos_ooo.base', 'russian.language', 7, null, 'unit', 'Причастие', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.russian.language.7.unit3', 'ru.fgos_ooo.base', 'russian.language', 7, null, 'unit', 'Деепричастие', 3, '{}'::jsonb),
  ('ru.fgos_ooo.base.russian.language.7.unit4', 'ru.fgos_ooo.base', 'russian.language', 7, null, 'unit', 'Наречие', 4, '{}'::jsonb),
  ('ru.fgos_ooo.base.russian.language.7.unit5', 'ru.fgos_ooo.base', 'russian.language', 7, null, 'unit', 'Предлог', 5, '{}'::jsonb),
  ('ru.fgos_ooo.base.russian.language.7.unit6', 'ru.fgos_ooo.base', 'russian.language', 7, null, 'unit', 'Союз', 6, '{}'::jsonb),
  ('ru.fgos_ooo.base.russian.language.7.unit7', 'ru.fgos_ooo.base', 'russian.language', 7, null, 'unit', 'Частица', 7, '{}'::jsonb),
  ('ru.fgos_ooo.base.russian.language.7.unit8', 'ru.fgos_ooo.base', 'russian.language', 7, null, 'unit', 'Междометие', 8, '{}'::jsonb),
  ('ru.fgos_ooo.base.russian.language.7.unit9', 'ru.fgos_ooo.base', 'russian.language', 7, null, 'unit', 'Повторение и систематизация', 9, '{}'::jsonb),
  ('ru.fgos_ooo.base.literature.general.7.unit1', 'ru.fgos_ooo.base', 'literature.general', 7, null, 'unit', 'Древнерусская литература', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.literature.general.7.unit2', 'ru.fgos_ooo.base', 'literature.general', 7, null, 'unit', 'Литература первой половины XIX века', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.literature.general.7.unit3', 'ru.fgos_ooo.base', 'literature.general', 7, null, 'unit', 'Литература второй половины XIX века', 3, '{}'::jsonb),
  ('ru.fgos_ooo.base.literature.general.7.unit4', 'ru.fgos_ooo.base', 'literature.general', 7, null, 'unit', 'Литература конца XIX — начала XX века', 4, '{}'::jsonb),
  ('ru.fgos_ooo.base.literature.general.7.unit5', 'ru.fgos_ooo.base', 'literature.general', 7, null, 'unit', 'Сатирические произведения отечественной и зарубежной литературы', 5, '{}'::jsonb),
  ('ru.fgos_ooo.base.literature.general.7.unit6', 'ru.fgos_ooo.base', 'literature.general', 7, null, 'unit', 'Литература первой половины XX века', 6, '{}'::jsonb),
  ('ru.fgos_ooo.base.literature.general.7.unit7', 'ru.fgos_ooo.base', 'literature.general', 7, null, 'unit', 'Зарубежная литература', 7, '{}'::jsonb),
  ('ru.fgos_ooo.base.physics.general.7.unit1', 'ru.fgos_ooo.base', 'physics.general', 7, null, 'unit', 'Физика и её роль в познании окружающего мира', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.physics.general.7.unit2', 'ru.fgos_ooo.base', 'physics.general', 7, null, 'unit', 'Первоначальные сведения о строении вещества', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.physics.general.7.unit3', 'ru.fgos_ooo.base', 'physics.general', 7, null, 'unit', 'Взаимодействие тел', 3, '{}'::jsonb),
  ('ru.fgos_ooo.base.physics.general.7.unit4', 'ru.fgos_ooo.base', 'physics.general', 7, null, 'unit', 'Давление твёрдых тел, жидкостей и газов', 4, '{}'::jsonb),
  ('ru.fgos_ooo.base.physics.general.7.unit5', 'ru.fgos_ooo.base', 'physics.general', 7, null, 'unit', 'Работа и мощность. Энергия', 5, '{}'::jsonb),
  ('ru.fgos_ooo.base.biology.general.7.unit1', 'ru.fgos_ooo.base', 'biology.general', 7, null, 'unit', 'Многообразие растительного мира', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.biology.general.7.unit2', 'ru.fgos_ooo.base', 'biology.general', 7, null, 'unit', 'Классификация покрытосеменных растений', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.biology.general.7.unit3', 'ru.fgos_ooo.base', 'biology.general', 7, null, 'unit', 'Растения и среда обитания', 3, '{}'::jsonb),
  ('ru.fgos_ooo.base.biology.general.7.unit4', 'ru.fgos_ooo.base', 'biology.general', 7, null, 'unit', 'Бактерии', 4, '{}'::jsonb),
  ('ru.fgos_ooo.base.biology.general.7.unit5', 'ru.fgos_ooo.base', 'biology.general', 7, null, 'unit', 'Грибы', 5, '{}'::jsonb),
  ('ru.fgos_ooo.base.geography.general.7.unit1', 'ru.fgos_ooo.base', 'geography.general', 7, null, 'unit', 'Введение', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.geography.general.7.unit2', 'ru.fgos_ooo.base', 'geography.general', 7, null, 'unit', 'Человек на Земле', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.geography.general.7.unit3', 'ru.fgos_ooo.base', 'geography.general', 7, null, 'unit', 'Природа Земли', 3, '{}'::jsonb),
  ('ru.fgos_ooo.base.geography.general.7.unit4', 'ru.fgos_ooo.base', 'geography.general', 7, null, 'unit', 'Природные комплексы и регионы', 4, '{}'::jsonb),
  ('ru.fgos_ooo.base.geography.general.7.unit5', 'ru.fgos_ooo.base', 'geography.general', 7, null, 'unit', 'Материки и страны', 5, '{}'::jsonb),
  ('ru.fgos_ooo.base.geography.general.7.unit6', 'ru.fgos_ooo.base', 'geography.general', 7, null, 'unit', 'Глобальные проблемы человечества', 6, '{}'::jsonb),
  ('ru.fgos_ooo.base.informatics.general.7.unit1', 'ru.fgos_ooo.base', 'informatics.general', 7, null, 'unit', 'Информация и информационные процессы', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.informatics.general.7.unit2', 'ru.fgos_ooo.base', 'informatics.general', 7, null, 'unit', 'Компьютер — универсальное устройство обработки данных', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.informatics.general.7.unit3', 'ru.fgos_ooo.base', 'informatics.general', 7, null, 'unit', 'Обработка текстовой информации', 3, '{}'::jsonb),
  ('ru.fgos_ooo.base.informatics.general.7.unit4', 'ru.fgos_ooo.base', 'informatics.general', 7, null, 'unit', 'Обработка графической информации', 4, '{}'::jsonb),
  ('ru.fgos_ooo.base.informatics.general.7.unit5', 'ru.fgos_ooo.base', 'informatics.general', 7, null, 'unit', 'Мультимедиа', 5, '{}'::jsonb),
  ('ru.fgos_ooo.base.history.russia.7.unit1', 'ru.fgos_ooo.base', 'history.russia', 7, null, 'unit', 'Россия в XVI в.', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.history.russia.7.unit2', 'ru.fgos_ooo.base', 'history.russia', 7, null, 'unit', 'Смута в России', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.history.russia.7.unit3', 'ru.fgos_ooo.base', 'history.russia', 7, null, 'unit', 'Россия при первых Романовых', 3, '{}'::jsonb),
  ('ru.fgos_ooo.base.history.moscow_region.7.unit1', 'ru.fgos_ooo.base', 'history.moscow_region', 7, null, 'unit', 'Московская область в Новейшее время', 1, '{}'::jsonb),
  ('ru.fgos_ooo.base.history.moscow_region.7.unit2', 'ru.fgos_ooo.base', 'history.moscow_region', 7, null, 'unit', 'От революции к победе в Великой Отечественной войне', 2, '{}'::jsonb),
  ('ru.fgos_ooo.base.history.moscow_region.7.unit3', 'ru.fgos_ooo.base', 'history.moscow_region', 7, null, 'unit', 'Подмосковье во второй половине XX — первой четверти XXI в.', 3, '{}'::jsonb)
on conflict do nothing;

insert into public.skills (id, subject_id, course_id, title, skill_type, description, grade_from, grade_to, active, metadata) values
  ('math.algebra.linear_equation.basic', 'math', 'math.algebra', 'Линейное уравнение', 'procedure', null, null, null, true, '{}'::jsonb),
  ('math.algebra.function.graph_reading', 'math', 'math.algebra', 'Чтение графика функции', 'interpretation', null, null, null, true, '{}'::jsonb),
  ('math.algebra.polynomial.operations', 'math', 'math.algebra', 'Операции с многочленами', 'procedure', null, null, null, true, '{}'::jsonb),
  ('math.algebra.abbreviated_multiplication', 'math', 'math.algebra', 'Формулы сокращённого умножения', 'procedure', null, null, null, true, '{}'::jsonb),
  ('math.algebra.linear_system.two_variables', 'math', 'math.algebra', 'Система линейных уравнений с двумя переменными', 'concept', null, null, null, true, '{}'::jsonb),
  ('math.algebra.linear_system.graphical', 'math', 'math.algebra', 'Графический способ решения системы', 'procedure', null, null, null, true, '{}'::jsonb),
  ('math.algebra.linear_system.substitution', 'math', 'math.algebra', 'Решение системы подстановкой', 'procedure', null, null, null, true, '{}'::jsonb),
  ('math.algebra.linear_system.addition', 'math', 'math.algebra', 'Решение системы сложением', 'procedure', null, null, null, true, '{}'::jsonb),
  ('math.algebra.linear_system.word_problem', 'math', 'math.algebra', 'Модель задачи в виде системы уравнений', 'reasoning', null, null, null, true, '{}'::jsonb),
  ('math.geometry.basic.points_lines_segments', 'math', 'math.geometry', 'Точки, прямые и отрезки', 'concept', null, null, null, true, '{}'::jsonb),
  ('math.geometry.angles', 'math', 'math.geometry', 'Углы', 'concept', null, null, null, true, '{}'::jsonb),
  ('math.geometry.triangle.congruence', 'math', 'math.geometry', 'Равенство треугольников', 'reasoning', null, null, null, true, '{}'::jsonb),
  ('math.geometry.triangle.isosceles', 'math', 'math.geometry', 'Равнобедренный треугольник', 'concept', null, null, null, true, '{}'::jsonb),
  ('math.geometry.parallel_lines', 'math', 'math.geometry', 'Параллельные прямые', 'concept', null, null, null, true, '{}'::jsonb),
  ('math.geometry.triangle.angle_sum', 'math', 'math.geometry', 'Сумма углов треугольника', 'reasoning', null, null, null, true, '{}'::jsonb),
  ('math.statistics.tables_charts', 'math', 'math.probability_statistics', 'Чтение таблиц и диаграмм', 'interpretation', null, null, null, true, '{}'::jsonb),
  ('math.statistics.mean_median_range', 'math', 'math.probability_statistics', 'Среднее, медиана и размах', 'procedure', null, null, null, true, '{}'::jsonb),
  ('math.statistics.data_distribution', 'math', 'math.probability_statistics', 'Распределение данных', 'interpretation', null, null, null, true, '{}'::jsonb),
  ('math.probability.elementary_event', 'math', 'math.probability_statistics', 'Элементарное случайное событие', 'concept', null, null, null, true, '{}'::jsonb),
  ('math.sets.basic_operations', 'math', 'math.probability_statistics', 'Основные операции с множествами', 'procedure', null, null, null, true, '{}'::jsonb),
  ('english.speaking.short_personal_answer', 'english', 'english.language', 'Короткий ответ о себе', 'communication', null, null, null, true, '{}'::jsonb),
  ('english.listening.short_phrase', 'english', 'english.language', 'Понимание короткой фразы на слух', 'language', null, null, null, true, '{}'::jsonb),
  ('english.grammar.past_simple', 'english', 'english.language', 'Past Simple', 'grammar', null, null, null, true, '{}'::jsonb),
  ('english.grammar.gerund_after_like', 'english', 'english.language', 'Герундий после like', 'grammar', null, null, null, true, '{}'::jsonb),
  ('english.reading.comprehension', 'english', 'english.language', 'Понимание прочитанного', 'language', null, null, null, true, '{}'::jsonb),
  ('russian.grammar.participle', 'russian', 'russian.language', 'Причастие', 'grammar', null, null, null, true, '{}'::jsonb),
  ('russian.grammar.participial_phrase', 'russian', 'russian.language', 'Причастный оборот', 'grammar', null, null, null, true, '{}'::jsonb),
  ('russian.grammar.gerund', 'russian', 'russian.language', 'Деепричастие', 'grammar', null, null, null, true, '{}'::jsonb),
  ('russian.grammar.adverb', 'russian', 'russian.language', 'Наречие', 'grammar', null, null, null, true, '{}'::jsonb),
  ('russian.grammar.preposition', 'russian', 'russian.language', 'Предлог', 'grammar', null, null, null, true, '{}'::jsonb),
  ('russian.grammar.conjunction', 'russian', 'russian.language', 'Союз', 'grammar', null, null, null, true, '{}'::jsonb),
  ('russian.grammar.particle', 'russian', 'russian.language', 'Частица', 'grammar', null, null, null, true, '{}'::jsonb),
  ('literature.genre.identification', 'literature', 'literature.general', 'Определение жанра', 'analysis', null, null, null, true, '{}'::jsonb),
  ('literature.character.motivation_analysis', 'literature', 'literature.general', 'Анализ мотивов героя', 'analysis', null, null, null, true, '{}'::jsonb),
  ('literature.text.evidence_for_opinion', 'literature', 'literature.general', 'Подтверждение мнения текстом', 'reasoning', null, null, null, true, '{}'::jsonb),
  ('literature.theme.main_idea', 'literature', 'literature.general', 'Основная мысль произведения', 'interpretation', null, null, null, true, '{}'::jsonb),
  ('history.chronology', 'history', null, 'Хронология', 'factual_knowledge', null, null, null, true, '{}'::jsonb),
  ('history.cause_effect', 'history', null, 'Причины и следствия исторических событий', 'reasoning', null, null, null, true, '{}'::jsonb),
  ('history.source_analysis', 'history', null, 'Анализ исторического источника', 'analysis', null, null, null, true, '{}'::jsonb),
  ('history.compare_processes', 'history', null, 'Сравнение исторических процессов', 'analysis', null, null, null, true, '{}'::jsonb),
  ('physics.measurement.physical_quantities', 'physics', 'physics.general', 'Измерение физических величин', 'procedure', null, null, null, true, '{}'::jsonb),
  ('physics.motion.speed', 'physics', 'physics.general', 'Скорость движения', 'procedure', null, null, null, true, '{}'::jsonb),
  ('physics.matter.density', 'physics', 'physics.general', 'Плотность вещества', 'concept', null, null, null, true, '{}'::jsonb),
  ('physics.mechanics.inertia', 'physics', 'physics.general', 'Инерция', 'concept', null, null, null, true, '{}'::jsonb),
  ('physics.pressure.basic', 'physics', 'physics.general', 'Давление', 'concept', null, null, null, true, '{}'::jsonb),
  ('physics.work_power_energy.basic', 'physics', 'physics.general', 'Работа, мощность и энергия', 'concept', null, null, null, true, '{}'::jsonb),
  ('biology.classification.basic', 'biology', 'biology.general', 'Основы классификации', 'concept', null, null, null, true, '{}'::jsonb),
  ('biology.plants.groups', 'biology', 'biology.general', 'Группы растений', 'factual_knowledge', null, null, null, true, '{}'::jsonb),
  ('biology.ecology.plant_environment', 'biology', 'biology.general', 'Растения и среда обитания', 'reasoning', null, null, null, true, '{}'::jsonb),
  ('biology.bacteria.basic', 'biology', 'biology.general', 'Бактерии', 'factual_knowledge', null, null, null, true, '{}'::jsonb),
  ('biology.fungi.basic', 'biology', 'biology.general', 'Грибы', 'factual_knowledge', null, null, null, true, '{}'::jsonb),
  ('geography.map.reading', 'geography', 'geography.general', 'Чтение карты', 'interpretation', null, null, null, true, '{}'::jsonb),
  ('geography.population.distribution', 'geography', 'geography.general', 'Размещение населения', 'interpretation', null, null, null, true, '{}'::jsonb),
  ('geography.climate.basic', 'geography', 'geography.general', 'Основы климатических закономерностей', 'concept', null, null, null, true, '{}'::jsonb),
  ('geography.world_ocean', 'geography', 'geography.general', 'Мировой океан', 'factual_knowledge', null, null, null, true, '{}'::jsonb),
  ('geography.natural_zones', 'geography', 'geography.general', 'Природные зоны', 'concept', null, null, null, true, '{}'::jsonb),
  ('geography.continent.profile', 'geography', 'geography.general', 'Описание материка', 'analysis', null, null, null, true, '{}'::jsonb),
  ('informatics.information.processes', 'informatics', 'informatics.general', 'Информационные процессы', 'concept', null, null, null, true, '{}'::jsonb),
  ('informatics.data.representation', 'informatics', 'informatics.general', 'Представление данных', 'concept', null, null, null, true, '{}'::jsonb),
  ('informatics.files.basic', 'informatics', 'informatics.general', 'Работа с файлами', 'procedure', null, null, null, true, '{}'::jsonb),
  ('informatics.text.processing', 'informatics', 'informatics.general', 'Обработка текстовой информации', 'procedure', null, null, null, true, '{}'::jsonb),
  ('informatics.graphics.basic', 'informatics', 'informatics.general', 'Обработка графической информации', 'procedure', null, null, null, true, '{}'::jsonb),
  ('informatics.presentation.basic', 'informatics', 'informatics.general', 'Основы презентаций', 'procedure', null, null, null, true, '{}'::jsonb)
on conflict do nothing;

insert into public.skill_prerequisites (skill_id, prerequisite_skill_id, relation_type, priority) values
  ('math.algebra.linear_system.substitution', 'math.algebra.linear_equation.basic', 'prerequisite', 1),
  ('math.algebra.linear_system.addition', 'math.algebra.linear_equation.basic', 'prerequisite', 1),
  ('math.algebra.linear_system.graphical', 'math.algebra.function.graph_reading', 'prerequisite', 1),
  ('math.geometry.triangle.angle_sum', 'math.geometry.angles', 'prerequisite', 1),
  ('russian.grammar.participial_phrase', 'russian.grammar.participle', 'prerequisite', 1)
on conflict do nothing;

insert into public.textbook_editions (id, course_id, title, authors, publisher, publication_year, series, isbn, part_count, grade_from, grade_to, metadata) values
  ('tb.math.algebra.makarychev.7.2023', 'math.algebra', 'Математика. Алгебра. 7 класс. Базовый уровень', '["Ю. Н. Макарычев", "Н. Г. Миндюк", "К. И. Нешков", "С. Б. Суворова"]'::jsonb, 'Просвещение', 2023, null, '978-5-09-102535-4', null, 7, 7, '{"editor": ["С. А. Теляковский"]}'::jsonb),
  ('tb.math.geometry.atanasyan.7_9.2025', 'math.geometry', 'Математика. Геометрия. 7–9 классы. Базовый уровень', '["Л. С. Атанасян", "В. Ф. Бутузов", "С. Б. Кадомцев", "Э. Г. Позняк", "И. И. Юдина"]'::jsonb, 'Просвещение', 2025, null, '978-5-09-120158-1', null, 7, 9, '{}'::jsonb),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024', 'math.probability_statistics', 'Математика. Вероятность и статистика. 7–9 классы. Базовый уровень', '["И. Р. Высоцкий", "И. В. Ященко"]'::jsonb, 'Просвещение', 2024, null, '978-5-09-112141-4', 2, 7, 9, '{"part_isbns":{"1":"978-5-09-112142-1"}}'::jsonb),
  ('tb.russian.baranov_ladyzhenskaya.7.2023', 'russian.language', 'Русский язык. 7 класс', '["М. Т. Баранов", "Т. А. Ладыженская", "Л. А. Тростенцова", "Н. В. Ладыженская", "О. М. Александрова", "А. Д. Дейкина", "Л. Г. Антонова", "Л. Т. Григорян", "И. И. Кулибаба"]'::jsonb, 'Просвещение', 2023, null, '978-5-09-100134-1', 2, 7, 7, '{"part_isbns":{"1":"978-5-09-100135-8","2":"978-5-09-100136-5"}}'::jsonb),
  ('tb.literature.korovina.7.2024', 'literature.general', 'Литература. 7 класс', '["В. Я. Коровина", "В. П. Журавлёв", "В. И. Коровин"]'::jsonb, 'Просвещение', 2024, null, '978-5-09-110801-9', 2, 7, 7, '{"part_isbns":{"1":"978-5-09-110802-6","2":"978-5-09-110803-3"}}'::jsonb),
  ('tb.english.spotlight.7.2025', 'english.language', 'Английский язык. 7 класс', '["Ю. Е. Ваулина", "Дж. Дули", "О. Е. Подоляко", "В. Эванс"]'::jsonb, 'Просвещение / Express Publishing', 2025, 'Английский в фокусе / Spotlight', '978-5-09-119974-1', null, 7, 7, '{}'::jsonb),
  ('tb.physics.peryshkin_ivanov.7.2023', 'physics.general', 'Физика. 7 класс. Базовый уровень', '["И. М. Перышкин", "А. И. Иванов"]'::jsonb, 'Просвещение', 2023, null, '978-5-09-102554-5', null, 7, 7, '{}'::jsonb),
  ('tb.biology.pasechnik.7.2024', 'biology.general', 'Биология. 7 класс. Базовый уровень', '["В. В. Пасечник", "С. В. Суматохин", "З. Г. Гапонюк", "Г. Г. Швецов"]'::jsonb, 'Просвещение', 2024, null, '978-5-09-110810-1', null, 7, 7, '{}'::jsonb),
  ('tb.geography.polyarnaya_zvezda.7.2025', 'geography.general', 'География. 7 класс', '["А. И. Алексеев", "В. В. Николина", "Е. К. Липкина", "С. И. Болысов", "Т. А. Ачкасова", "Г. Ю. Кузнецова"]'::jsonb, 'Просвещение', 2025, 'Полярная звезда', '978-5-09-119970-3', null, 7, 7, '{}'::jsonb),
  ('tb.informatics.bosova.7.2025', 'informatics.general', 'Информатика. 7 класс. Базовый уровень', '["Л. Л. Босова", "А. Ю. Босова"]'::jsonb, 'Просвещение', 2025, null, '978-5-09-121643-1', null, 7, 7, '{}'::jsonb),
  ('tb.history.russia.medinsky_torkunov.7.2025', 'history.russia', 'История. История России. XVI–XVII вв. 7 класс', '["В. Р. Мединский", "А. В. Торкунов"]'::jsonb, 'Просвещение', 2025, null, '978-5-09-123948-5', null, 7, 7, '{}'::jsonb),
  ('tb.history.world.medinsky_chubaryan.7.2025', 'history.world', 'История. Всеобщая история. История Нового времени, конец XV–XVII вв. 7 класс', '["В. Р. Мединский", "А. О. Чубарьян"]'::jsonb, 'Просвещение', 2025, null, '978-5-09-123944-7', null, 7, 7, '{}'::jsonb),
  ('tb.history.moscow_region.sukhov.6_7.2026', 'history.moscow_region', 'История нашего края. Московская область. 6–7 классы', '["В. В. Сухов", "А. С. Клемешов", "Е. Г. Жигирёва", "В. А. Тучин", "А. В. Духанина", "О. Г. Щенина"]'::jsonb, 'Просвещение', 2026, null, '978-5-09-135772-1', null, 6, 7, '{}'::jsonb)
on conflict do nothing;

insert into public.textbook_units (id, textbook_edition_id, parent_id, unit_type, title, part_number, order_index, page_start, page_end, metadata) values
  ('tb.math.algebra.makarychev.7.2023.unit1', 'tb.math.algebra.makarychev.7.2023', null, 'unit', 'Выражения, тождества, уравнения', null, 1, null, null, '{}'::jsonb),
  ('tb.math.algebra.makarychev.7.2023.unit2', 'tb.math.algebra.makarychev.7.2023', null, 'unit', 'Функции и их графики', null, 2, null, null, '{}'::jsonb),
  ('tb.math.algebra.makarychev.7.2023.unit3', 'tb.math.algebra.makarychev.7.2023', null, 'unit', 'Степень с натуральным показателем', null, 3, null, null, '{}'::jsonb),
  ('tb.math.algebra.makarychev.7.2023.unit4', 'tb.math.algebra.makarychev.7.2023', null, 'unit', 'Многочлены', null, 4, null, null, '{}'::jsonb),
  ('tb.math.algebra.makarychev.7.2023.unit5', 'tb.math.algebra.makarychev.7.2023', null, 'unit', 'Формулы сокращённого умножения', null, 5, null, null, '{}'::jsonb),
  ('tb.math.algebra.makarychev.7.2023.unit6', 'tb.math.algebra.makarychev.7.2023', null, 'unit', 'Системы линейных уравнений', null, 6, null, null, '{}'::jsonb),
  ('tb.math.geometry.atanasyan.7_9.2025.unit1', 'tb.math.geometry.atanasyan.7_9.2025', null, 'unit', 'Начальные геометрические сведения', null, 1, null, null, '{}'::jsonb),
  ('tb.math.geometry.atanasyan.7_9.2025.unit2', 'tb.math.geometry.atanasyan.7_9.2025', null, 'unit', 'Треугольники', null, 2, null, null, '{}'::jsonb),
  ('tb.math.geometry.atanasyan.7_9.2025.unit3', 'tb.math.geometry.atanasyan.7_9.2025', null, 'unit', 'Параллельные прямые', null, 3, null, null, '{}'::jsonb),
  ('tb.math.geometry.atanasyan.7_9.2025.unit4', 'tb.math.geometry.atanasyan.7_9.2025', null, 'unit', 'Соотношения между сторонами и углами треугольника', null, 4, null, null, '{}'::jsonb),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit1', 'tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024', null, 'unit', 'Представление данных', null, 1, null, null, '{}'::jsonb),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit2', 'tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024', null, 'unit', 'Описательная статистика', null, 2, null, null, '{}'::jsonb),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit3', 'tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024', null, 'unit', 'Случайная изменчивость', null, 3, null, null, '{}'::jsonb),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit4', 'tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024', null, 'unit', 'Графы', null, 4, null, null, '{}'::jsonb),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit5', 'tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024', null, 'unit', 'Логические утверждения и высказывания', null, 5, null, null, '{}'::jsonb),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit6', 'tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024', null, 'unit', 'Случайные опыты и случайные события', null, 6, null, null, '{}'::jsonb),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit7', 'tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024', null, 'unit', 'Множества', null, 7, null, null, '{}'::jsonb),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit8', 'tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024', null, 'unit', 'Математическое описание случайных явлений', null, 8, null, null, '{}'::jsonb),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit9', 'tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024', null, 'unit', 'Рассеивание данных', null, 9, null, null, '{}'::jsonb),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit1', 'tb.russian.baranov_ladyzhenskaya.7.2023', null, 'unit', 'Общие сведения о языке', null, 1, null, null, '{}'::jsonb),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit2', 'tb.russian.baranov_ladyzhenskaya.7.2023', null, 'unit', 'Причастие', null, 2, null, null, '{}'::jsonb),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit3', 'tb.russian.baranov_ladyzhenskaya.7.2023', null, 'unit', 'Деепричастие', null, 3, null, null, '{}'::jsonb),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit4', 'tb.russian.baranov_ladyzhenskaya.7.2023', null, 'unit', 'Наречие', null, 4, null, null, '{}'::jsonb),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit5', 'tb.russian.baranov_ladyzhenskaya.7.2023', null, 'unit', 'Предлог', null, 5, null, null, '{}'::jsonb),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit6', 'tb.russian.baranov_ladyzhenskaya.7.2023', null, 'unit', 'Союз', null, 6, null, null, '{}'::jsonb),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit7', 'tb.russian.baranov_ladyzhenskaya.7.2023', null, 'unit', 'Частица', null, 7, null, null, '{}'::jsonb),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit8', 'tb.russian.baranov_ladyzhenskaya.7.2023', null, 'unit', 'Междометие', null, 8, null, null, '{}'::jsonb),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit9', 'tb.russian.baranov_ladyzhenskaya.7.2023', null, 'unit', 'Повторение и систематизация', null, 9, null, null, '{}'::jsonb),
  ('tb.literature.korovina.7.2024.unit1', 'tb.literature.korovina.7.2024', null, 'unit', 'Древнерусская литература', null, 1, null, null, '{}'::jsonb),
  ('tb.literature.korovina.7.2024.unit2', 'tb.literature.korovina.7.2024', null, 'unit', 'Литература первой половины XIX века', null, 2, null, null, '{}'::jsonb),
  ('tb.literature.korovina.7.2024.unit3', 'tb.literature.korovina.7.2024', null, 'unit', 'Литература второй половины XIX века', null, 3, null, null, '{}'::jsonb),
  ('tb.literature.korovina.7.2024.unit4', 'tb.literature.korovina.7.2024', null, 'unit', 'Литература конца XIX — начала XX века', null, 4, null, null, '{}'::jsonb),
  ('tb.literature.korovina.7.2024.unit5', 'tb.literature.korovina.7.2024', null, 'unit', 'Сатирические произведения отечественной и зарубежной литературы', null, 5, null, null, '{}'::jsonb),
  ('tb.literature.korovina.7.2024.unit6', 'tb.literature.korovina.7.2024', null, 'unit', 'Литература первой половины XX века', null, 6, null, null, '{}'::jsonb),
  ('tb.literature.korovina.7.2024.unit7', 'tb.literature.korovina.7.2024', null, 'unit', 'Зарубежная литература', null, 7, null, null, '{}'::jsonb),
  ('tb.physics.peryshkin_ivanov.7.2023.unit1', 'tb.physics.peryshkin_ivanov.7.2023', null, 'unit', 'Физика и её роль в познании окружающего мира', null, 1, null, null, '{}'::jsonb),
  ('tb.physics.peryshkin_ivanov.7.2023.unit2', 'tb.physics.peryshkin_ivanov.7.2023', null, 'unit', 'Первоначальные сведения о строении вещества', null, 2, null, null, '{}'::jsonb),
  ('tb.physics.peryshkin_ivanov.7.2023.unit3', 'tb.physics.peryshkin_ivanov.7.2023', null, 'unit', 'Взаимодействие тел', null, 3, null, null, '{}'::jsonb),
  ('tb.physics.peryshkin_ivanov.7.2023.unit4', 'tb.physics.peryshkin_ivanov.7.2023', null, 'unit', 'Давление твёрдых тел, жидкостей и газов', null, 4, null, null, '{}'::jsonb),
  ('tb.physics.peryshkin_ivanov.7.2023.unit5', 'tb.physics.peryshkin_ivanov.7.2023', null, 'unit', 'Работа и мощность. Энергия', null, 5, null, null, '{}'::jsonb),
  ('tb.biology.pasechnik.7.2024.unit1', 'tb.biology.pasechnik.7.2024', null, 'unit', 'Многообразие растительного мира', null, 1, null, null, '{}'::jsonb),
  ('tb.biology.pasechnik.7.2024.unit2', 'tb.biology.pasechnik.7.2024', null, 'unit', 'Классификация покрытосеменных растений', null, 2, null, null, '{}'::jsonb),
  ('tb.biology.pasechnik.7.2024.unit3', 'tb.biology.pasechnik.7.2024', null, 'unit', 'Растения и среда обитания', null, 3, null, null, '{}'::jsonb),
  ('tb.biology.pasechnik.7.2024.unit4', 'tb.biology.pasechnik.7.2024', null, 'unit', 'Бактерии', null, 4, null, null, '{}'::jsonb),
  ('tb.biology.pasechnik.7.2024.unit5', 'tb.biology.pasechnik.7.2024', null, 'unit', 'Грибы', null, 5, null, null, '{}'::jsonb),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit1', 'tb.geography.polyarnaya_zvezda.7.2025', null, 'unit', 'Введение', null, 1, null, null, '{}'::jsonb),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit2', 'tb.geography.polyarnaya_zvezda.7.2025', null, 'unit', 'Человек на Земле', null, 2, null, null, '{}'::jsonb),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit3', 'tb.geography.polyarnaya_zvezda.7.2025', null, 'unit', 'Природа Земли', null, 3, null, null, '{}'::jsonb),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit4', 'tb.geography.polyarnaya_zvezda.7.2025', null, 'unit', 'Природные комплексы и регионы', null, 4, null, null, '{}'::jsonb),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit5', 'tb.geography.polyarnaya_zvezda.7.2025', null, 'unit', 'Материки и страны', null, 5, null, null, '{}'::jsonb),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit6', 'tb.geography.polyarnaya_zvezda.7.2025', null, 'unit', 'Глобальные проблемы человечества', null, 6, null, null, '{}'::jsonb),
  ('tb.informatics.bosova.7.2025.unit1', 'tb.informatics.bosova.7.2025', null, 'unit', 'Информация и информационные процессы', null, 1, null, null, '{}'::jsonb),
  ('tb.informatics.bosova.7.2025.unit2', 'tb.informatics.bosova.7.2025', null, 'unit', 'Компьютер — универсальное устройство обработки данных', null, 2, null, null, '{}'::jsonb),
  ('tb.informatics.bosova.7.2025.unit3', 'tb.informatics.bosova.7.2025', null, 'unit', 'Обработка текстовой информации', null, 3, null, null, '{}'::jsonb),
  ('tb.informatics.bosova.7.2025.unit4', 'tb.informatics.bosova.7.2025', null, 'unit', 'Обработка графической информации', null, 4, null, null, '{}'::jsonb),
  ('tb.informatics.bosova.7.2025.unit5', 'tb.informatics.bosova.7.2025', null, 'unit', 'Мультимедиа', null, 5, null, null, '{}'::jsonb),
  ('tb.history.russia.medinsky_torkunov.7.2025.unit1', 'tb.history.russia.medinsky_torkunov.7.2025', null, 'unit', 'Россия в XVI в.', null, 1, null, null, '{}'::jsonb),
  ('tb.history.russia.medinsky_torkunov.7.2025.unit2', 'tb.history.russia.medinsky_torkunov.7.2025', null, 'unit', 'Смута в России', null, 2, null, null, '{}'::jsonb),
  ('tb.history.russia.medinsky_torkunov.7.2025.unit3', 'tb.history.russia.medinsky_torkunov.7.2025', null, 'unit', 'Россия при первых Романовых', null, 3, null, null, '{}'::jsonb),
  ('tb.history.moscow_region.sukhov.6_7.2026.unit1', 'tb.history.moscow_region.sukhov.6_7.2026', null, 'unit', 'Московская область в Новейшее время', null, 1, null, null, '{}'::jsonb),
  ('tb.history.moscow_region.sukhov.6_7.2026.unit2', 'tb.history.moscow_region.sukhov.6_7.2026', null, 'unit', 'От революции к победе в Великой Отечественной войне', null, 2, null, null, '{}'::jsonb),
  ('tb.history.moscow_region.sukhov.6_7.2026.unit3', 'tb.history.moscow_region.sukhov.6_7.2026', null, 'unit', 'Подмосковье во второй половине XX — первой четверти XXI в.', null, 3, null, null, '{}'::jsonb)
on conflict do nothing;

insert into public.curriculum_unit_skills (curriculum_unit_id, skill_id) values
  ('ru.fgos_ooo.base.math.algebra.7.unit1', 'math.algebra.linear_equation.basic'),
  ('ru.fgos_ooo.base.math.algebra.7.unit2', 'math.algebra.function.graph_reading'),
  ('ru.fgos_ooo.base.math.algebra.7.unit4', 'math.algebra.polynomial.operations'),
  ('ru.fgos_ooo.base.math.algebra.7.unit5', 'math.algebra.abbreviated_multiplication'),
  ('ru.fgos_ooo.base.math.algebra.7.unit6', 'math.algebra.linear_system.two_variables'),
  ('ru.fgos_ooo.base.math.algebra.7.unit6', 'math.algebra.linear_system.graphical'),
  ('ru.fgos_ooo.base.math.algebra.7.unit6', 'math.algebra.linear_system.substitution'),
  ('ru.fgos_ooo.base.math.algebra.7.unit6', 'math.algebra.linear_system.addition'),
  ('ru.fgos_ooo.base.math.algebra.7.unit6', 'math.algebra.linear_system.word_problem'),
  ('ru.fgos_ooo.base.math.geometry.7.unit1', 'math.geometry.basic.points_lines_segments'),
  ('ru.fgos_ooo.base.math.geometry.7.unit1', 'math.geometry.angles'),
  ('ru.fgos_ooo.base.math.geometry.7.unit2', 'math.geometry.triangle.congruence'),
  ('ru.fgos_ooo.base.math.geometry.7.unit2', 'math.geometry.triangle.isosceles'),
  ('ru.fgos_ooo.base.math.geometry.7.unit3', 'math.geometry.parallel_lines'),
  ('ru.fgos_ooo.base.math.geometry.7.unit4', 'math.geometry.triangle.angle_sum'),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit1', 'math.statistics.tables_charts'),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit2', 'math.statistics.mean_median_range'),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit2', 'math.statistics.data_distribution'),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit6', 'math.probability.elementary_event'),
  ('ru.fgos_ooo.base.math.probability_statistics.7.unit7', 'math.sets.basic_operations'),
  ('ru.fgos_ooo.base.russian.language.7.unit2', 'russian.grammar.participle'),
  ('ru.fgos_ooo.base.russian.language.7.unit2', 'russian.grammar.participial_phrase'),
  ('ru.fgos_ooo.base.russian.language.7.unit3', 'russian.grammar.gerund'),
  ('ru.fgos_ooo.base.russian.language.7.unit4', 'russian.grammar.adverb'),
  ('ru.fgos_ooo.base.russian.language.7.unit5', 'russian.grammar.preposition'),
  ('ru.fgos_ooo.base.russian.language.7.unit6', 'russian.grammar.conjunction'),
  ('ru.fgos_ooo.base.russian.language.7.unit7', 'russian.grammar.particle'),
  ('ru.fgos_ooo.base.physics.general.7.unit2', 'physics.matter.density'),
  ('ru.fgos_ooo.base.physics.general.7.unit3', 'physics.motion.speed'),
  ('ru.fgos_ooo.base.physics.general.7.unit3', 'physics.mechanics.inertia'),
  ('ru.fgos_ooo.base.physics.general.7.unit4', 'physics.pressure.basic'),
  ('ru.fgos_ooo.base.physics.general.7.unit5', 'physics.work_power_energy.basic'),
  ('ru.fgos_ooo.base.biology.general.7.unit1', 'biology.plants.groups'),
  ('ru.fgos_ooo.base.biology.general.7.unit2', 'biology.classification.basic'),
  ('ru.fgos_ooo.base.biology.general.7.unit3', 'biology.ecology.plant_environment'),
  ('ru.fgos_ooo.base.biology.general.7.unit4', 'biology.bacteria.basic'),
  ('ru.fgos_ooo.base.biology.general.7.unit5', 'biology.fungi.basic'),
  ('ru.fgos_ooo.base.geography.general.7.unit2', 'geography.population.distribution'),
  ('ru.fgos_ooo.base.geography.general.7.unit3', 'geography.climate.basic'),
  ('ru.fgos_ooo.base.geography.general.7.unit3', 'geography.world_ocean'),
  ('ru.fgos_ooo.base.geography.general.7.unit4', 'geography.natural_zones'),
  ('ru.fgos_ooo.base.geography.general.7.unit5', 'geography.continent.profile'),
  ('ru.fgos_ooo.base.informatics.general.7.unit1', 'informatics.information.processes'),
  ('ru.fgos_ooo.base.informatics.general.7.unit1', 'informatics.data.representation'),
  ('ru.fgos_ooo.base.informatics.general.7.unit2', 'informatics.files.basic'),
  ('ru.fgos_ooo.base.informatics.general.7.unit3', 'informatics.text.processing'),
  ('ru.fgos_ooo.base.informatics.general.7.unit4', 'informatics.graphics.basic'),
  ('ru.fgos_ooo.base.informatics.general.7.unit5', 'informatics.presentation.basic')
on conflict do nothing;

insert into public.textbook_unit_skills (textbook_unit_id, skill_id) values
  ('tb.math.algebra.makarychev.7.2023.unit1', 'math.algebra.linear_equation.basic'),
  ('tb.math.algebra.makarychev.7.2023.unit2', 'math.algebra.function.graph_reading'),
  ('tb.math.algebra.makarychev.7.2023.unit4', 'math.algebra.polynomial.operations'),
  ('tb.math.algebra.makarychev.7.2023.unit5', 'math.algebra.abbreviated_multiplication'),
  ('tb.math.algebra.makarychev.7.2023.unit6', 'math.algebra.linear_system.two_variables'),
  ('tb.math.algebra.makarychev.7.2023.unit6', 'math.algebra.linear_system.graphical'),
  ('tb.math.algebra.makarychev.7.2023.unit6', 'math.algebra.linear_system.substitution'),
  ('tb.math.algebra.makarychev.7.2023.unit6', 'math.algebra.linear_system.addition'),
  ('tb.math.algebra.makarychev.7.2023.unit6', 'math.algebra.linear_system.word_problem'),
  ('tb.math.geometry.atanasyan.7_9.2025.unit1', 'math.geometry.basic.points_lines_segments'),
  ('tb.math.geometry.atanasyan.7_9.2025.unit1', 'math.geometry.angles'),
  ('tb.math.geometry.atanasyan.7_9.2025.unit2', 'math.geometry.triangle.congruence'),
  ('tb.math.geometry.atanasyan.7_9.2025.unit2', 'math.geometry.triangle.isosceles'),
  ('tb.math.geometry.atanasyan.7_9.2025.unit3', 'math.geometry.parallel_lines'),
  ('tb.math.geometry.atanasyan.7_9.2025.unit4', 'math.geometry.triangle.angle_sum'),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit1', 'math.statistics.tables_charts'),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit2', 'math.statistics.mean_median_range'),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit2', 'math.statistics.data_distribution'),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit6', 'math.probability.elementary_event'),
  ('tb.math.probability_statistics.vysotsky_yashchenko.7_9.2024.unit7', 'math.sets.basic_operations'),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit2', 'russian.grammar.participle'),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit2', 'russian.grammar.participial_phrase'),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit3', 'russian.grammar.gerund'),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit4', 'russian.grammar.adverb'),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit5', 'russian.grammar.preposition'),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit6', 'russian.grammar.conjunction'),
  ('tb.russian.baranov_ladyzhenskaya.7.2023.unit7', 'russian.grammar.particle'),
  ('tb.physics.peryshkin_ivanov.7.2023.unit2', 'physics.matter.density'),
  ('tb.physics.peryshkin_ivanov.7.2023.unit3', 'physics.motion.speed'),
  ('tb.physics.peryshkin_ivanov.7.2023.unit3', 'physics.mechanics.inertia'),
  ('tb.physics.peryshkin_ivanov.7.2023.unit4', 'physics.pressure.basic'),
  ('tb.physics.peryshkin_ivanov.7.2023.unit5', 'physics.work_power_energy.basic'),
  ('tb.biology.pasechnik.7.2024.unit1', 'biology.plants.groups'),
  ('tb.biology.pasechnik.7.2024.unit2', 'biology.classification.basic'),
  ('tb.biology.pasechnik.7.2024.unit3', 'biology.ecology.plant_environment'),
  ('tb.biology.pasechnik.7.2024.unit4', 'biology.bacteria.basic'),
  ('tb.biology.pasechnik.7.2024.unit5', 'biology.fungi.basic'),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit2', 'geography.population.distribution'),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit3', 'geography.climate.basic'),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit3', 'geography.world_ocean'),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit4', 'geography.natural_zones'),
  ('tb.geography.polyarnaya_zvezda.7.2025.unit5', 'geography.continent.profile'),
  ('tb.informatics.bosova.7.2025.unit1', 'informatics.information.processes'),
  ('tb.informatics.bosova.7.2025.unit1', 'informatics.data.representation'),
  ('tb.informatics.bosova.7.2025.unit2', 'informatics.files.basic'),
  ('tb.informatics.bosova.7.2025.unit3', 'informatics.text.processing'),
  ('tb.informatics.bosova.7.2025.unit4', 'informatics.graphics.basic'),
  ('tb.informatics.bosova.7.2025.unit5', 'informatics.presentation.basic')
on conflict do nothing;

commit;
