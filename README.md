# ABFM Grooming Control

Two free apps for the **Al Bonian FM Grooming, Etiquette & Work Efficiency Policy**, built like ABFM Training: plain web pages on GitHub Pages that install on phones like an app.

- **Checklist app** (supervisors, FM Managers, Camp Boss, Site Managers): `https://abfmapps.github.io/Grooming/`
- **Management dashboard** (Director, OCO, HSE, HR, Stores, FM Managers): `https://abfmapps.github.io/Grooming/admin.html`

Everyone logs in with a **username and PIN**. The app sends each person to the right place for their role; FM Managers can use both and only see their own sites.

**Where the data lives:** in a private **Google Sheet** in your Google account, never in this repo. The pages only talk to a small Google Apps Script attached to that Sheet, which checks each person's PIN, role and sites. Check photos go to a private Google Drive folder.

---

## 1. Connect the Google Sheet (one time, about 10 minutes)

1. Go to [sheets.new](https://sheets.new) and name the Sheet, e.g. **ABFM Grooming data**. Use a company Google account that will stay.
2. **Extensions → Apps Script**. Delete everything in `Code.gs` and paste in the whole of [`setup/grooming-backend.gs`](setup/grooming-backend.gs).
3. Near the top, change `ADMIN_PIN = "1234"` to your own PIN. Press 💾 Save.
4. **Project Settings (⚙️)** → Time zone: **(GMT+04:00) Dubai**.
5. **Deploy → New deployment** → ⚙️ *Select type* → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone** (the script itself checks PINs)
   - Press **Deploy** and allow the permissions (Sheets, and Drive for photos). If Google warns the app isn't verified: *Advanced → Go to … (unsafe)*. It's your own script.
6. Copy the **Web app URL** (ends in `/exec`).
7. In this repo on GitHub, open [`config.js`](config.js) → ✏️ Edit, paste the URL between the quotes:
   ```js
   window.GROOMING_API = "https://script.google.com/macros/s/…/exec";
   ```
   → **Commit changes**. The site updates within about a minute.

**Want to try it first with made-up data?** In the Apps Script editor choose **loadDemoData** in the function list at the top and press ▶ **Run**. It adds 6 sites, about 90 staff and 30 days of checks; every demo user's PIN is 1234 (e.g. `omar`, `faisal`, `oco`, `director`). To start again for real, delete the Sheet's tabs (keep one blank tab).

**When you change the script later:** Deploy → Manage deployments → ✏️ → Version: **New version** → Deploy. This keeps the same URL.

### Updating to a new version of the script

When this repo's `setup/grooming-backend.gs` changes (the dashboard shows an orange **Update needed** notice):
1. Open the Sheet → **Extensions → Apps Script**.
2. Select everything in `Code.gs`, delete it, and paste in the new [`setup/grooming-backend.gs`](setup/grooming-backend.gs). Put your own `ADMIN_PIN` back (it only matters for a brand-new Sheet).
3. 💾 Save, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same, so `config.js` doesn't change.

Your data is safe: new columns and tabs are added to the Sheet automatically.

### Daily email summary (optional)

1. In the Apps Script editor choose **setupDailyEmail** in the function list and press ▶ **Run** once. Allow the email permission.
2. In the dashboard: **Sites, users & rules → Users**, add an email address to each manager who should get it.
3. **Sites, users & rules → Rules & daily email**: choose the hour and press **Send a test summary to me**.

Each evening every manager login with an email gets a summary for their own sites: checklists not sent or sent late, overdue audit actions, failing sites, serious incidents and slow supply. Quiet days send nothing.

## 2. Set up your people

1. Open the dashboard link and log in as **admin** with your `ADMIN_PIN`.
2. **Sites, users & rules → Sites:** add your sites.
3. **Sites, users & rules → Users:** add each supervisor, camp boss, site manager and FM Manager with a PIN and their sites. Managers (Director, OCO, HSE, HR, Stores) see all sites. Add an email for anyone who should get the daily summary.
4. **Rules & daily email:** check the policy rules and the checklist due time.
5. **Employees → Import from Excel / CSV:** copy these columns from Excel and paste them in: **staff number, name, trade, site, uniform size, shoe size**.
6. Change your own PIN under **Sites, users & rules → Change my PIN**.

## 3. Share with supervisors

Send the checklist link on WhatsApp with each person's username and PIN. To install:
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

- **Speed:** each save goes to Google, so it takes 1–2 seconds. Fine for hundreds of staff.
- **Size:** the dashboard loads the last 100 days and loads older data when you open an older month. After a year or two of daily checks you can copy old rows from the *Checks* tab to an archive Sheet to keep it fast.
- **Logins** last 14 days on a phone. Six wrong PINs lock that username for 10 minutes. Every change is written to the **Activity** tab.
- **Back-ups:** it's a normal Google Sheet: *File → Version history*, or download a copy.
- **Needs a signal:** checks are saved online; there's no offline mode yet.
- Deduction amounts are set by HR under **Rules** (the policy leaves them to HR under labour law) and recorded per case in the HR register.

## Try it on a computer without Google

```bash
npm run demo        # needs Node.js 20+; runs the real backend script with demo data
```
Then open http://localhost:8080 (PIN 1234 for every demo user). `dev/` holds this local stand-in for Google; it isn't used by the live site.

## Files

```
index.html                 checklist app
admin.html                 management dashboard
config.js                  your Apps Script URL (step 1.7)
assets/standards.js        what is checked, targets and the warning ladder
assets/core.js             shared code: login, backend calls, dashboard calculations
assets/field.js            checklist app screens
assets/admin.js            dashboard screens
assets/app.css             styles
setup/grooming-backend.gs  the Google Apps Script (paste into the Sheet)
sw.js, manifest.webmanifest  install-as-app support
dev/                       local test server
docs/mockups/              the original design mockups
```
