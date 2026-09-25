-- =====================================================================================
--  THE LEDGER - database schema for Supabase (PostgreSQL)
--  Paste this whole file into  Supabase Dashboard -> SQL Editor -> New query -> Run.
--  It is safe to run again later (everything is "if not exists" / "or replace").
--
--  Security model: every table carries a household_id and Row Level Security lets a
--  signed-in user see and change ONLY rows of their own household. Lalit and Sujata each
--  have their own login and both belong to the same household.
-- =====================================================================================

create extension if not exists pgcrypto;

-- ---------- households & membership ---------------------------------------------------
create table if not exists public.households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Our Household',
  members      text[] not null default array['Lalit','Sujata'],   -- names offered in every "person" dropdown
  invite_code  text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  settings     jsonb not null default '{}'::jsonb,                -- return assumptions, tax slab, etc.
  created_at   timestamptz not null default now()
);

create table if not exists public.household_members (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  member_name   text not null,                                    -- which of households.members this login is
  created_at    timestamptz not null default now(),
  unique (household_id, member_name)
);

-- The household of the signed-in user (used by RLS and as a column default).
create or replace function public.my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

create or replace function public.create_household(p_name text, p_members text[], p_me text)
returns public.households
language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;
  if p_members is null or array_length(p_members, 1) is null then raise exception 'Add at least one member name'; end if;
  if not (p_me = any (p_members)) then raise exception 'Choose which member you are'; end if;
  insert into households (name, members) values (coalesce(nullif(trim(p_name), ''), 'Our Household'), p_members) returning * into h;
  insert into household_members (user_id, household_id, member_name) values (auth.uid(), h.id, p_me);
  return h;
end $$;

create or replace function public.join_household(p_code text, p_me text)
returns public.households
language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;
  select * into h from households where invite_code = upper(trim(p_code));
  if not found then raise exception 'That invite code is not valid'; end if;
  if not (p_me = any (h.members)) then raise exception 'Choose one of: %', array_to_string(h.members, ', '); end if;
  if exists (select 1 from household_members where household_id = h.id and member_name = p_me) then
    raise exception '% has already joined - pick the other name', p_me;
  end if;
  insert into household_members (user_id, household_id, member_name) values (auth.uid(), h.id, p_me);
  return h;
end $$;

