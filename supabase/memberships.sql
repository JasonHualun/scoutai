create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  pro_until timestamptz,
  prediction_credits integer not null default 20 check (prediction_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memberships
add column if not exists prediction_credits integer not null default 20;

alter table public.memberships
alter column prediction_credits set default 20;

alter table public.memberships
drop constraint if exists memberships_prediction_credits_check;

alter table public.memberships
add constraint memberships_prediction_credits_check check (prediction_credits >= 0);

alter table public.memberships enable row level security;

drop policy if exists "Users can read own membership" on public.memberships;
create policy "Users can read own membership"
on public.memberships
for select
using (auth.uid() = user_id);

create index if not exists memberships_email_idx on public.memberships (lower(email));
create index if not exists memberships_pro_until_idx on public.memberships (pro_until);

create table if not exists public.payment_applications (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  amount numeric not null default 69.9,
  currency text not null default 'CNY' check (currency in ('CNY', 'USD')),
  months integer not null default 1 check (months between 1 and 24),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by text
);

alter table public.payment_applications enable row level security;

drop policy if exists "Users can read own payment applications" on public.payment_applications;
create policy "Users can read own payment applications"
on public.payment_applications
for select
using (auth.uid() = user_id);

create index if not exists payment_applications_status_idx
on public.payment_applications (status, created_at desc);

create index if not exists payment_applications_email_idx
on public.payment_applications (lower(email));

create index if not exists payment_applications_user_id_idx
on public.payment_applications (user_id);

create table if not exists public.prediction_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'generated' check (status in ('generated', 'settled', 'cancelled')),
  model_version text not null default 'scoutai-local-v1',
  risk_level text not null default 'balanced',
  cost integer not null check (cost > 0),
  credits_before integer not null default 0 check (credits_before >= 0),
  credits_after integer not null default 0 check (credits_after >= 0),
  prediction_count integer not null default 0 check (prediction_count >= 0),
  selected_count integer not null default 0 check (selected_count >= 0),
  total_suggested_percent numeric not null default 0,
  summary text,
  preferences_snapshot jsonb not null default '{}'::jsonb,
  portfolio_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz
);

alter table public.prediction_orders enable row level security;

drop policy if exists "Users can read own prediction orders" on public.prediction_orders;
create policy "Users can read own prediction orders"
on public.prediction_orders
for select
using (auth.uid() = user_id);

create index if not exists prediction_orders_user_created_idx
on public.prediction_orders (user_id, created_at desc);

create index if not exists prediction_orders_status_idx
on public.prediction_orders (status, created_at desc);

create table if not exists public.prediction_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.prediction_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fixture_id text not null,
  league text not null,
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz,
  status_at_prediction text not null,
  market text not null,
  direction text not null,
  recommendation text not null default 'observe',
  confidence integer not null default 0 check (confidence between 0 and 100),
  score integer not null default 0 check (score between 0 and 100),
  grade text not null default 'C',
  risk_label text not null,
  suggested_percent numeric not null default 0,
  fair_odds numeric not null default 0,
  offered_odds numeric,
  value_edge numeric,
  odds_label text,
  value_label text,
  reason text,
  data_basis jsonb not null default '[]'::jsonb,
  result_status text not null default 'pending' check (result_status in ('pending', 'won', 'lost', 'push', 'void')),
  final_score text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz
);

alter table public.prediction_order_items
alter column fixture_id type text using fixture_id::text;

alter table public.prediction_order_items enable row level security;

drop policy if exists "Users can read own prediction order items" on public.prediction_order_items;
create policy "Users can read own prediction order items"
on public.prediction_order_items
for select
using (auth.uid() = user_id);

create index if not exists prediction_order_items_order_idx
on public.prediction_order_items (order_id);

create index if not exists prediction_order_items_user_fixture_idx
on public.prediction_order_items (user_id, fixture_id);

create index if not exists prediction_order_items_result_idx
on public.prediction_order_items (result_status, kickoff_at);

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

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  risk_level text not null default 'balanced'
    check (risk_level in ('conservative', 'balanced', 'aggressive')),
  capital numeric not null default 1000 check (capital >= 0),
  currency text not null default 'CNY' check (currency in ('USD', 'CNY', 'HKD')),
  preferred_models jsonb not null default '[]'::jsonb,
  bet_type jsonb not null default '[]'::jsonb,
  preferred_markets jsonb not null default '[]'::jsonb,
  favorite_leagues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users can read own preferences" on public.user_preferences;
