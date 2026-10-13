-- Disposable local SQL only; no real learner IDs.
begin;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.children(id,parent_id,name,grade) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Test A',7),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Test B',7);
insert into public.study_sessions(id,child_id,subject,mode) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','math','practice'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','math','practice');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
declare unit_id text; n int;
begin
 if not exists(select 1 from public.study_sessions where lesson_state is null and target_skill_id is null) then raise exception 'Legacy session lost'; end if;
 select id into unit_id from public.curriculum_units where course_id='math.algebra' limit 1;
 update public.study_sessions set course_id='math.algebra',target_skill_id='math.algebra.linear_equation.basic',target_curriculum_unit_id=unit_id,lesson_phase='await_attempt',lesson_state='{"version":1,"supportStage":0,"lastTask":{"text":"Test task"}}' where id='20000000-0000-0000-0000-000000000001';
 if not exists(select 1 from public.study_sessions where lesson_state->>'version'='1' and target_skill_id is not null) then raise exception 'State write failed'; end if;
 insert into public.session_skills(session_id,skill_id,role) values('20000000-0000-0000-0000-000000000001','math.algebra.linear_equation.basic','target');
 update public.study_sessions set lesson_phase='complete' where id='20000000-0000-0000-0000-000000000002';
 get diagnostics n=row_count; if n<>0 then raise exception 'RLS cross owner update'; end if;
 begin update public.study_sessions set target_skill_id='invented' where id='20000000-0000-0000-0000-000000000001';raise exception 'Invalid skill allowed';exception when foreign_key_violation then null;end;
 begin update public.study_sessions set target_curriculum_unit_id='invented' where id='20000000-0000-0000-0000-000000000001';raise exception 'Invalid unit allowed';exception when foreign_key_violation then null;end;
 begin update public.study_sessions set course_id='invented' where id='20000000-0000-0000-0000-000000000001';raise exception 'Invalid course allowed';exception when foreign_key_violation then null;end;
 begin update public.study_sessions set lesson_phase='invented' where id='20000000-0000-0000-0000-000000000001';raise exception 'Invalid phase allowed';exception when check_violation then null;end;
 if not exists(select 1 from pg_indexes where indexname='study_sessions_target_unit_idx') or not exists(select 1 from pg_indexes where indexname='study_sessions_target_skill_idx') then raise exception 'FK indexes missing';end if;
end $$;
rollback;
