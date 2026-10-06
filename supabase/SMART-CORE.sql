-- SMART CORE migration: parent chat, rules, analytics, live progress
-- Safe to run after the previous Supabase schema.

alter table public.children
  add column if not exists voice_settings jsonb not null default
  '{"enabled":false,"speed":1,"preset":"calm","englishSpeed":0.9}'::jsonb;

alter table public.study_sessions
  add column if not exists status text not null default 'active',
  add column if not exists last_activity_at timestamptz not null default now();

alter table public.messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.tutor_rules (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  rule_text text not null,
  scope text not null default 'permanent'
    check (scope in ('permanent','temporary')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.parent_chat_messages (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.turn_analytics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  subject text not null,
  topic text,
  hint_level int not null default 0 check (hint_level between 0 and 4),
  independence_score int check (independence_score between 0 and 100),
  correctness text not null default 'unknown'
    check (correctness in ('correct','incorrect','partial','unknown')),
  needs_review boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tutor_rules enable row level security;
alter table public.parent_chat_messages enable row level security;
alter table public.turn_analytics enable row level security;

drop policy if exists "parents own tutor rules" on public.tutor_rules;
create policy "parents own tutor rules"
on public.tutor_rules
for all
using (parent_id = auth.uid())
with check (parent_id = auth.uid());

drop policy if exists "parents own parent chat" on public.parent_chat_messages;
create policy "parents own parent chat"
on public.parent_chat_messages
for all
using (parent_id = auth.uid())
with check (parent_id = auth.uid());

drop policy if exists "parents own turn analytics" on public.turn_analytics;
create policy "parents own turn analytics"
on public.turn_analytics
for all
using (
  exists (
    select 1 from public.children c
    where c.id = turn_analytics.child_id
      and c.parent_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.children c
    where c.id = turn_analytics.child_id
      and c.parent_id = auth.uid()
  )
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.children to authenticated;
grant select, insert, update, delete on table public.study_sessions to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.topic_progress to authenticated;
grant select, insert, update, delete on table public.tutor_rules to authenticated;
grant select, insert, update, delete on table public.parent_chat_messages to authenticated;
grant select, insert, update, delete on table public.turn_analytics to authenticated;

create index if not exists tutor_rules_parent_child_idx
  on public.tutor_rules(parent_id, child_id, active);

create index if not exists parent_chat_parent_idx
  on public.parent_chat_messages(parent_id, created_at);

create index if not exists turn_analytics_child_idx
  on public.turn_analytics(child_id, created_at desc);

create index if not exists sessions_resume_idx
  on public.study_sessions(child_id, subject, mode, last_activity_at desc);
