# Deploying The Ledger

About 30 minutes, all free tiers, no credit card. You end up with:

- a website at `https://your-name.vercel.app` that you and Sujata both open on any device,
- your data in **your own Supabase (Postgres) database**, not inside Claude or anywhere I can see,
- an installable phone app (PWA) and, if you want one, an Android **APK**,
- a job that runs every morning (about 7 am IST) to post SIPs/EMIs and refresh prices.

```
 Phone / laptop (PWA)  ──►  Vercel  (static site + /api/daily function + daily cron)
        │                        │
        └────────────►  Supabase  (Postgres + login + row-level security)
                                 ▲
                       AMFI · mfapi.in · Yahoo Finance · GoldAPI (prices, fetched by the function)
```

---

## 1. Create the database (Supabase)

1. Sign up at <https://supabase.com> → **New project**. Pick the **Mumbai (ap-south-1)** region, set a strong database password (save it in a password manager; the app never needs it).
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, click **Run**. It is safe to run again later (everything is `if not exists`).
3. **Authentication → Providers → Email**: leave e-mail sign-in on. For the quickest start, switch **Confirm email** off (otherwise each of you must click a link in your inbox once).
4. **Project Settings → API** (or **API Keys**): copy three values.
   - **Project URL** – `https://abcd1234.supabase.co`
   - **anon / publishable key** – public by design; row-level security is what protects the data.
   - **service_role / secret key** – *powerful*. It goes only into Vercel's server-side environment variables (step 2). Never paste it into the app, a chat, or Git.

### How the two of you share data

Every table carries a `household_id`, and every row-level-security policy says `household_id = my_household()`. You sign up, tap **Start a household** (Member 1 = Lalit, Member 2 = Sujata, "I am" = you). Settings then shows an **invite code**. Sujata signs up with her own e-mail on her phone, taps **Join my partner**, enters the code and picks "Sujata". From then on you both see and edit the same data, and nobody else can see any of it.

Once you have both joined: **Authentication → Sign In / Providers → turn off "Allow new users to sign up"**. Nobody else can create an account (they could never see your data anyway, but there is no reason to leave the door open).

## 2. Host the app (Vercel)

1. Put the project in a **private** GitHub repo (`git init`, commit, push). Do **not** commit `.env` files (they are already in `.gitignore`).
2. <https://vercel.com> → **Add New → Project** → import the repo. Framework is detected as Vite; the defaults are right.
3. Before the first deploy, add **Environment Variables**:

   | Name | Value | Used by |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Project URL | browser |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key | browser |
   | `SUPABASE_URL` | Project URL | server function |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | server function only |
   | `CRON_SECRET` | any long random string (e.g. `openssl rand -hex 32`) | protects the daily cron |
   | `GOLDAPI_KEY` | *(optional)* key from goldapi.io | gold priced in grams |

   Anything starting with `VITE_` is baked into the public website; that is fine for the anon key and **wrong** for the service-role key, which is why the two have separate names.
4. **Deploy.** Then in Supabase **Authentication → URL Configuration** set **Site URL** to your Vercel address and add it under **Redirect URLs** (needed for "Forgot password" e-mails).
5. **Daily job.** `vercel.json` already registers `GET /api/daily` at 01:30 UTC (7:00 am IST). Vercel sends `CRON_SECRET` automatically. On the free **Hobby** plan a cron may run once a day and the exact minute within that hour is not guaranteed; that is fine for a job that only needs to run some time before you wake up. The run also keeps the free Supabase project from being paused for inactivity.

Prefer no GitHub? `npm i -g vercel && vercel` from the project folder does the same.

**Custom domain (optional):** Vercel → Project → Settings → Domains. Also add it to Supabase Redirect URLs.

## 3. Updating the app later (new features from Claude)

Every time Claude hands you a new batch of changes - new features, fixes, whatever - the same four steps apply. Nothing here is a one-off; use this each time.

1. **Get the new code into your project folder.** If Claude gave you a zip, unzip it over your existing project folder (or a fresh copy of it) so the changed files are replaced. If your repo already exists and Claude only describes a diff, apply those changes to the matching files. Either way, do this in your **local clone of your GitHub repo**, not a random folder - `git status` should show the changed files afterwards.
2. **Update the database, if `supabase/schema.sql` changed.** Open Supabase → **SQL Editor → New query**, paste the **entire** file (not just the new part), click **Run**. The whole file is written to be safe to run again on a live database with real data in it - it only ever *adds* columns, tables and indexes (`if not exists`), never renames or drops anything, so nothing you or Sujata have already entered is touched. If a run ever errors, stop and share the error rather than editing the SQL yourself - a hand-edited migration can lose the "safe to re-run" property.
3. **Commit and push.**
   ```bash
   git add -A
   git commit -m "Update: <short description>"
   git push
   ```
   Vercel is watching the repo and starts a new deployment automatically - usually done in under a minute. Watch it under the Vercel dashboard's **Deployments** tab; it should go green ("Ready"). No Vercel environment variables need to change for a normal feature update (only if Claude tells you a new one was added, e.g. for a new integration).
4. **Check it, then refresh the apps.**
   - Open the website in a browser first and click around the new bits.
   - **PWA on phone/laptop:** it self-updates in the background; if you do not see the new version, close the app fully and reopen it (or pull-to-refresh on Android).
   - **APK:** you do **not** need to rebuild it. The APK is a thin shell that always loads your live Vercel URL, so it picks up every update automatically the next time it is opened, with no store update or re-install needed.

