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
  amount numeric not null default 39.9,
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
