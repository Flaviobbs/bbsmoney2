
-- Enums
create type public.transaction_type as enum ('income', 'expense');
create type public.account_type as enum ('checking', 'savings', 'credit', 'cash', 'investment');
create type public.bill_status as enum ('pending', 'paid', 'overdue', 'cancelled');
create type public.recurrence_type as enum ('none', 'weekly', 'monthly', 'yearly');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.transaction_type not null,
  color text not null default '#a855f7',
  icon text not null default 'Tag',
  created_at timestamptz not null default now()
);
create index on public.categories(user_id);

-- Accounts
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.account_type not null default 'checking',
  initial_balance numeric(14,2) not null default 0,
  color text not null default '#a855f7',
  created_at timestamptz not null default now()
);
create index on public.accounts(user_id);

-- Transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  type public.transaction_type not null,
  amount numeric(14,2) not null check (amount >= 0),
  description text not null default '',
  date date not null default current_date,
  created_at timestamptz not null default now()
);
create index on public.transactions(user_id, date desc);

-- Bills
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  due_date date not null,
  status public.bill_status not null default 'pending',
  recurrence public.recurrence_type not null default 'none',
  type public.transaction_type not null default 'expense',
  paid_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.bills(user_id, due_date);

-- Budgets
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null,
  limit_amount numeric(14,2) not null check (limit_amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);
create index on public.budgets(user_id, month);

-- Goals
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0,
  deadline date,
  created_at timestamptz not null default now()
);
create index on public.goals(user_id);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.bills enable row level security;
alter table public.budgets enable row level security;
alter table public.goals enable row level security;

-- RLS policies (per-user)
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Helper macro repeated for each user-owned table
create policy "categories_all_own" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "accounts_all_own" on public.accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_all_own" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bills_all_own" on public.bills for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budgets_all_own" on public.budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_all_own" on public.goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile + default categories + default account on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  -- Default expense categories
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Alimentação', 'expense', '#f97316', 'Utensils'),
    (new.id, 'Moradia', 'expense', '#0ea5e9', 'Home'),
    (new.id, 'Transporte', 'expense', '#22c55e', 'Car'),
    (new.id, 'Lazer', 'expense', '#a855f7', 'Gamepad2'),
    (new.id, 'Saúde', 'expense', '#ef4444', 'HeartPulse'),
    (new.id, 'Educação', 'expense', '#eab308', 'GraduationCap'),
    (new.id, 'Compras', 'expense', '#ec4899', 'ShoppingBag'),
    (new.id, 'Outros', 'expense', '#64748b', 'Tag');

  -- Default income categories
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Salário', 'income', '#22c55e', 'Briefcase'),
    (new.id, 'Freelance', 'income', '#a855f7', 'Laptop'),
    (new.id, 'Investimentos', 'income', '#0ea5e9', 'TrendingUp'),
    (new.id, 'Outras receitas', 'income', '#64748b', 'PlusCircle');

  -- Default account
  insert into public.accounts (user_id, name, type, initial_balance, color)
  values (new.id, 'Conta Principal', 'checking', 0, '#a855f7');

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
