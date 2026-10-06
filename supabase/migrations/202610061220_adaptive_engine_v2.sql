create table if not exists public.learning_observations (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  session_id uuid references public.study_sessions(id) on delete cascade,
  subject text not null,
  topic text,
  intent text not null,
  goal text not null,
  method text not null,
  visual_type text not null default 'none',
  support_stage int not null check (support_stage between 0 and 4),
  evidence text,
  created_at timestamptz not null default now()
);

alter table public.learning_observations enable row level security;

drop policy if exists "parents own learning observations" on public.learning_observations;
create policy "parents own learning observations"
on public.learning_observations
for all
to authenticated
using (
  exists (
    select 1 from public.children c
    where c.id = learning_observations.child_id
      and c.parent_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.children c
    where c.id = learning_observations.child_id
      and c.parent_id = (select auth.uid())
  )
);

grant select, insert on public.learning_observations to authenticated;
create index if not exists learning_observations_child_subject_idx
  on public.learning_observations(child_id, subject, created_at desc);
