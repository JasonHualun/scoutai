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
  fixture_id bigint not null,
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
