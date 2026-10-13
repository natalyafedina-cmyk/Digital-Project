-- Sprint 3. Additive only; apply separately after review. No legacy/personal backfill.
begin;
alter table public.student_skill_evidence add column turn_id uuid;
create unique index student_skill_evidence_turn_dedup_idx on public.student_skill_evidence(child_id,skill_id,turn_id) where turn_id is not null;
alter table public.turn_analytics
 add column analyzer_confidence numeric check (analyzer_confidence between 0 and 1),
 add column analysis_source text, add column error_classes jsonb, add column critic_flags jsonb;
alter table public.learning_observations
 add column evidence_type text, add column confidence numeric check (confidence between 0 and 1),
 add column observation_state text check (observation_state in ('candidate','confirmed','expired'));
alter table public.tutor_rules
 add column structured_rule jsonb, add column interpretation_status text,
 add column course_id text references public.courses(id), add column skill_id text references public.skills(id),
 add column valid_from timestamptz, add column valid_until timestamptz;
create index tutor_rules_course_idx on public.tutor_rules(course_id);
create index tutor_rules_skill_idx on public.tutor_rules(skill_id);

-- Invoker RLS prevents cross-parent writes. The state guard prevents direct mastery/state writes.
grant insert on public.student_skill_evidence to authenticated;
grant insert, update on public.student_skill_state to authenticated;
create policy parent_evidence_insert on public.student_skill_evidence for insert to authenticated with check (
 exists (select 1 from public.children c where c.id = student_skill_evidence.child_id and c.parent_id = (select auth.uid()))
 and exists (select 1 from public.study_sessions s where s.id = student_skill_evidence.session_id and s.child_id = student_skill_evidence.child_id)
);
create policy parent_state_insert on public.student_skill_state for insert to authenticated with check (
 exists (select 1 from public.children c where c.id = student_skill_state.child_id and c.parent_id = (select auth.uid()))
);
create policy parent_state_update on public.student_skill_state for update to authenticated using (
 exists (select 1 from public.children c where c.id = student_skill_state.child_id and c.parent_id = (select auth.uid()))
) with check (
 exists (select 1 from public.children c where c.id = student_skill_state.child_id and c.parent_id = (select auth.uid()))
);
create function public.guard_engine_skill_state() returns trigger language plpgsql security invoker set search_path = public as $$
begin
 if pg_trigger_depth() < 2 then raise exception 'Skill state is evidence-engine owned'; end if;
 return new;
end $$;
revoke all on function public.guard_engine_skill_state() from public, anon, authenticated;
create trigger engine_owned_state before insert or update on public.student_skill_state for each row execute function public.guard_engine_skill_state();

create function public.validate_reliable_skill_evidence() returns trigger language plpgsql security invoker set search_path = public as $$
declare analysis_min constant numeric := 0.70; stt_min constant numeric := 0.65;
begin
 if new.turn_id is null or new.session_id is null or new.analyzer_confidence is null or new.analyzer_confidence < analysis_min
   or (new.stt_confidence is not null and new.stt_confidence < stt_min)
   or new.correctness not in ('correct','incorrect','partial') or new.support_stage is null
   or coalesce(new.metadata->>'attemptKind','') not in ('answer','partial_answer')
   or coalesce(length(trim(new.metadata->>'evidence')),0) = 0
   or not exists (select 1 from public.skills k join public.study_sessions s on s.id = new.session_id
     where k.id = new.skill_id and k.active and k.subject_id = s.subject and s.child_id = new.child_id
       and (k.course_id is null or k.course_id = coalesce(s.course_id, new.metadata->>'courseId')))
 then raise exception 'Unreliable or mismatched skill evidence'; end if;
 new.evidence_type := case when new.correctness = 'correct' then
   case when new.support_stage = 0 then 'independent_success' else 'hinted_success' end
   when new.correctness = 'incorrect' then 'failure' else 'partial_attempt' end;
 new.weight := case when new.correctness = 'correct' and new.support_stage = 0 then 2 else 1 end;
 new.metadata := jsonb_build_object('attemptKind',new.metadata->>'attemptKind', 'errorClasses',new.metadata->'errorClasses',
   'courseId',new.metadata->>'courseId','analysisSource','universal_analyzer','evidence',left(new.metadata->>'evidence',500));
 new.created_at := clock_timestamp();
 return new;
