# The Ledger

A private household wealth manager for two people (built for Lalit & Sujata; names are configurable): spending, salary, SIPs, EMIs, goals and the whole portfolio in one installable web app.

**Stack:** React 19 + Vite + Tailwind CSS v4 · Supabase (Postgres, Auth, row-level security) · Vercel (static hosting, one serverless function, one cron) · PWA (installable; APK via PWABuilder).

| Read this | For |
|---|---|
| [`DEPLOY.md`](DEPLOY.md) | Step-by-step: database, hosting, phone install, APK |
| [`INTEGRATIONS.md`](INTEGRATIONS.md) | Price feeds, goal-avenue data, CAS, what is manual |

## What is in it

| Area | What it does |
|---|---|
| **Home** | Net worth (investments − loans), this month's cash flow, upcoming SIPs/EMIs, goal progress |
| **Spend** | Expenses with payment method: Bank/UPI, Credit Card, Meal / Fuel / Telecom card (each from your card master); online-vs-physical purchase type + vendor; a **Credit Card Payment** category that settles a card's outstanding balance; add several transactions at once, or repeat one on a schedule (same or different amount each time); **bulk-import from a Paytm/GPay/bank statement PDF**. Dashboard: category pie, stacked spend-by-month, method/card/person breakdowns, filters everywhere |
| **Income** | Salary and other inflows by person, account and source (Salary, Rent, Dividend, Business, Capital Gains, …); one-tap "repeat last month's salary"; person/source filters |
| **Invest** | Dashboard, holdings, **SIP master** (fund, category, amount, date, bank, goal tag), manual "Add / withdraw" for extra investments, **CAS PDF import** (CDSL/NSDL/CAMS/KFintech) |
| **Goals** | Target, date, inflation, return → **monthly SIP needed**; rate scenarios; tag SIPs/investments from either side; suggested avenues by time horizon |
| **Loans** | **EMI master** (amount, rate, tenure, EMI, outstanding, deduction day) with **no-cost credit-card EMIs** tagged to a card, live amortisation, "pay extra" that shortens the end date, **optimiser** (avalanche / snowball / tax-aware, deadline solver with four funding modes, 12-month prepayment plan) |
| **Banks & cards** | Bank accounts for Lalit / Sujata / Joint; credit / meal / fuel / telecom cards with issuer, limit, live utilisation and outstanding-to-pay |
| **Home dashboard** | Net worth, last-6-months mix, a 14-day "coming up" list (scrolls past 5), a month-selectable money-mix pie and expense-category pie, income-vs-outflow for the month and for the whole financial year (Apr-Mar) |
| **Settings** | Household + invite code, planning assumptions, install help, daily-job log, backup |

### Automation rules

- Every SIP instalment and EMI is **posted by itself on its due date** (when the app opens, when it returns to the foreground, and by the 7 am server job). There is nothing to enter.
- Missed one? Open the SIP (or EMI) → **Missed - remove** on that month. It is kept as a "skipped" marker so automation never re-creates it; **Restore** brings it back.
- Only **additional** investments are typed in.
- Extra EMI repayments keep the EMI constant and pull the final date closer; the schedule is recomputed from the outstanding balance.

## Project layout

```
src/lib/        pure logic (dates, amortisation, schedules, goals, loans, portfolio, avenues, CAS parser), all unit-tested
src/data/       Supabase store, in-browser demo store, seed data
src/pages/      screens          src/components/  shell, charts, forms, ui kit
api/daily.js    Vercel function: automation + prices + snapshot (helpers in api/_lib/)
supabase/       schema.sql (tables, RLS, RPCs) and a Postgres-level RLS test
tests/          Vitest (120 tests)
```

## Commands

```bash
npm install
npm run dev        # no Supabase keys => demo mode with sample data
npm test           # unit tests
npm run test:db    # RLS tests on a throw-away local Postgres
npm run build      # production build (also generates the service worker + manifest)
```

## Design notes worth knowing

- **Baseline + flows.** A holding stores units/cost *as of a date* (e.g. the CAS date). SIP instalments and manual entries after that date are layered on at read time, so importing a new CAS can never double-count SIPs.
- **Household isolation.** Every table has `household_id default my_household()` and an RLS policy `household_id = my_household()`. The browser only ever holds the anon key.
- **Estimates are labelled.** SIP money whose NAV is not known yet is valued at cost and marked "recent instalments at cost"; holdings whose cost is not in a statement show "cost n/a" rather than a made-up gain.
- **Not financial advice.** Suggestions are rule-based and educational; expected returns are editable assumptions.
