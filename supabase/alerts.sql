create table if not exists public.monitored_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  fixture_id text not null,
  provider_fixture_id text,
  league text,
  home_team text,
  away_team text,
  kickoff_at timestamptz,
  status text,
  sources jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  last_snapshot jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fixture_id)
);

alter table public.monitored_matches enable row level security;

drop policy if exists "Users can read own monitored matches" on public.monitored_matches;
create policy "Users can read own monitored matches"
on public.monitored_matches
for select
using (auth.uid() = user_id);

create index if not exists monitored_matches_user_active_idx
on public.monitored_matches (user_id, active, updated_at desc);

create index if not exists monitored_matches_active_check_idx
on public.monitored_matches (active, last_checked_at, kickoff_at);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  alert_key text not null,
  type text not null check (
    type in ('goal', 'yellow_card', 'red_card', 'corner', 'odds_shift', 'upset_warning', 'ai_update')
  ),
  match_name text not null,
  score text not null,
  content text not null,
  status text not null default 'unread' check (status in ('unread', 'read', 'archived')),
  source text not null default 'server',
  trigger_snapshot jsonb not null default '{}'::jsonb,
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'onsite', 'browser', 'sent', 'failed')),
  notification_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, alert_key)
);

alter table public.alerts enable row level security;

drop policy if exists "Users can read own alerts" on public.alerts;
create policy "Users can read own alerts"
on public.alerts
for select
using (auth.uid() = user_id);

drop policy if exists "Users can update own alerts" on public.alerts;
create policy "Users can update own alerts"
on public.alerts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists alerts_user_created_idx
on public.alerts (user_id, created_at desc);

create index if not exists alerts_unread_idx
on public.alerts (user_id, status, created_at desc);