-- ---------- generic helpers -----------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- masters -------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  name          text not null,                    -- nickname, e.g. "HDFC Salary"
  bank_name     text not null,
  owner         text not null,                    -- a member name, or 'Joint'
  account_type  text not null default 'Savings',
  last4         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.credit_cards (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null default public.my_household() references public.households(id) on delete cascade,
  name           text not null,                   -- e.g. "HDFC Regalia"
  issuing_bank   text not null,
  credit_limit   numeric(14,2) not null default 0,
  owner          text,
  last4          text,
  billing_day    int check (billing_day between 1 and 31),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.goals (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null default public.my_household() references public.households(id) on delete cascade,
  name             text not null,
  goal_type        text not null default 'other',
  target_amount    numeric(16,2) not null,        -- in today's money if inflation_pct > 0
  target_date      date,
  expected_return  numeric(5,2) not null default 12,   -- annual %, the rate used for the SIP suggestion
  inflation_pct    numeric(5,2) not null default 0,
  step_up_pct      numeric(5,2) not null default 0,
  manual_amount    numeric(16,2) not null default 0,   -- savings counted toward the goal that are not in holdings
  priority         int not null default 3,
  notes            text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------- investments ---------------------------------------------------------------
-- A holding stores a BASELINE (units + invested as of baseline_date, e.g. the CAS date).
-- Later SIP installments and manual additional investments are layered on top by the app.
create table if not exists public.holdings (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null default public.my_household() references public.households(id) on delete cascade,
  name             text not null,
  asset_type       text not null default 'mutual_fund'
                   check (asset_type in ('mutual_fund','equity','etf','gold','ppf','epf','nps','fd','real_estate','other')),
  category         text,
  person           text,                          -- member name or 'Joint'
  isin             text,
  amfi_code        text,                          -- AMFI scheme code, used for the daily NAV
  ticker           text,                          -- Yahoo Finance symbol, e.g. RELIANCE.NS
  folio_no         text,
  dp_name          text,
  dp_ref           text,                          -- last 4 of the demat id (never the full number)
  units            numeric(20,6),
  invested_amount  numeric(16,2) not null default 0,
  price            numeric(16,4),                 -- latest NAV / price
  price_date       date,
  current_value    numeric(16,2),                 -- for assets without units (PPF, EPF, FD ...)
  baseline_date    date,
  cost_known       boolean not null default true, -- false for demat rows imported from a CAS (no cost in the statement)
  goal_id          uuid references public.goals(id) on delete set null,
  source           text not null default 'manual', -- manual | cas | sip
  active           boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists holdings_household_idx on public.holdings(household_id);
create index if not exists holdings_isin_idx on public.holdings(isin);

create table if not exists public.sip_master (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  fund_name     text not null,
  category      text,
  amount        numeric(14,2) not null check (amount > 0),
  sip_day       int not null check (sip_day between 1 and 31),
  start_date    date not null,
  end_date      date,
  person        text,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  goal_id       uuid references public.goals(id) on delete set null,
  holding_id    uuid references public.holdings(id) on delete set null,
  amfi_code     text,
  isin          text,
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per SIP per due date. status 'paid' is created automatically on the SIP date.
-- If a month was missed the user deletes it in the app, which stores status 'skipped' - a
-- tombstone, so the automatic job never re-creates it.
create table if not exists public.sip_installments (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  sip_id        uuid not null references public.sip_master(id) on delete cascade,
  due_date      date not null,
  amount        numeric(14,2) not null,
  status        text not null default 'paid' check (status in ('paid','skipped')),
  source        text not null default 'auto' check (source in ('auto','manual')),
  nav           numeric(16,4),
  units         numeric(20,6),
  nav_date      date,
  created_at    timestamptz not null default now(),
  unique (sip_id, due_date)
);
create index if not exists sip_inst_household_idx on public.sip_installments(household_id, due_date);

create table if not exists public.investment_txns (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  date          date not null,
  holding_id    uuid not null references public.holdings(id) on delete cascade,
  kind          text not null default 'additional' check (kind in ('additional','withdrawal')),
  amount        numeric(16,2) not null check (amount > 0),
  units         numeric(20,6),
  nav           numeric(16,4),
  person        text,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists inv_txn_household_idx on public.investment_txns(household_id, date);

create table if not exists public.portfolio_snapshots (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  date          date not null,
  total_value   numeric(16,2) not null,
  invested      numeric(16,2) not null default 0,
  by_class      jsonb not null default '{}'::jsonb,
  by_person     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (household_id, date)
);

-- ---------- loans ---------------------------------------------------------------------
create table if not exists public.emi_master (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null default public.my_household() references public.households(id) on delete cascade,
  name                text not null,
  lender              text,
  loan_type           text not null default 'Home Loan',
  person              text,
  principal           numeric(16,2) not null,       -- total loan amount originally sanctioned
  interest_rate       numeric(6,3) not null,        -- annual %
  tenure_months       int not null,                 -- original tenure
  emi_amount          numeric(14,2) not null,
  outstanding_amount  numeric(16,2) not null,       -- principal outstanding as of outstanding_as_of
  outstanding_as_of   date not null default current_date,
  emi_day             int not null check (emi_day between 1 and 31),
  bank_account_id     uuid references public.bank_accounts(id) on delete set null,
  tax_deductible      boolean not null default false,
  active              boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.emi_payments (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  emi_id        uuid not null references public.emi_master(id) on delete cascade,
  due_date      date not null,
  amount        numeric(14,2) not null default 0,
  status        text not null default 'paid' check (status in ('paid','skipped')),
  source        text not null default 'auto' check (source in ('auto','manual')),
  created_at    timestamptz not null default now(),
  unique (emi_id, due_date)
);
create index if not exists emi_pay_household_idx on public.emi_payments(household_id, due_date);

create table if not exists public.emi_prepayments (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  emi_id        uuid not null references public.emi_master(id) on delete cascade,
  date          date not null,
  amount        numeric(14,2) not null check (amount > 0),
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);

-- ---------- cash-flow -----------------------------------------------------------------
create table if not exists public.income (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  date          date not null,
  person        text not null,
  source        text not null,                    -- Salary, Bonus, Rent ...
  amount        numeric(14,2) not null check (amount >= 0),
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists income_household_idx on public.income(household_id, date);

create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null default public.my_household() references public.households(id) on delete cascade,
  date            date not null,
  person          text not null,
  category        text not null,
  note            text,
  amount          numeric(14,2) not null check (amount >= 0),
  payment_method  text not null default 'bank_upi'
                  check (payment_method in ('bank_upi','credit_card','meal_card','fuel_card','telecom_card')),
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  credit_card_id  uuid references public.credit_cards(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists expenses_household_idx on public.expenses(household_id, date);

-- ---------- job log (shown in Settings) -----------------------------------------------
create table if not exists public.job_log (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references public.households(id) on delete cascade,
  ran_at        timestamptz not null default now(),
  task          text not null,
  ok            boolean not null default true,
  message       text
);

-- ---------- updated_at triggers -------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['bank_accounts','credit_cards','goals','holdings','sip_master','emi_master'] loop
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- Row Level Security --------------------------------------------------------
alter table public.households          enable row level security;
alter table public.household_members   enable row level security;

drop policy if exists hh_select on public.households;
create policy hh_select on public.households for select to authenticated using (id = public.my_household());
drop policy if exists hh_update on public.households;
create policy hh_update on public.households for update to authenticated using (id = public.my_household()) with check (id = public.my_household());

drop policy if exists hm_select on public.household_members;
create policy hm_select on public.household_members for select to authenticated using (household_id = public.my_household());

do $$
declare t text;
begin
  foreach t in array array[
    'bank_accounts','credit_cards','goals','holdings','sip_master','sip_installments','investment_txns',
    'portfolio_snapshots','emi_master','emi_payments','emi_prepayments','income','expenses','job_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists hh_all on public.%I', t);
    execute format(
      'create policy hh_all on public.%I for all to authenticated using (household_id = public.my_household()) with check (household_id = public.my_household())', t);
  end loop;
end $$;

-- =====================================================================================
--  MIGRATION (Sep 2026) - additive only, safe to run on an already-live database.
--  New: card kinds (meal/fuel/telecom, not just credit), no-cost EMIs tagged to a card,
--  expense purchase channel + vendor, and "Credit Card Payment" settlement tracking.
-- =====================================================================================
alter table public.credit_cards add column if not exists kind text not null default 'credit';
alter table public.credit_cards drop constraint if exists credit_cards_kind_check;
alter table public.credit_cards add constraint credit_cards_kind_check check (kind in ('credit','meal','fuel','telecom'));
-- a "limit" is optional/meaningless for a prepaid meal/fuel/telecom card
alter table public.credit_cards alter column credit_limit drop not null;
alter table public.credit_cards alter column credit_limit drop default;

alter table public.emi_master add column if not exists emi_kind text not null default 'loan';
alter table public.emi_master drop constraint if exists emi_master_kind_check;
alter table public.emi_master add constraint emi_master_kind_check check (emi_kind in ('loan','card_emi'));
alter table public.emi_master add column if not exists credit_card_id uuid references public.credit_cards(id) on delete set null;

alter table public.expenses add column if not exists channel text;
alter table public.expenses drop constraint if exists expenses_channel_check;
alter table public.expenses add constraint expenses_channel_check check (channel is null or channel in ('online','physical'));
alter table public.expenses add column if not exists vendor text;
-- which card a 'Credit Card Payment' expense settles (distinct from credit_card_id, which is how it was PAID)
alter table public.expenses add column if not exists settles_card_id uuid references public.credit_cards(id) on delete set null;
create index if not exists expenses_settles_card_idx on public.expenses(settles_card_id) where settles_card_id is not null;

-- Nothing is readable without signing in.
revoke all on all tables in schema public from anon;
revoke execute on function public.create_household(text, text[], text) from public, anon;
revoke execute on function public.join_household(text, text) from public, anon;
grant  execute on function public.create_household(text, text[], text) to authenticated;
grant  execute on function public.join_household(text, text) to authenticated;
grant  execute on function public.my_household() to authenticated;
