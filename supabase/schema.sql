create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  grade int not null default 7,
  created_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  subject text not null,
  mode text not null,
  title text,
  independence_score int,
  hints_used int not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.topic_progress (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  subject text not null,
  topic text not null,
  mastery_score int,
  needs_review boolean not null default false,
  last_seen_at timestamptz not null default now(),
  unique(child_id, subject, topic)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.study_sessions enable row level security;
alter table public.messages enable row level security;
alter table public.topic_progress enable row level security;

drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row" on public.profiles
for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "parents own children" on public.children;
create policy "parents own children" on public.children
for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

drop policy if exists "parents own sessions" on public.study_sessions;
create policy "parents own sessions" on public.study_sessions
for all
using (exists (
  select 1 from public.children c
  where c.id = study_sessions.child_id and c.parent_id = auth.uid()
))
with check (exists (
  select 1 from public.children c
  where c.id = study_sessions.child_id and c.parent_id = auth.uid()
));

drop policy if exists "parents own messages" on public.messages;
create policy "parents own messages" on public.messages
for all
using (exists (
  select 1 from public.study_sessions s
  join public.children c on c.id = s.child_id
  where s.id = messages.session_id and c.parent_id = auth.uid()
))
with check (exists (
  select 1 from public.study_sessions s
  join public.children c on c.id = s.child_id
  where s.id = messages.session_id and c.parent_id = auth.uid()
));

drop policy if exists "parents own progress" on public.topic_progress;
create policy "parents own progress" on public.topic_progress
for all
using (exists (
  select 1 from public.children c
  where c.id = topic_progress.child_id and c.parent_id = auth.uid()
))
with check (exists (
  select 1 from public.children c
  where c.id = topic_progress.child_id and c.parent_id = auth.uid()
));
