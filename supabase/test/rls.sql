\set ON_ERROR_STOP on
\set QUIET on
-- helpers ---------------------------------------------------------------------------------
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'lalit@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'sujata@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@example.com');

-- 1. household creation and joining ----------------------------------------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select id as hh from public.create_household('Alai family', array['Lalit','Sujata'], 'Lalit') \gset
select pg_temp.assert(public.my_household() = :'hh'::uuid, 'creator belongs to the household');
select invite_code as code from public.households where id = :'hh' \gset

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert(public.my_household() is null, 'second user is not yet a member');
do $$ begin
  begin perform public.join_household('WRONGCODE', 'Sujata'); raise exception 'bad invite code was accepted';
  exception when others then
    if sqlerrm not like '%not valid%' then raise exception 'unexpected: %', sqlerrm; end if;
  end;
end $$;
select id from public.join_household(:'code', 'Sujata') \gset
select pg_temp.assert(public.my_household() = :'hh'::uuid, 'joiner belongs to the same household');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select id as hh2 from public.create_household('Someone else', array['A','B'], 'A') \gset

-- 2. isolation between households ------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.bank_accounts (name, bank_name, owner) values ('HDFC Salary', 'HDFC Bank', 'Lalit');
insert into public.expenses (date, person, category, amount) values ('2026-09-01', 'Lalit', 'Groceries', 1200);
select pg_temp.assert((select count(*) from public.expenses) = 1, 'row inserted with default household_id');
select pg_temp.assert((select household_id from public.expenses limit 1) = :'hh'::uuid, 'household_id defaulted from session');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) from public.expenses) = 1, 'Sujata sees Lalit''s expense (same household)');
insert into public.expenses (date, person, category, amount, payment_method) values ('2026-09-02', 'Sujata', 'Dining', 800, 'meal_card');

select set_config('t.hh', :'hh', false);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.expenses) = 0, 'stranger sees nothing');
select pg_temp.assert((select count(*) from public.bank_accounts) = 0, 'stranger sees no banks');
do $$ begin
  insert into public.expenses (household_id, date, person, category, amount) values (current_setting('t.hh')::uuid, '2026-09-03','X','Y',1);
  raise exception 'stranger could insert into another household';
exception when insufficient_privilege or check_violation then null; end $$;
do $$ declare n int; begin
  update public.expenses set amount = 1; get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'stranger cannot update foreign rows'); end $$;
select pg_temp.assert((select count(*) from public.households) = 1, 'stranger only sees their own household row');

reset role;
select pg_temp.assert((select count(*) from public.expenses) = 2, 'both expenses exist for the owner household');

-- 3. SIP installments: unique per (sip, date); a skipped row is a tombstone ------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.sip_master (fund_name, category, amount, sip_day, start_date) values ('Test Flexi Cap', 'Flexi Cap', 5000, 5, '2026-06-01') returning id as sip \gset
insert into public.sip_installments (sip_id, due_date, amount) values (:'sip', '2026-06-05', 5000);
insert into public.sip_installments (sip_id, due_date, amount, status) values (:'sip', '2026-07-05', 5000, 'skipped');
-- the automatic job re-inserts the same dates: it must not duplicate or resurrect
insert into public.sip_installments (sip_id, due_date, amount, status, source)
  values (:'sip', '2026-06-05', 5000, 'paid', 'auto'), (:'sip', '2026-07-05', 5000, 'paid', 'auto'), (:'sip', '2026-08-05', 5000, 'paid', 'auto')
  on conflict (sip_id, due_date) do nothing;
select pg_temp.assert((select count(*) from public.sip_installments where sip_id = :'sip') = 3, 'idempotent upsert leaves 3 rows');
select pg_temp.assert((select status from public.sip_installments where sip_id = :'sip' and due_date = '2026-07-05') = 'skipped', 'tombstone preserved');
do $$ begin
  insert into public.sip_installments (sip_id, due_date, amount) values ((select id from public.sip_master limit 1), '2026-06-05', 1);
  raise exception 'duplicate installment accepted';
exception when unique_violation then null; end $$;

-- 4. constraints -----------------------------------------------------------------------------------
do $$ begin insert into public.expenses (date, person, category, amount, payment_method) values ('2026-09-01','Lalit','X',1,'cheque'); raise exception 'bad payment method accepted';
exception when check_violation then null; end $$;
do $$ begin insert into public.sip_master (fund_name, amount, sip_day, start_date) values ('x', 100, 32, '2026-01-01'); raise exception 'sip_day 32 accepted';
exception when check_violation then null; end $$;
do $$ begin insert into public.sip_master (fund_name, amount, sip_day, start_date) values ('x', 0, 5, '2026-01-01'); raise exception 'zero SIP accepted';
exception when check_violation then null; end $$;

-- 5. deleting a SIP removes its installments; deleting a holding removes its txns -------------------
insert into public.holdings (name, asset_type) values ('Test Fund', 'mutual_fund') returning id as hid \gset
insert into public.investment_txns (date, holding_id, amount) values ('2026-09-10', :'hid', 1000);
delete from public.holdings where id = :'hid';
select pg_temp.assert((select count(*) from public.investment_txns) = 0, 'txns cascade with holding');
delete from public.sip_master where id = :'sip';
select pg_temp.assert((select count(*) from public.sip_installments) = 0, 'installments cascade with SIP');

-- 6. EMI tombstone + prepayment -----------------------------------------------------------------
insert into public.emi_master (name, principal, interest_rate, tenure_months, emi_amount, outstanding_amount, outstanding_as_of, emi_day)
  values ('Home loan', 5000000, 8.5, 240, 43391, 4800000, '2026-09-01', 5) returning id as emi \gset
insert into public.emi_payments (emi_id, due_date, amount, status) values (:'emi', '2026-09-05', 43391, 'skipped');
insert into public.emi_payments (emi_id, due_date, amount) values (:'emi', '2026-09-05', 43391) on conflict (emi_id, due_date) do nothing;
select pg_temp.assert((select status from public.emi_payments) = 'skipped', 'EMI tombstone preserved');
insert into public.emi_prepayments (emi_id, date, amount) values (:'emi', '2026-09-10', 100000);

-- 7. anonymous access is blocked -------------------------------------------------------------------------
reset role; set role anon;
do $$ begin perform 1 from public.expenses; raise exception 'anon could read expenses';
exception when insufficient_privilege then null; end $$;
reset role;

-- 8. service role (daily job) can write for any household by naming it ------------------------------------
set role service_role;
insert into public.portfolio_snapshots (household_id, date, total_value) values (:'hh'::uuid, '2026-09-20', 123456);
insert into public.portfolio_snapshots (household_id, date, total_value) values (:'hh'::uuid, '2026-09-20', 999999)
  on conflict (household_id, date) do update set total_value = excluded.total_value;
select pg_temp.assert((select total_value from public.portfolio_snapshots) = 999999, 'snapshot upsert works');
reset role;

\echo ALL DATABASE TESTS PASSED
