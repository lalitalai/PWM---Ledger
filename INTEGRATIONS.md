# Integration requirements

This answers two of your questions directly:

- **#11 "Update the portfolio value daily from the internet - what do you need?"** → section 1
- **#10 "Goal tracker should suggest other avenues of investment - what do you need?"** → section 2

Section 3 covers the CAS import (#14) and section 4 what deliberately stays manual.

Short version: **everything works with free, key-less public sources.** The only optional key is GoldAPI (for gold held in grams). The only secrets are your own Supabase service-role key and a cron secret, both stored in Vercel.

---

## 1. Daily portfolio value (#11)

### What runs

`api/daily.js` (a Vercel serverless function) runs every morning at about 7:00 am IST via Vercel Cron, and whenever either of you taps **Refresh prices**. For each household it does, in order:

1. posts SIP instalments and EMI payments that fell due (same engine the app runs on open),
2. refreshes prices (table below),
3. fills the **exact NAV and units** for each SIP instalment,
4. stores a portfolio snapshot for the "value over time" chart,
5. writes one line per step to `job_log` (Settings → Prices & automation).

A failure in one step is logged and never blocks the others. Estimates are always labelled: a holding without a price source is listed as such, and recent SIP money whose NAV is not known yet is valued *at cost* and marked "recent instalments at cost".

### Sources

| Asset | Source | Key needed | Matched by | Notes |
|---|---|---|---|---|
| Mutual funds (latest NAV) | **AMFI `NAVAll.txt`** – `https://www.amfiindia.com/spages/NAVAll.txt` (official, all ~15,000 schemes in one file) | none | ISIN, or AMFI scheme code | Published nightly, usually by late evening, so the 7 am run picks up the previous business day's NAV. The first successful match stores the scheme code on the holding. |
| Mutual funds (NAV *on a past date*, for SIP units) | **mfapi.in** – `https://api.mfapi.in/mf/{schemeCode}` (free community API, full history) | none | AMFI scheme code | Instalments are allotted at the due-date NAV, or the next business day's when the date is a weekend/holiday (how AMCs process SIPs). If that NAV is not out yet, the previous NAV is used provisionally and replaced on a later run. |
| Shares and ETFs | **Yahoo Finance** chart endpoint `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}` and search endpoint (finds the ticker from an ISIN) | none | ticker such as `INFY.NS`, or ISIN | **Unofficial**: no SLA, can throttle cloud IPs, could change without notice. Prices in non-INR are ignored. |
| Gold held in grams (SGB, physical) | **GoldAPI.io** `/api/XAU/INR` (24k price per gram) | `GOLDAPI_KEY` (free tier is small but enough for one call a day) | – | Enter 24k-equivalent grams as "units". If you hold a **Gold ETF or gold fund** instead, no key is needed: it is priced like any other ETF/fund. |
| PPF, EPF/VPF, NPS, FD/RD, real estate, other | **none** | – | – | No public API exists for these. Enter the balance from the passbook or e-passbook when it changes (Investments → Holdings → edit). See section 4. |

### What you must provide

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Vercel, server side only) so the job can write for both of you without a browser session. The key is used only inside `api/`, and every query is scoped to one household.
- `CRON_SECRET` so nobody else can trigger the cron endpoint.
- `GOLDAPI_KEY` *(optional)*.
- On each holding, at least one identifier: **ISIN** (best; the CAS import fills it in), or AMFI scheme code (funds), or Yahoo ticker (shares/ETFs).
- Outbound HTTPS from Vercel to `amfiindia.com`, `api.mfapi.in`, `query1.finance.yahoo.com`, `goldapi.io` (allowed by default on Vercel).

### Privacy

Only ISINs, scheme codes and tickers leave your database, to public price sources. No amounts, names, folios or personal data are sent anywhere.

### Limits and honest caveats

- Prices are **end-of-day**, not live ticks.
- The AMFI and mfapi.in feeds are the most dependable; Yahoo is the weakest link. If it starts failing, the job log says so and the last known price stays. Drop-in alternatives are a keyed provider (Twelve Data, Alpha Vantage, a broker API such as Zerodha Kite Connect); the change is confined to `fetchYahooPrice` in `api/_lib/prices.js`.
- Units are computed as `amount ÷ NAV`; the tiny stamp duty on purchases (0.005%) is ignored, so units can differ from the statement in the 4th decimal. Importing a fresh CAS resets the baseline to the statement's exact numbers.
- Vercel Hobby cron runs once a day at hour precision.
- **I could not reach these endpoints from my build environment (its outbound network is allow-listed), so the parsers are tested against fixtures that follow the documented formats, not against live responses.** The first time you press Refresh prices after deploying is the real test; Settings → Prices & automation will say exactly what happened.

---

