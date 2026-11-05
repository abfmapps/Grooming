# ABFM Grooming Control

Two free apps for the **Al Bonian FM Grooming, Etiquette & Work Efficiency Policy**, built like ABFM Training: plain web pages on GitHub Pages that install on phones like an app.

- **Checklist app** (supervisors, FM Managers, Camp Boss, Site Managers): `https://abfmapps.github.io/Grooming/`
- **Management dashboard** (Director, OCO, HSE, HR, Stores, FM Managers): `https://abfmapps.github.io/Grooming/admin.html`

Sign-in works like ABFM Training:
- **Checklist app users** (Camp Boss, HSE, Supervisors, Site Managers) sign in with their **HR number**. No password. Admins add them in the dashboard.
- **Dashboard admins** (OCO, Director, HR, Stores, FM Managers) sign in with their **email and a password** they choose.
- The **super admin** is the OCO (`zarrade.omar@gmail.com`). Only the super admin can add or remove dashboard admins. The OCO and the Director can add checklist app users.
- The OCO and FM Managers can also open the checklist app with their email sign-in.

**Where the data lives:** in a **Supabase** database (project *Grooming App*), never in this repo. The pages only talk to one Edge Function, `api`, which checks each person's sign-in, role and sites. The tables sit in a private `grooming` schema that the internet can't reach directly. Check photos are kept in a private Supabase Storage bucket.

---

## 1. How it's connected

- **Database:** `supabase/migrations/` creates the tables (one per area: sites, users, employees, checks, supply, submissions, audits, actions, incidents, discipline, activity, settings).
- **Backend:** `supabase/functions/api/`. It runs the backend logic in [`setup/grooming-backend.gs`](setup/grooming-backend.gs) (the same file the local test server uses) on Postgres. After changing that file, run `node supabase/build.mjs` and deploy the `api` function again (with JWT verification off: the function checks sign-ins itself).
- **App:** [`config.js`](config.js) holds the function's address.

The data was moved here from the original Google Sheet on 5 November 2026. The Sheet is no longer used and can be kept as an archive.

