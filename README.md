# ABFM Grooming Control

Two apps in one Next.js project, built from the **Al Bonian FM Grooming, Etiquette & Work Efficiency Policy**:

| App | Who | Where |
| --- | --- | --- |
| **Daily Checklist** (phone) | Supervisors, FM Managers, Camp Boss, Site Managers | `/app` |
| **Management dashboard** (desktop) | Director of Operations, OCO, HSE, HR, Stores, FM Managers | `/admin` |

Users log in with a username and PIN and are sent to the right app for their role. FM Managers can use both apps; the dashboard only shows their own sites.

## What it does

**Daily Checklist**
- Today screen: progress for the site, camp check, random field checks (target 3 per site per week), items waiting from Stores.
- Site, camp and field checks. Every staff member gets a tick or cross for each standard. A cross asks for the action taken that day (corrected, sent to change, item issued, verbal warning).
- **Supply gaps**: uniform, ID card and PPE items can be marked "requested, not received" with the request date. These are never counted against the staff member and go onto the Stores list.
- Repeat findings are counted automatically (last 90 days) and the policy's next step is shown: verbal warning → written warning + refresher → HR.
- Optional note and photo per check.
- End of day: summary and "Send to Head Office" (blocked until everyone is checked).
- Toolbox-talk training: mark who attended.

**Management dashboard**
- Overview: checklists received today, pass rate, open/overdue audit findings, average audit score, % trained, a 14-day compliance strip per site, and a "Needs attention" list built from the policy rules (two failed audits in a row, findings past 7 days, missing checklists, re-audits due, 3rd-finding employees, supply gaps over 5 working days, field checks below target).
- Daily checklists by date and site, with every gap, action, note and photo.
- Audits: score form (30/25/25/20, pass at 85) with a suggested "daily control evidence" score from the system's own data; follow-up steps (report by day 2, plan by day 3, actions closed by day 7, verified next visit); findings with owner and due date.
- Findings & actions, Employees (warning level, history, 30-day calendar), Supply gaps, Training.
- Monthly report to the COO, printable and downloadable as CSV for Excel.
- Sites & users, plus employee import from an Excel/CSV list.

The checklist items live in `src/lib/standards.ts`. Edit that file to change what is checked.

## Run it

Needs Node.js 20 or newer.

```bash
npm install
npm run seed:demo        # optional: made-up demo data, all PINs 1234
npm run build
npm start                # http://localhost:3000
```

For development: `npm run dev`.

Without demo data, the first start creates one account: **admin / 1234** (set `ADMIN_PIN` to choose another). Log in, add sites and users under *Sites & users*, and import staff under *Employees*.

Demo users (PIN 1234): `director`, `oco`, `hse`, `hr`, `stores`, `faisal` / `sanjay` / `tariq` (FM Managers), `omar` / `ravi` / `anil` / `deepak` / `vinod` (supervisors), `george` (site manager), `campboss`, `admin`.

### Settings (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATA_DIR` | `./data` | Where the SQLite database and uploaded photos are stored. Back this folder up. |
| `SESSION_SECRET` | generated and stored in the database | Signs login cookies. |
| `ADMIN_PIN` | `1234` | PIN for the first admin account (first start only). |
| `INSECURE_COOKIES` | unset | Set to `1` only when testing a production build over plain `http://`. |
| `PORT` | `3000` | Port for `npm start`. |

## Hosting

The app stores data in a single SQLite file, so it needs a server with a persistent disk (a small VM, Railway, Render with a disk, Fly.io with a volume, or a company server). It does not fit serverless hosting such as Vercel as-is. All database code is in `src/lib/db.ts` and `src/lib/queries.ts`, so moving to Postgres or Supabase later is contained.

## Not done yet

- Works online only; there is no offline mode yet.
- English only.
- Salary deduction amounts are not recorded (the policy leaves them for HR to confirm).
- No email or WhatsApp notifications; alerts show on the dashboard.

## Project layout

```
src/lib/standards.ts   checklist items, targets and escalation rules from the policy
src/lib/db.ts          database schema, PIN hashing, UAE dates
src/lib/queries.ts     shared queries: overview, alerts, findings, monthly report
src/lib/auth.ts        login sessions, roles and permissions
src/app/app/...        phone checklist app
src/app/admin/...      management dashboard
scripts/seed-demo.ts   demo data
docs/mockups/          the original design mockups
```