## 2. Goal tracker: SIP suggestions and other investment avenues (#9, #10)

### The SIP amount

Pure maths, no integration: target amount (optionally inflated to the target date) minus the corpus already tagged to the goal, solved for a monthly SIP at the return you pick, with optional yearly step-up. You can compare several return rates side by side.

### The "other avenues" suggestions

Rule-based and **fully offline**: the app maps *time left to the goal* (and goal type: emergency, education, retirement…) to a suggested equity/debt/gold split and a ranked list of asset classes and fund *categories* (liquid funds, short-duration debt, balanced advantage, index funds, PPF, EPF/VPF, NPS, SSY, gold ETF/SGB, FD ladder…), each with risk, expected-return range, why, and where to buy.

**Integration requirements: none to run.** What does need upkeep are the *rates the suggestions assume*, which you can edit in **Settings → Planning assumptions**:

| Assumption | Default | Where it comes from | Update when |
|---|---|---|---|
| PPF | 7.1% | Government-notified; reported unchanged for Jul–Sep 2026 | every quarter (next announcement is due around 30 Sep for Oct–Dec) |
| Sukanya Samriddhi | 8.2% | same notification | every quarter |
| EPF | 8.25% | EPFO's declared rate for FY 2025-26 | once a year |
| Equity / hybrid / debt / liquid / gold / NPS / inflation | 12 / 10 / 7 / 6.5 / 8 / 10 / 6 % | long-run planning assumptions, **not forecasts** | whenever you change your mind |

There is no free official API for small-savings or FD rates, so these are a setting rather than a feed. (If you ever want a feed, the realistic options are scraping the India Post / bank rate pages, which is brittle, or a paid data vendor.)

### What it deliberately does *not* do

It recommends **categories, not named funds**. Naming specific funds for a person is regulated investment advice in India (SEBI-registered advisers), and fund-ranking data (Morningstar, Value Research, Kuvera) has no free API. The output is educational guidance; pick the actual fund yourself or with a registered adviser.

### Tagging SIPs to goals

Available from both sides: on the SIP (goal drop-down) and in the goal (Goals → **Tag SIPs & investments** on the goal card). A goal's corpus is the value of every holding tagged to it or fed by a SIP tagged to it.

---

## 3. CAS upload (#14)

- Accepts the **PDF** consolidated account statement from **CDSL, NSDL, CAMS or KFintech**. It is read **inside your browser** with PDF.js; the file is never uploaded to Vercel or Supabase.
- If the PDF is password-protected (the usual PAN + date-of-birth pattern), the app asks for the password, uses it once in memory and never stores it.
- It extracts fund/share names, ISINs, folios, units and values, checks them against the totals printed in the statement, shows a preview, and lets you choose what to import. PAN, e-mail, phone, address and nominee lines are never read.
- Tested on the CDSL sample you sent. NSDL and CAMS layouts share the same structure but have **not** been tested with real files; if a statement misparses, the preview screen shows the reconciliation difference so you can see it before importing.
- Automatic CAS delivery (monthly e-mail from CDSL/NSDL) would need an e-mail integration (Gmail API or an inbound-mail service); not built. Download the PDF monthly and upload it; the import replaces the baseline without double-counting SIPs (see the design note in `src/lib/portfolio.js`).

---

## 3b. Statement upload for expenses

**Spend → Import** reads a Google Pay or Paytm transaction-history PDF, a bank statement PDF, or a bank/UPI **CSV** export, and turns it into a reviewable table of candidate expenses - nothing is saved until you tick rows and press Import. Like the CAS upload, everything happens **inside your browser** with PDF.js; the file is never uploaded anywhere.

