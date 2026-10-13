-- LOCAL SYNTHETIC FIXTURES ONLY. Rolled back; never run this file on production.
begin;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.children(id,parent_id,name,grade) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Test A',7),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Test B',7);
insert into public.study_sessions(id,child_id,subject,mode,course_id) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','math','practice','math.algebra'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','math','practice','math.algebra'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','math','practice','math.algebra');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
declare child uuid:='10000000-0000-0000-0000-000000000001'; session_one uuid:='20000000-0000-0000-0000-000000000001';
 session_two uuid:='20000000-0000-0000-0000-000000000002'; turn uuid:=gen_random_uuid();
 skill text:='math.algebra.linear_equation.basic'; meta jsonb:='{"attemptKind":"answer","courseId":"math.algebra","evidence":"Observable step","secret_test_field":"must be discarded"}';
 state_before jsonb;
begin
 perform public.record_skill_evidence(child,session_one,skill,turn,'correct',0,null,.9,meta);
 perform public.record_skill_evidence(child,session_one,skill,turn,'correct',0,null,.9,meta);
 if (select evidence_count from public.student_skill_state where child_id=child and skill_id=skill)<>1 then raise exception 'Duplicate evidence'; end if;
 perform public.record_skill_evidence(child,session_one,skill,gen_random_uuid(),'correct',2,null,.9,meta);
 if (select hinted_successes from public.student_skill_state where child_id=child and skill_id=skill)<>1 then raise exception 'Hinted success'; end if;
 perform public.record_skill_evidence(child,session_one,skill,gen_random_uuid(),'correct',0,null,.9,meta);
 if (select status from public.student_skill_state where child_id=child and skill_id=skill)<>'nearly_mastered' then raise exception 'Nearly mastered'; end if;
 perform public.record_skill_evidence(child,session_two,skill,gen_random_uuid(),'correct',0,null,.9,meta);
 if (select status from public.student_skill_state where child_id=child and skill_id=skill)<>'mastered' then raise exception 'Mastered multi-session'; end if;
 perform public.record_skill_evidence(child,session_two,skill,gen_random_uuid(),'incorrect',0,null,.9,meta);
 if (select status from public.student_skill_state where child_id=child and skill_id=skill)<>'mastered' then raise exception 'One error demoted mastery'; end if;
 select to_jsonb(s) into state_before from public.student_skill_state s where child_id=child and skill_id=skill;
 begin
  perform public.record_skill_evidence(child,session_two,skill,gen_random_uuid(),'incorrect',0,.64,.99,meta);
  raise exception 'Low STT accepted';
 exception when raise_exception then if sqlerrm<>'Unreliable or mismatched skill evidence' then raise; end if; end;
 if (select to_jsonb(s) from public.student_skill_state s where child_id=child and skill_id=skill) is distinct from state_before then raise exception 'Low STT changed state'; end if;
 begin
  perform public.record_skill_evidence(child,session_two,skill,gen_random_uuid(),'incorrect',0,null,.69,meta);
  raise exception 'Low analyzer accepted';
 exception when raise_exception then if sqlerrm<>'Unreliable or mismatched skill evidence' then raise; end if; end;
 perform public.record_skill_evidence(child,session_two,skill,gen_random_uuid(),'incorrect',0,null,.9,meta);
 if (select status from public.student_skill_state where child_id=child and skill_id=skill)<>'needs_review' then raise exception 'Repeated errors not recognized'; end if;
 if exists(select 1 from public.student_skill_state where mastery_score is not null) then raise exception 'Invented mastery percent'; end if;
 if exists(select 1 from public.student_skill_evidence where metadata ? 'secret_test_field') then raise exception 'Unrestricted metadata'; end if;
 begin
  update public.student_skill_state set mastery_score=90 where child_id=child;
  raise exception 'Direct mastery update accepted';
 exception when raise_exception then if sqlerrm<>'Skill state is evidence-engine owned' then raise; end if; end;
 begin
  perform public.record_skill_evidence('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003',skill,gen_random_uuid(),'correct',0,null,.9,meta);
  raise exception 'Cross-owner write accepted';
 exception when insufficient_privilege then null;
 when raise_exception then if sqlerrm<>'Unreliable or mismatched skill evidence' then raise; end if; end;
 begin
  perform public.record_skill_evidence(child,session_one,'english.grammar.past_simple',gen_random_uuid(),'correct',0,null,.9,meta);
  raise exception 'Wrong-context skill accepted';
 exception when raise_exception then if sqlerrm<>'Unreliable or mismatched skill evidence' then raise; end if; end;
end $$;
reset role;
do $$
begin
 if exists(select 1 from pg_constraint c where c.contype='f' and c.conrelid='public.tutor_rules'::regclass
  and c.confrelid in ('public.skills'::regclass,'public.courses'::regclass)
  and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indpred is null and i.indkey::smallint[] @> c.conkey))
  then raise exception 'New unindexed FK'; end if;
 if exists(select 1 from pg_proc p where p.proname in ('record_skill_evidence','update_skill_state_from_evidence','validate_reliable_skill_evidence') and p.prosecdef)
  then raise exception 'Security definer shortcut'; end if;
end $$;
rollback;