**If something looks broken after an update:** Vercel keeps every previous deployment. Dashboard → **Deployments** → find the last good one → **⋯ → Promote to Production** to instantly roll back the website while you sort out the problem. This never touches the database, so do it without worrying about your data. (A schema change from step 2 is not automatically undone by this - that is one more reason schema changes are always additive-only.)

### First run checklist

1. Open the site → sign up → *Start a household* → note the invite code in **Settings**.
2. Sujata opens the same address on her phone → sign up → *Join my partner*.
3. **Banks & cards** – add your accounts and credit cards. **Invest → Import CAS** – upload the PDF (parsed inside your browser; the file is never uploaded). **Invest → SIPs**, **Loans → EMIs**, **Goals**.
4. Press **Refresh prices**. **Settings → Prices & automation** shows what each step did. If a fund says "no price source", open it and add its ISIN (the CAS import fills this in for you).

## 4. Put it on the phones

**Easiest (no APK):** the app is a PWA.
- **Android (Chrome):** menu ⋮ → **Install app** (or *Add to Home screen*). It gets its own icon, full-screen window and app-switcher entry, and updates itself.
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Laptop (Chrome/Edge):** the install icon in the address bar.

### Real APK with PWABuilder (Android)

Do this *after* the site is live on its final address; the APK is a thin wrapper that opens that address.

1. Go to <https://www.pwabuilder.com>, paste your Vercel URL, **Start**. It should show a valid manifest and service worker (both are generated by this project).
2. **Package for stores → Android**. Choose *Google Play* settings even if you never publish (it produces both the `.apk` and `.aab`).
   - **Package ID:** something unique, e.g. `com.rahul.ledger`.
   - **Signing key:** choose **New** and let PWABuilder generate it. **Download and keep the keystore file and its passwords** – you need the same key for every future update.
3. Download the zip. It contains `app-release-signed.apk` (install it on a phone), the `.aab` (only for Play Store) and an `assetlinks.json`.
4. **Hide the browser bar:** open the zip's `assetlinks.json` (or the "SHA-256 fingerprint" PWABuilder shows), copy its contents into `public/.well-known/assetlinks.json` in this project (a placeholder `[]` is there now), commit, push, and let Vercel redeploy. Without this step the APK still works but shows a small address bar at the top.
5. **Install on the phone:** send the `.apk` to yourselves (Drive, WhatsApp "document", USB), open it, allow *Install unknown apps* for that app when Android asks. Play Protect may warn about an unknown developer; that is expected for a private APK.

Google Play publishing needs a one-time US$25 developer fee and a review; you do not need it for two phones. If PWABuilder gives you trouble, `npx @bubblewrap/cli init --manifest https://YOUR-URL/manifest.webmanifest` is the command-line route to the same result.

## 5. Running it locally (optional)

```bash
npm install
cp .env.example .env.local      # fill the VITE_ values
npm run dev                     # http://localhost:5173  (no keys = demo mode with sample data)
npx vercel dev                  # also serves /api/daily locally (needs the server env vars)
npm test                        # 120 unit tests
npm run test:db                 # row-level-security tests against a throw-away local Postgres (needs `apt install postgresql`)
```

## 6. Looking after it

- **Backups:** Settings → **Download a backup (JSON)**. Do it monthly. The Supabase free plan does not include point-in-time recovery, so this is your safety net. (Supabase's own Project → Database → Backups page lists what your plan includes.)
- **Free-tier limits (as of writing; check the providers' pricing pages):** Supabase free ≈ 500 MB database (this app uses a few MB per year) and pauses projects after about a week with *no* activity; the daily job counts as activity. Vercel Hobby is for personal, non-commercial use, which this is.
- **Rotating secrets:** if the service-role key or `CRON_SECRET` ever leaks, regenerate it in Supabase / Vercel and redeploy. The anon key cannot read anything without a login.
- **Updating the app or its schema:** see section 3 above - the short version is: get the new files into your repo, re-run `supabase/schema.sql` in the SQL editor if it changed, `git push`, Vercel redeploys automatically.
- **Leaving:** it is plain Postgres. Supabase → Database → Backups, or `pg_dump`, gives you everything.

## 7. Troubleshooting

| Symptom | Likely cause |
|---|---|
| App shows "Connect your own database" | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing at *build* time. Add them in Vercel and **redeploy** (they are read during the build). |
| "Refresh prices" says *Server is missing SUPABASE_URL…* | Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel, redeploy. |
| "Refresh prices" says *Not signed in* | Your session expired: sign out and in again. |
| Reset-password e-mail opens a wrong page | Site URL / Redirect URLs in Supabase (step 2.4). |
| Sign-up says e-mail confirmation needed | Either click the link in the e-mail, or switch off *Confirm email* (step 1.3). |
| A fund keeps "recent instalments at cost" | Its NAV history could not be matched: open the fund and check the ISIN / AMFI scheme code, then Refresh prices. |
| Job log shows Yahoo Finance failing | Yahoo's free endpoint is unofficial and sometimes throttles cloud IPs. Retry later; see INTEGRATIONS.md for alternatives. |