**Daily email summary:** not available yet since the move (Supabase doesn't send email on its own). The rest of the app is unaffected.

## 2. Set up your people

1. **First time only (super admin):** open the dashboard, choose **Create an admin account**, use `zarrade.omar@gmail.com` and pick a password. Confirm it from the email Supabase sends, then sign in.
2. **Sites, users & rules → Sites:** add your sites.
3. **Employees → Import from Excel / CSV:** paste these columns from Excel: **staff number, name, trade, site, uniform size, shoe size** (and accommodation for camp checks).
4. **Sites, users & rules → Checklist app users:** add each Camp Boss, HSE officer, supervisor and site manager with their **HR number**, role and sites.
5. **Dashboard admin** tab (super admin only): add each admin's email and role. They then open the dashboard, choose **Create an admin account** with that email, and confirm it.
6. **Rules & daily email:** check the policy rules and the checklist due time.

In Supabase → **Authentication → URL Configuration**, set the Site URL to `https://abfmapps.github.io/Grooming/admin.html`, so the confirmation and password-reset emails bring people back to the dashboard.

## 3. Share with checklist users

Send the checklist link on WhatsApp. They sign in with their HR number. To install:
- **Android (Chrome):** ⋮ → *Add to Home screen / Install app*.
- **iPhone (Safari):** Share → *Add to Home Screen*.

## What the apps do

**Checklist app (phone)**
- Today: progress for the site, camp check, random field checks (target 3 per site per week), items waiting from Stores.
- Site, camp and field checks: a tick or cross for each standard. A cross asks what was done that day (corrected, sent to change, item issued, verbal warning). Optional note and photo.
- **Supply gaps:** uniform, ID card and PPE can be marked *requested, not received* with the request date. These are never counted against the staff member and go onto the Stores list.
- Repeat findings in the last 90 days are counted automatically and the policy's next step is shown: verbal warning → written warning and refresher → HR.
- End of day: summary and **Send to Head Office** (only once everyone is checked). Shows **overdue** after the due time (default 18:00).
- **Report an incident**: difficult customer, complaint, serious conduct, damage. The FM Manager sees it straight away.
- **Camp Boss** works by camp, not by site: he picks Al Quoz Camp, Jafza Camp or Site Accommodation and checks everyone living there before they leave, whatever site they work on. Each person's camp comes from the *accommodation* field.
- **HSE officers** use the phone app on any site for site and random field checks.
- **Training & baseline**: mark who attended the toolbox talk; record each person's sizes, PPE held and missing items. Unticked items go to Stores automatically.

**Dashboard (desktop)**
- **Overview**: today's checklists (late ones flagged), pass rate with trend, open and overdue audit findings, audit scores, training, open incidents, HR steps due, a 14-day strip per site, weekly trend chart, most-missed standards, and **Needs attention** built from the policy rules.
- **Analytics**: weekly pass rate, a site × week table, most-missed standards, findings by trade, checklist punctuality (on time, late, missed, average send time), **checker activity** (a supervisor who never records a gap may not be checking properly), audits in the period. 4, 8, 12 or 26 weeks; one site or all.
- **Site scorecards**: click any site for its own figures, trend, 30-day checklist calendar, checkers, audit history, staff on a warning and open incidents.
- **Daily checklists** by date and site, with every gap, action, note and photo.
- **Audits**: score form (30 / 25 / 25 / 20, pass at 85) with a suggested daily-control score; follow-up steps (report by day 2, plan by day 3, actions closed by day 7, verified next visit).
- **Incidents**: acknowledge and close with an outcome.
- **HR register**: who needs a written warning, refresher, HR action or investigation under the policy ladder and hasn't had it recorded; record each step with date, action and AED amount.
- **Employees**: warning level, full history (checks, audits, incidents, HR steps, baseline), 30-day calendar.
- **Supply gaps**, **Training & baseline** coverage by site.
- **Reports & exports**: monthly COO report, period report for any dates (this week, last week, 30 or 90 days, or custom), both printable and as CSV; and **9 data exports** for Excel (checks, gaps, checklists sent, audits, audit actions, incidents, HR register, supply, employees).
- **Activity log**: who changed what and when.
- **Rules**: whether sites send a daily checklist (switch it off while only the Camp Boss and HSE use the app), pass mark, deadlines, field-check target, supply target, warning window, checklist due time, training deadline and deduction amounts, all editable without touching code.

The checklist items are in [`assets/standards.js`](assets/standards.js). After editing anything in `assets/`, change `VERSION` at the top of `sw.js` (e.g. `v1` → `v2`) so installed phones pick up the update.

## Good to know

- **Speed:** each save takes well under a second.
- **Size:** the dashboard loads the last 100 days and loads older data when you open an older month.
- **Sign-ins:** checklist users stay signed in for 14 days. Ten unknown HR numbers from one place lock sign-in there for 10 minutes. Admins reset forgotten passwords from the sign-in screen. Every change is written to the activity log.
- **Back-ups:** Supabase backs up the database daily; the dashboard's **Reports & exports** also download every table as CSV.
- **Needs a signal:** checks are saved online; there's no offline mode yet.
- Deduction amounts are set by HR under **Rules** (the policy leaves them to HR under labour law) and recorded per case in the HR register.

## Try it on your computer

```bash
npm install
```
```bash
npm run demo
```
Needs Node.js 20+. It runs a local copy of everything: Postgres (PGlite), the real Edge Function under Deno, and stand-ins for Supabase sign-in and photo storage. Open http://localhost:8080. Demo checklist users sign in with HR numbers **D1001–D1008**. Demo admins use `director@demo.local`, `hr@demo.local`, `faisal@demo.local` and so on, with password `demo1234`; the super admin email works with it too. `npm run dev` starts with an empty database. None of this touches the live site.

## Files

```
index.html                 checklist app
admin.html                 management dashboard
config.js                  address of the Supabase backend
assets/standards.js        what is checked, targets and the warning ladder
assets/core.js             shared code: login, backend calls, dashboard calculations
assets/field.js            checklist app screens
assets/admin.js            dashboard screens
assets/app.css             styles
setup/grooming-backend.gs  backend logic (runs in the Supabase Edge Function and the local test server)
supabase/                  database tables, Edge Function, build script
sw.js, manifest.webmanifest  install-as-app support
dev/local.mjs              local copy of the whole system (npm run demo)
docs/mockups/              the original design mockups
```