create policy "Users can read own preferences"
on public.user_preferences
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences"
on public.user_preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences"
on public.user_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists user_preferences_user_id_idx
on public.user_preferences (user_id);

update public.payment_applications
set months = 1
where months <> 1;

alter table public.payment_applications
alter column months set default 1;

alter table public.payment_applications
drop constraint if exists payment_applications_months_check;

alter table public.payment_applications
add constraint payment_applications_months_check check (months = 1);

create or replace function public.create_prediction_order(
  p_user_id uuid,
  p_email text,
  p_model_version text,
  p_risk_level text,
  p_cost integer,
  p_prediction_count integer,
  p_selected_count integer,
  p_total_suggested_percent numeric,
  p_summary text,
  p_preferences_snapshot jsonb,
  p_portfolio_snapshot jsonb,
  p_items jsonb
)
returns table(order_id uuid, credits_before integer, credits_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_before integer;
  v_after integer;
begin
  if p_cost <= 0 then
    raise exception 'INVALID_COST';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_PREDICTION_ITEMS';
  end if;

  update public.memberships
  set prediction_credits = prediction_credits - p_cost,
      updated_at = now()
  where user_id = p_user_id
    and prediction_credits >= p_cost
  returning prediction_credits + p_cost, prediction_credits
  into v_before, v_after;

  if not found then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  insert into public.prediction_orders (
    user_id,
    email,
    status,
    model_version,
    risk_level,
    cost,
    credits_before,
    credits_after,
    prediction_count,
    selected_count,
    total_suggested_percent,
    summary,
    preferences_snapshot,
    portfolio_snapshot
  )
  values (
    p_user_id,
    coalesce(p_email, ''),
    'generated',
    p_model_version,
    p_risk_level,
    p_cost,
    v_before,
    v_after,
    p_prediction_count,
    p_selected_count,
    p_total_suggested_percent,
    p_summary,
    coalesce(p_preferences_snapshot, '{}'::jsonb),
    coalesce(p_portfolio_snapshot, '{}'::jsonb)
  )
  returning id into v_order_id;

  insert into public.prediction_order_items (
    order_id,
    user_id,
    fixture_id,
    league,
    home_team,
    away_team,
    kickoff_at,
    status_at_prediction,
    market,
    direction,
    recommendation,
    confidence,
    score,
    grade,
    risk_label,
    suggested_percent,
    fair_odds,
    offered_odds,
    value_edge,
    odds_label,
    value_label,
    reason,
    data_basis
  )
  select
    v_order_id,
    p_user_id,
    item.fixture_id,
    item.league,
    item.home_team,
    item.away_team,
    item.kickoff_at,
    item.status_at_prediction,
    item.market,
    item.direction,
    item.recommendation,
    item.confidence,
    item.score,
    item.grade,
    item.risk_label,
    item.suggested_percent,
    item.fair_odds,
    item.offered_odds,
    item.value_edge,
    item.odds_label,
    item.value_label,
    item.reason,
    coalesce(item.data_basis, '[]'::jsonb)
  from jsonb_to_recordset(p_items) as item(
    fixture_id text,
    league text,
    home_team text,
    away_team text,
    kickoff_at timestamptz,
    status_at_prediction text,
    market text,
    direction text,
    recommendation text,
    confidence integer,
    score integer,
    grade text,
    risk_label text,
    suggested_percent numeric,
    fair_odds numeric,
    offered_odds numeric,
    value_edge numeric,
    odds_label text,
    value_label text,
    reason text,
    data_basis jsonb
  );

  order_id := v_order_id;
  credits_before := v_before;
  credits_after := v_after;
  return next;
end;
$$;

revoke all on function public.create_prediction_order(
  uuid, text, text, text, integer, integer, integer, numeric, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.create_prediction_order(
  uuid, text, text, text, integer, integer, integer, numeric, text, jsonb, jsonb, jsonb
) to service_role;
