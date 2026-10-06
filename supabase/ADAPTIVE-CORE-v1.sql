-- ADAPTIVE LEARNING CORE v1
-- Run after SMART-CORE.sql

alter table public.tutor_rules
  add column if not exists category text not null default 'general',
  add column if not exists subject text,
  add column if not exists priority int not null default 50,
  add column if not exists review_status text not null default 'active',
  add column if not exists last_reviewed_at timestamptz;

create table if not exists public.learning_method_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  session_id uuid references public.study_sessions(id) on delete cascade,
  subject text not null,
  topic text,
  method text not null,
  outcome_score int check (outcome_score between 0 and 100),
  outcome_label text not null default 'unknown'
    check (outcome_label in ('helped','mixed','not_helped','unknown')),
  evidence text,
  created_at timestamptz not null default now()
);

alter table public.learning_method_events enable row level security;

drop policy if exists "parents own learning method events"
on public.learning_method_events;

create policy "parents own learning method events"
on public.learning_method_events
for all
using (
  exists (
    select 1
    from public.children c
    where c.id = learning_method_events.child_id
      and c.parent_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.children c
    where c.id = learning_method_events.child_id
      and c.parent_id = auth.uid()
  )
);

grant select, insert, update, delete
on table public.learning_method_events
to authenticated;

create index if not exists learning_method_events_child_subject_idx
  on public.learning_method_events(child_id, subject, created_at desc);

create index if not exists learning_method_events_method_idx
  on public.learning_method_events(child_id, subject, method, created_at desc);