- **How it recognises a file.** There is no single "universal" layout - every bank and app prints dates, amounts and columns differently - so this is a short chain of purpose-built readers, tried in order, each one only claiming a file when it is confident: Google Pay's dated blocks, Paytm's blocks (including its own `# Tag` categories, mapped to this app's categories), then a bank-agnostic ledger-table reader, then a plain CSV reader, then a generic best-effort line scanner as the last resort. The app tells you which one matched ("Detected as: Paytm", etc.) so you know how much to trust it.
- **The bank-ledger reader doesn't need to recognise your bank.** Classic Indian bank statements print a Withdrawal/Deposit or Debit/Credit column pair (plus a running Balance); some print the column headers as real text, some (seen in practice: an SBI export) draw them as a graphic with no text at all. Rather than hard-coding column names, it looks at where each row's one real amount actually sits, finds the gap that splits all the amounts on the page into a left group and a right group, and calls the left group debit, the right credit - the universal convention every Indian statement follows. A statement whose amounts don't split that way isn't this layout, and it is left to the generic fallback instead of a wrong guess. It also recognises the simpler single-Amount-column-with-`(Dr)`/`(Cr)`-suffix style some banks (e.g. Union Bank) use.
- **Password-protected PDFs work.** Bank/UPI statements are routinely locked with your PAN, account number or date of birth; the app asks for the password, uses it once in memory (via PDF.js) and never stores it - the same flow the CAS import already uses.
- **CSV vs PDF.** Prefer a CSV export when your bank or app offers one - its columns are unambiguous, so it is read exactly, no guessing. A PDF is still the common case (most apps only offer a PDF), and is fully supported; recognition there is always best-effort, which is why every row is shown for review before anything is saved.
- **Duplicate detection across statements.** The same transaction often shows up twice - once in a UPI app's history and again as a line in the underlying bank statement. Every parsed row that carries a UPI reference / transaction ID is checked against already-saved expenses (the ref is tucked onto the saved expense's own note, e.g. "Hariom sweets · ref:316011459239" - no schema change needed); a likely repeat is shown with a "maybe duplicate" badge and left unticked. This only catches a duplicate against **expenses already in the app** - uploading two overlapping statements in the same sitting still needs you to glance down the list, since recognising it is best-effort, not a guarantee.
- **Money that isn't spending is caught too, not just repeated statements.** Before the review table appears, every debit is reconciled against what the app already tracks: an auto-posted **SIP instalment** or **EMI** with the same amount within 5 days (a SIP dated the 5th is often debited on the 6th-8th), an **additional investment** you typed in under Invest, or an **expense you entered by hand** with the same amount on the same day. A match is shown as "already tracked · SIP" (etc.) with the exact SIP/loan/holding it matched, and left unticked. Each recorded item can absorb only one statement line, so two ₹4,000 SIPs on the same day match two debits, not one. Even when nothing is recorded yet, a debit whose description says it is a broker/mutual-fund/NPS/APY/PPF payment (Zerodha, Groww, NSE Clearing, NACH-MUT…), a loan EMI, a credit-card bill payment (CRED, CheQ, card bill) or a transfer to a household member is unticked with the reason shown, and points you to where it belongs instead (Invest → Add / withdraw for an untracked top-up). Employer-credited SIPs (EPF/NPS) and credit-card EMIs are never matched against a bank debit, because they never appear on one. Banks shorten names ("suj kothav"), so the review screen has a **"Your names as banks print them"** box - aliases added there are saved in household settings and also used for every future import.
- **Every imported row is tied to the account it came from.** A bank statement is one account, recognised from the account number on its first page (matched against the last 4 digits in Banks & cards; masked numbers like "XXXXXX3669" work too), or picked once at the top of the review screen. Google Pay and Paytm print the paying account on every row ("Paid by Kotak Mahindra Bank 8716"; Paytm's "ICICI Bank - 69"), so those rows are matched one by one. The spender defaults to that account's owner, and nothing imports while a ticked row has no account.
- **Credit-card bill payments are mapped to the card they pay.** A CRED / CheQ / card-bill line is pre-set to the Credit Card Payment category with a "pays which card?" picker. The card is filled in when the narration gives it away (the card's last 4, or the issuer on a direct payment) or when you only have one credit card; CRED's own collecting bank (Axis) is deliberately ignored. Once mapped, the payment lowers that card's outstanding and is not counted as spending.
- **A CAS (holdings) statement is recognised and declined**, not misparsed - if you drop a CDSL/NSDL/CAMS/KFintech CAS PDF here by mistake, the app tells you to use Invest → Import CAS instead rather than inventing nonsense "expense" rows from it.
- **What hasn't been tested on real files from every issuer.** The three samples this was built and verified against (Google Pay, Paytm, and ICICI/Kotak/SBI/Union Bank statements) all came back with amounts matching the bank's own printed totals, but a bank or app never seen before may still only partially match, or fall through to the generic reader - which is exactly why every row is reviewable, never auto-imported.

---

## 4. What stays manual, and why

| Item | Why | Suggested rhythm |
|---|---|---|
| PPF / EPF / NPS / FD balances | No public API; India's Account Aggregator framework is open only to registered institutions, not to a personal app | when the passbook or e-passbook updates (quarterly is plenty) |
| Salary and other income | Logged by hand; the **Repeat last month's salary** button on Income makes it one tap | monthly |
| Expenses | A Paytm/GPay/bank statement PDF or CSV can be bulk-imported (see #3b above) and reviewed before saving; there's no automatic bank-SMS parsing | as they happen, or in a batch from a statement |
| Additional investments (beyond SIPs) | By design (#3): only extras are typed in | as they happen |
| Real estate / vehicles | No feed | yearly |

## 5. Ideas for later (not built)

An e-mail/SMS parser for card transactions (so nothing needs a statement upload at all); automatic monthly CAS via e-mail; push notifications for upcoming EMIs; a second price provider as automatic fallback for shares.