end $$;
revoke all on function public.validate_reliable_skill_evidence() from public, anon, authenticated;
create trigger reliable_skill_evidence before insert on public.student_skill_evidence for each row execute function public.validate_reliable_skill_evidence();

create function public.update_skill_state_from_evidence() returns trigger language plpgsql security invoker set search_path = public as $$
declare total integer; independent integer; hinted integer; failures integer; contexts integer; recent_failures integer;
 analysis_min constant numeric := 0.70; stt_min constant numeric := 0.65;
 last_success timestamptz; previous_status text; next_status text;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.child_id::text || ':' || new.skill_id,0));
 select status into previous_status from public.student_skill_state where child_id = new.child_id and skill_id = new.skill_id for update;
 select count(*), count(*) filter(where correctness='correct' and support_stage=0),
   count(*) filter(where correctness='correct' and support_stage>0), count(*) filter(where correctness='incorrect'),
   count(distinct coalesce(session_id::text, created_at::date::text)) filter(where correctness='correct' and support_stage=0),
   max(created_at) filter(where correctness='correct' and support_stage=0)
 into total,independent,hinted,failures,contexts,last_success
 from public.student_skill_evidence where child_id=new.child_id and skill_id=new.skill_id
   and analyzer_confidence>=analysis_min and (stt_confidence is null or stt_confidence>=stt_min) and turn_id is not null;
 select count(*) into recent_failures from public.student_skill_evidence where child_id=new.child_id and skill_id=new.skill_id
   and turn_id is not null and analyzer_confidence>=analysis_min and (stt_confidence is null or stt_confidence>=stt_min)
   and correctness='incorrect' and support_stage=0 and (last_success is null or created_at>last_success);
 next_status := case
   when previous_status in ('mastered','needs_review') or (independent>=3 and contexts>=2) then
     case when recent_failures>=2 then 'needs_review' else 'mastered' end
   when independent>=2 then 'nearly_mastered' when total>1 then 'learning' when total=1 then 'introduced' else 'not_seen' end;
 insert into public.student_skill_state(child_id,skill_id,status,confidence,evidence_count,independent_successes,hinted_successes,failures,last_seen_at,last_independent_success_at,updated_at)
 values(new.child_id,new.skill_id,next_status,least(1,total::numeric/5),total,independent,hinted,failures,new.created_at,last_success,now())
 on conflict(child_id,skill_id) do update set status=excluded.status, confidence=excluded.confidence, evidence_count=excluded.evidence_count,
 independent_successes=excluded.independent_successes,hinted_successes=excluded.hinted_successes,failures=excluded.failures,
 last_seen_at=excluded.last_seen_at,last_independent_success_at=excluded.last_independent_success_at,updated_at=excluded.updated_at;
 -- mastery_score is intentionally never set from model output.
 return new;
end $$;
revoke all on function public.update_skill_state_from_evidence() from public, anon, authenticated;
create trigger engine_skill_evidence after insert on public.student_skill_evidence for each row execute function public.update_skill_state_from_evidence();

create function public.record_skill_evidence(p_child_id uuid,p_session_id uuid,p_skill_id text,p_turn_id uuid,p_correctness text,
 p_support_stage integer,p_stt_confidence numeric,p_analyzer_confidence numeric,p_metadata jsonb)
 returns void language plpgsql security invoker set search_path = public as $$
begin
 insert into public.student_skill_evidence(child_id,session_id,skill_id,turn_id,correctness,support_stage,stt_confidence,analyzer_confidence,evidence_type,metadata)
 values(p_child_id,p_session_id,p_skill_id,p_turn_id,p_correctness,p_support_stage,p_stt_confidence,p_analyzer_confidence,'candidate',p_metadata)
 on conflict(child_id,skill_id,turn_id) where turn_id is not null do nothing;
end $$;
revoke all on function public.record_skill_evidence(uuid,uuid,text,uuid,text,integer,numeric,numeric,jsonb) from public, anon;
grant execute on function public.record_skill_evidence(uuid,uuid,text,uuid,text,integer,numeric,numeric,jsonb) to authenticated;
commit;
