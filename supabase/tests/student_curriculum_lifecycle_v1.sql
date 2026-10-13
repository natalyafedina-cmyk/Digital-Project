-- LOCAL TEST FIXTURES ONLY; never apply this file to a production database.
begin;
do $$
declare missing_indexes integer;
begin
  if (select count(*) from public.subjects) <> 9 or (select count(*) from public.courses) <> 13
    or (select count(*) from public.textbook_editions) <> 13
    or (select count(*) from public.curriculum_units) <> 62
    or (select count(*) from public.textbook_units) <> 62
    or (select count(*) from public.skills) <> 63 then raise exception 'Catalog counts'; end if;
  if exists (select 1 from public.student_enrollments) or exists (select 1 from public.student_textbook_assignments)
    or exists (select 1 from public.student_skill_state) then raise exception 'Personal backfill'; end if;
  if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace
    and relname in ('academic_years','curriculum_programs','subjects','courses','curriculum_program_courses',
      'curriculum_units','skills','skill_prerequisites','textbook_editions','textbook_units','curriculum_unit_skills',
      'textbook_unit_skills','student_profiles','student_enrollments','student_subject_enrollments',
      'student_textbook_assignments','student_skill_state','student_skill_evidence','session_skills','academic_transition_snapshots')
    and not relrowsecurity) then raise exception 'Missing RLS'; end if;
  select count(*) into missing_indexes from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and (c.conrelid::regclass::text in ('courses','curriculum_program_courses','curriculum_units','skills',
      'skill_prerequisites','textbook_editions','textbook_units','curriculum_unit_skills','textbook_unit_skills',
      'student_profiles','student_enrollments','student_subject_enrollments','student_textbook_assignments',
      'student_skill_state','student_skill_evidence','session_skills','academic_transition_snapshots')
      or (c.conrelid::regclass::text in ('study_sessions','turn_analytics','learning_method_events','learning_observations')
        and c.confrelid in ('public.courses'::regclass,'public.skills'::regclass)))
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indisvalid
      and i.indpred is null and i.indkey::smallint[] @> c.conkey
      and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] @> c.conkey);
  if missing_indexes <> 0 then raise exception 'Unindexed FK: %', missing_indexes; end if;
  if (select classification from public.curriculum_program_courses where course_id = 'history.moscow_region') <> 'regional'
    then raise exception 'Regional classification'; end if;
  -- The approved baseline now includes verified part/page metadata; validate its ranges.
  if exists (select 1 from public.textbook_units where page_start < 1 or page_end < page_start)
    then raise exception 'Invalid bibliography range'; end if;
  if exists(select 1 from public.textbook_units u join public.textbook_editions b on b.id=u.textbook_edition_id
    where u.part_number < 1 or (b.part_count is not null and u.part_number > b.part_count)) then raise exception 'Invalid confirmed part'; end if;
  begin
    insert into public.skill_prerequisites(skill_id,prerequisite_skill_id)
      values ('math.algebra.linear_equation.basic','math.algebra.linear_system.substitution');
    raise exception 'Cycle was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Cyclic skill prerequisite' then raise; end if;
  end;
end $$;
insert into public.academic_years values ('2027-28','2027/28','2027-09-01','2028-08-31');
insert into public.student_enrollments(id,child_id,academic_year_id,grade,curriculum_program_id,status,started_on) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-27',7,'ru.fgos_ooo.base','active','2026-09-01'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','2026-27',6,'ru.fgos_ooo.base','active','2026-09-01'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','2026-27',7,'ru.fgos_ooo.base','active','2026-09-01');
insert into public.student_skill_state(child_id,skill_id,status,mastery_score,evidence_count) values
 ('10000000-0000-0000-0000-000000000001','math.algebra.linear_equation.basic','learning',42,3),
 ('10000000-0000-0000-0000-000000000003','math.algebra.linear_equation.basic','introduced',null,0);
insert into public.student_skill_evidence(child_id,skill_id,evidence_type,correctness,support_stage,stt_confidence) values
 ('10000000-0000-0000-0000-000000000001','math.algebra.linear_equation.basic','transcript','unknown',0,0.1);
insert into public.textbook_editions(id,course_id,title) values ('test.algebra.replacement','math.algebra','Test alternative edition');
insert into public.student_textbook_assignments(id,enrollment_id,course_id,textbook_edition_id,role,valid_from,status) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','math.algebra','tb.math.algebra.makarychev.7.2023','primary','2026-09-01','active'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','math.algebra','tb.math.algebra.makarychev.7.2023','additional','2026-09-01','active'),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','math.algebra','tb.math.algebra.makarychev.7.2023','primary','2026-09-01','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
declare state_before jsonb; next_enrollment uuid; next_book uuid;
begin
  if (select count(*) from public.student_enrollments) <> 2 then raise exception 'RLS read leak'; end if;
  if (select count(*) from public.student_skill_state) <> 1 then raise exception 'Skill state ownership leak'; end if;
  begin
    insert into public.subjects values ('forbidden','Forbidden',99,true);
    raise exception 'Catalog write accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.student_skill_state set mastery_score = 90;
    raise exception 'Direct mastery write accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.student_enrollments set child_id = '10000000-0000-0000-0000-000000000003'
      where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'Cross-parent update accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.student_enrollments(child_id,academic_year_id,grade,curriculum_program_id,status,started_on)
      values ('10000000-0000-0000-0000-000000000001','2026-27',7,'ru.fgos_ooo.base','active','2026-10-01');
    raise exception 'Duplicate active enrollment accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.student_textbook_assignments(enrollment_id,course_id,textbook_edition_id,role,valid_from,status)
      values ('20000000-0000-0000-0000-000000000001','math.geometry','tb.math.algebra.makarychev.7.2023','primary','2026-09-01','active');
    raise exception 'Mismatched book course accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.student_textbook_assignments(enrollment_id,course_id,textbook_edition_id,role,valid_from,status)
      values ('20000000-0000-0000-0000-000000000003','math.algebra','tb.math.algebra.makarychev.7.2023','primary','2026-09-01','active');
    raise exception 'Cross-parent assignment accepted';
  exception when insufficient_privilege then null; end;
  select jsonb_agg(to_jsonb(s)) into state_before from public.student_skill_state s;
  next_book := public.replace_student_textbook('30000000-0000-0000-0000-000000000001','test.algebra.replacement','2027-01-15');
  if (select valid_to from public.student_textbook_assignments where id = '30000000-0000-0000-0000-000000000001') <> '2027-01-14'::date
    or (select valid_from from public.student_textbook_assignments where id = next_book) <> '2027-01-15'::date
    or (select count(*) from public.student_textbook_assignments where enrollment_id = '20000000-0000-0000-0000-000000000001' and status = 'active') <> 2
    then raise exception 'Textbook replacement interval or parallel book'; end if;
  next_enrollment := public.transition_student_enrollment('20000000-0000-0000-0000-000000000001','2027-28',8,'ru.fgos_ooo.base','2027-09-01');
  if (select child_id from public.student_enrollments where id = next_enrollment) <> '10000000-0000-0000-0000-000000000001'::uuid
    or (select grade from public.student_enrollments where id = next_enrollment) <> 8
    or (select status from public.student_enrollments where id = '20000000-0000-0000-0000-000000000001') <> 'completed'
    then raise exception 'Academic identity transition'; end if;
  if (select jsonb_agg(to_jsonb(s)) from public.student_skill_state s) is distinct from state_before
    then raise exception 'Lifecycle or low STT confidence changed permanent skills'; end if;
  if (select count(*) from public.academic_transition_snapshots) <> 1 then raise exception 'Missing transition snapshot'; end if;
  if (select count(*) from public.topic_progress) <> 1 then raise exception 'Legacy data lost'; end if;
end $$;
reset role;
do $$
begin
  if (select grade from public.children where id = '10000000-0000-0000-0000-000000000001') <> 7 then raise exception 'Legacy grade mutated'; end if;
  begin
    insert into public.student_skill_evidence(child_id,skill_id,evidence_type,correctness,support_stage)
      values ('10000000-0000-0000-0000-000000000001','math.algebra.linear_equation.basic','test','unknown',5);
    raise exception 'Support stage above 4 accepted';
  exception when check_violation then null; end;
end $$;
rollback;
