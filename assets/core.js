/* Shared code for the checklist app (index.html) and the dashboard (admin.html). */
(function () {
  const S = window.STD;
  const T = S.TARGETS;
  const TOKEN = "abfm_grooming_token";
  const USER = "abfm_grooming_user";

  // ---------------- backend ----------------
  const ERRORS = {
    login: "Please log in again.", pin: "Wrong username or PIN.", locked: "Too many wrong PINs. Try again in 10 minutes.",
    role: "Your role cannot do this.", site: "You don't have access to this site.", notfound: "Not found. Refresh and try again.",
    missing: "Some staff are not checked yet.", exists: "That name already exists.", pin_format: "PIN must be 4 to 8 digits.",
    self: "You can't deactivate your own account.", name: "Fill in the name.", item: "Choose or type an item.", finding: "Type the finding.",
    offline: "No connection. Check the signal and try again.", details: "Describe what happened.", setting: "One of the rules has an invalid value.",
    email: "That email address doesn't look right.", no_email: "Add your email address first (Sites & users → Users).", amount: "The amount must be a number.",
    bad: "Something in the form isn't valid.", unknown: "Update the Google Apps Script to the latest version (README, step 1) to use this.", setup: "The app isn't connected to its Google Sheet yet. See README, step 2.",
  };
  async function api(action, body = {}) {
    if (!window.GROOMING_API) throw new Error(ERRORS.setup);
    let r;
    try {
      r = await fetch(window.GROOMING_API, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        // "fn" names the backend function. "action" is also sent for scripts deployed before November 2026.
        body: JSON.stringify({ action, ...body, fn: action, token: localStorage.getItem(TOKEN) || "" }),
      });
    } catch (e) { throw new Error(ERRORS.offline); }
    const out = await r.json().catch(() => ({ ok: false, error: "error" }));
    if (!out.ok) {
      if (out.error === "login" && action !== "login") { logout(false); location.reload(); }
      const err = new Error(ERRORS[out.error] || "Something went wrong. Please try again." + (out.detail ? ` (${out.detail})` : ""));
      err.code = out.error;
      throw err;
    }
    return out;
  }
  function session() {
    try { return localStorage.getItem(TOKEN) ? JSON.parse(localStorage.getItem(USER) || "null") : null; } catch (e) { return null; }
  }
  async function login(username, pin) {
    const out = await api("login", { username, pin });
    localStorage.setItem(TOKEN, out.token);
    localStorage.setItem(USER, JSON.stringify(out.user));
    return out.user;
  }
  function logout(go = true) {
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(USER);
    if (go) location.href = location.pathname.replace(/[^/]*$/, "") + "index.html";
  }

  // ---------------- helpers ----------------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (n) => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  function addDays(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
  /** UAE working week: Monday to Friday. */
  function workingDaysBetween(a, b) {
    let n = 0;
    for (let d = a; d < b; d = addDays(d, 1)) { const w = new Date(d + "T12:00:00Z").getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }
  const nowHM = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  function todayLocal() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
  function fmtDate(iso, year) {
    if (!iso) return "";
    return new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  }
  const fmtDay = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const pct = (v, d = 0) => (v == null ? "–" : `${v.toFixed(d)}%`);
  const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;

  function toast(msg, kind = "ok") {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
    el.className = `toast ${kind}`;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.hidden = true), kind === "err" ? 6000 : 3000);
  }
  function busy(on) { document.body.classList.toggle("busy", !!on); }

  /** Read a form into a plain object. Checkboxes with the same name become arrays. */
  function formData(form) {
    const o = {};
    for (const [k, v] of new FormData(form).entries()) {
      if (form.querySelectorAll(`[name="${k}"][type=checkbox]`).length > 1) (o[k] ||= []).push(v);
      else o[k] = v;
    }
    return o;
  }

  /** Shrink a photo on the phone before sending (max 1280 px, JPEG). */
  function shrinkPhoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => reject(new Error("Could not read the photo."));
      img.src = url;
    });
  }

  function loginView(root, { title, after }) {
    root.innerHTML = `
      <main class="login">
        <form class="card" id="login-form">
          <img src="assets/logo.png" alt="ABFM" class="login-logo">
          <div class="eyebrow">Al Bonian FM</div>
          <h1>Grooming Control</h1>
          <div class="bar-accent"></div>
          <p class="muted small mb">${esc(title)}</p>
          <div class="flash err" id="login-err" hidden></div>
          <label class="field">Username<input type="text" name="username" autocomplete="username" autocapitalize="none" required></label>
          <label class="field">PIN<input type="password" name="pin" inputmode="numeric" autocomplete="current-password" required></label>
          <button class="btn block" type="submit">Log in</button>
        </form>
      </main>`;
    root.querySelector("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const err = root.querySelector("#login-err");
      busy(true);
      try { after(await login(f.username.trim(), f.pin)); }
      catch (x) { err.textContent = x.message; err.hidden = false; }
      finally { busy(false); }
    });
  }

  // ---------------- calculations used by the dashboard ----------------
  /** Finding dates (newest first) for one employee in the 90-day window ending on `date`. One per day. */
  function findingsFor(D, empId, date) {
    const from = addDays(date, -T.warningWindowDays);
    const days = new Set();
    for (const c of D.checks) if (c.employee_id === empId && c.status === "gaps" && c.date >= from && c.date <= date) days.add(c.date);
    for (const x of D.actions) {
      if (x.employee_id !== empId) continue;
      const a = D.auditById[x.audit_id];
      if (a && a.date >= from && a.date <= date) days.add(a.date);
    }
    return [...days].sort().reverse();
  }

  function index(D) {
    D._start = null;
    D.incidents = D.incidents || [];
    D.discipline = D.discipline || [];
    D.outdatedBackend = !D.settings;
    S.applySettings(D.settings);
    D.siteById = Object.fromEntries(D.sites.map((s) => [s.id, s]));
    D.empById = Object.fromEntries(D.employees.map((e) => [e.id, e]));
    D.auditById = Object.fromEntries(D.audits.map((a) => [a.id, a]));
    D.mySites = D.sites.filter((s) => s.active && D.user.siteIds.includes(s.id)).sort((a, b) => a.name.localeCompare(b.name));
    D.audits.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    return D;
  }

  const siteAudits = (D, siteId) => D.audits.filter((a) => a.site_id === siteId);
  const openActions = (D) => D.actions.filter((x) => !x.closed_on && D.auditById[x.audit_id]).sort((a, b) => a.due_on.localeCompare(b.due_on));
  const supplyAge = (g, today) => workingDaysBetween(g.requested_on, g.issued_on || today);
  const fieldLast7 = (D, siteId, today) => D.checks.filter((c) => c.site_id === siteId && c.type === "field" && c.date >= addDays(today, -6) && c.date <= today).length;

  function overview(D) {
    const today = D.today;
    const from = addDays(today, -13);
    const staffCount = (id) => D.employees.filter((e) => e.active && e.site_id === id).length;
    const acts = openActions(D);
    const comp = (siteId, a, b) => {
      let ok = 0, tot = 0;
      for (const c of D.checks) if (c.type === "site" && c.site_id === siteId && c.date >= a && c.date <= b && ["pass", "supply", "gaps"].includes(c.status)) { tot++; if (c.status !== "gaps") ok++; }
      return { ok, tot };
    };
    const rows = D.mySites.map((s) => {
      const strip = [];
      for (let i = 0; i < 14; i++) {
        const d = addDays(from, i);
        const c = comp(s.id, d, d);
        strip.push({ date: d, pct: c.tot ? Math.round((100 * c.ok) / c.tot) : null, sent: D.submissions.some((x) => x.site_id === s.id && x.date === d) });
      }
      const sa = siteAudits(D, s.id);
      const a = acts.filter((x) => D.auditById[x.audit_id].site_id === s.id);
      const sub = D.submissions.find((x) => x.site_id === s.id && x.date === today);
      return {
        site: s, staff: staffCount(s.id), manager: D.managers.filter((m) => m.sites.includes(s.id)).map((m) => m.name).join(", "),
        todayAt: sub ? sub.time : null, strip, lastAudit: sa[0] || null, open: a.length, overdue: a.filter((x) => x.due_on < today).length,
      };
    });
    const sum = (a, b) => D.mySites.reduce((acc, s) => { const c = comp(s.id, a, b); return { ok: acc.ok + c.ok, tot: acc.tot + c.tot }; }, { ok: 0, tot: 0 });
    const now = sum(from, today), prev = sum(addDays(today, -27), addDays(today, -14));
    const audited = rows.filter((r) => r.lastAudit);
    const staff = D.employees.filter((e) => e.active && D.user.siteIds.includes(e.site_id));
    const kpi = {
      sites: rows.length, sentToday: rows.filter((r) => r.todayAt).length,
      compliance: now.tot ? (100 * now.ok) / now.tot : null, prev: prev.tot ? (100 * prev.ok) / prev.tot : null,
      open: acts.length, overdue: acts.filter((x) => x.due_on < today).length,
      avgAudit: audited.length ? audited.reduce((a, r) => a + r.lastAudit.total, 0) / audited.length : null,
      below: audited.filter((r) => r.lastAudit.total < T.auditPass).length,
      trained: staff.length ? (100 * staff.filter((e) => e.trained_on).length) / staff.length : null,
      lateToday: rows.filter((r) => r.todayAt && r.todayAt > T.checklistDue).length,
      incidentsOpen: D.incidents.filter((x) => D.user.siteIds.includes(x.site_id) && x.status !== "closed").length,
      hrPending: hrPending(D).length,
    };
    return { rows, kpi, alerts: alerts(D, rows) };
  }

  function alerts(D, rows) {
    const today = D.today, out = [];
    for (const r of rows) {
      const sa = siteAudits(D, r.site.id);
      if (sa.length >= 2 && sa[0].total < T.auditPass && sa[1].total < T.auditPass) out.push({ level: "red", title: `${r.site.name} failed 2 audits in a row`, detail: "Escalate to the Director of Operations", href: `#/audits/${sa[0].id}` });
      if (r.overdue) out.push({ level: "red", title: `${plural(r.overdue, "finding")} past the ${T.findingCloseDays}-day limit`, detail: r.site.name, href: "#/findings" });
      const last = sa[0];
      if (last) {
        if (last.total < T.auditPass) {
          const due = addDays(last.date, T.reauditDays);
          out.push({ level: due < today ? "red" : "grey", title: `${r.site.name} re-audit due by ${fmtDate(due)}`, detail: `Scored ${last.total}, below ${T.auditPass}`, href: `#/audits/${last.id}` });
        }
        if (!last.report_on && daysBetween(last.date, today) > T.reportDays) out.push({ level: "amber", title: `Audit report not sent: ${r.site.name}`, detail: `Due ${T.reportDays} days after the audit`, href: `#/audits/${last.id}` });
      }
      if (!last || daysBetween(last.date, today) > 31) out.push({ level: "grey", title: `${r.site.name} not audited in the last month`, detail: "Every site is audited at least monthly", href: `#/audits/new?site=${r.site.id}` });
      if (!r.todayAt && r.staff > 0) {
        const missed = r.strip.filter((d) => !d.sent && d.date < today).length;
        const past = nowHM() > T.checklistDue;
        out.push({ level: past ? "amber" : "grey", title: `${r.site.name}: today's checklist ${past ? "overdue" : "not sent yet"}`, detail: `Due by ${T.checklistDue}${missed ? ` · ${plural(missed, "missed day")} in the last 13` : ""}`, href: `#/sites/${r.site.id}` });
      }
      const f = fieldLast7(D, r.site.id, today);
      if (r.staff > 0 && f < T.fieldChecksPerWeek) out.push({ level: "grey", title: `${r.site.name}: ${f} of ${T.fieldChecksPerWeek} field checks this week`, detail: "Random checks during work, last 7 days" });
    }
    const mine = (x) => D.user.siteIds.includes(x.site_id);
    const serious = D.incidents.filter((x) => mine(x) && x.type === "serious_conduct" && x.status !== "closed");
    if (serious.length) out.push({ level: "red", title: `${plural(serious.length, "serious conduct incident")} open`, detail: "Removal from site, HR investigation, OCO informed", href: "#/incidents" });
    const unack = D.incidents.filter((x) => mine(x) && x.status === "open" && x.type !== "serious_conduct");
    if (unack.length) out.push({ level: "amber", title: `${plural(unack.length, "incident")} not acknowledged`, detail: "The FM Manager reviews incidents the same day", href: "#/incidents" });
    const hr = hrPending(D);
    if (hr.length) out.push({ level: "amber", title: `${plural(hr.length, "employee")} with an HR step not recorded`, detail: "Written warning, refresher or HR action due under the policy", href: "#/hr" });
    const noBase = D.employees.filter((e) => e.active && mine(e) && !e.baseline_on).length;
    if (noBase) out.push({ level: "grey", title: `${plural(noBase, "staff member")} without a baseline check`, detail: "Sizes, PPE held and missing items", href: "#/training" });
    const old = D.supply.filter((g) => !g.issued_on && supplyAge(g, today) > T.supplyWorkingDays);
    if (old.length) out.push({ level: "blue", title: `${plural(old.length, "supply gap")} older than ${T.supplyWorkingDays} working days`, detail: "Stores target is 5 working days", href: "#/supply" });
    const order = { red: 0, amber: 1, blue: 2, grey: 3 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  /** Daily control evidence for an audit: last 30 days of checklists and field checks. */
  function controlEvidence(D, siteId, date) {
    const from = addDays(date, -29);
    const submitted = D.submissions.filter((s) => s.site_id === siteId && s.date >= from && s.date <= date).length;
    const field = D.checks.filter((c) => c.site_id === siteId && c.type === "field" && c.date >= from && c.date <= date).length;
    const fieldTarget = Math.round((30 / 7) * T.fieldChecksPerWeek);
    return { submitted, days: 30, field, fieldTarget, suggested: Math.round(12 * Math.min(1, submitted / 30) + 8 * Math.min(1, field / fieldTarget)) };
  }

  /** First day a site recorded anything (days before go-live don't count as missed). */
  function siteStart(D, siteId) {
    if (!D._start) {
      D._start = {};
      for (const c of D.checks) if (!D._start[c.site_id] || c.date < D._start[c.site_id]) D._start[c.site_id] = c.date;
      for (const x of D.submissions) if (!D._start[x.site_id] || x.date < D._start[x.site_id]) D._start[x.site_id] = x.date;
    }
    return D._start[siteId] || D.today;
  }
  /** Per-site figures for any date range (used by the monthly and period reports). */
  function periodReport(D, from, to, siteIds) {
    if (to > D.today) to = D.today;
    const inRange = (d) => d >= from && d <= to;
    return D.mySites.filter((s) => !siteIds || siteIds.includes(s.id)).map((s) => {
      const st = siteStart(D, s.id);
      const days = Math.max(0, daysBetween(st > from ? st : from, to) + 1);
      const site = D.checks.filter((c) => c.site_id === s.id && c.type === "site" && inRange(c.date) && ["pass", "supply", "gaps"].includes(c.status));
      const finds = D.checks.filter((c) => c.site_id === s.id && c.status === "gaps" && inRange(c.date));
      const audits = siteAudits(D, s.id).filter((a) => inRange(a.date)).reverse();
      const acts = D.actions.filter((x) => audits.some((a) => a.id === x.audit_id));
      const sup = D.supply.filter((g) => g.site_id === s.id && inRange(g.requested_on));
      const issued = sup.filter((g) => g.issued_on);
      const staff = D.employees.filter((e) => e.active && e.site_id === s.id);
      const subs = D.submissions.filter((x) => x.site_id === s.id && inRange(x.date));
      const inc = D.incidents.filter((x) => x.site_id === s.id && inRange(x.date));
      return {
        id: s.id, site: s.name, staff: staff.length, days,
        sent: subs.length, onTime: subs.filter((x) => x.time <= T.checklistDue).length,
        siteChecks: site.length, passRate: site.length ? (100 * site.filter((c) => c.status !== "gaps").length) / site.length : null,
        findings: finds.length, repeat: finds.filter((c) => (c.finding_no || 1) >= 2).length,
        field: D.checks.filter((c) => c.site_id === s.id && c.type === "field" && inRange(c.date)).length, fieldTarget: Math.round((days / 7) * T.fieldChecksPerWeek),
        audits: audits.map((a) => `${fmtDate(a.date)}: ${a.total}`).join(", "), latestAudit: audits.length ? audits[audits.length - 1].total : null,
        actionsRaised: acts.length, actionsOnTime: acts.filter((x) => x.closed_on && x.closed_on <= x.due_on).length, actionsOpen: acts.filter((x) => !x.closed_on).length,
        supplyOpened: sup.length, supplyWaiting: sup.length - issued.length,
        supplyAvg: issued.length ? issued.reduce((a, g) => a + workingDaysBetween(g.requested_on, g.issued_on), 0) / issued.length : null,
        incidents: inc.length, serious: inc.filter((x) => x.type === "serious_conduct").length,
        trained: staff.length ? (100 * staff.filter((e) => e.trained_on).length) / staff.length : null,
        baseline: staff.length ? (100 * staff.filter((e) => e.baseline_on).length) / staff.length : null,
      };
    });
  }
  function monthlyReport(D, month) {
    const from = `${month}-01`;
    return periodReport(D, from, addDays(addDays(from, 32).slice(0, 8) + "01", -1));
  }

  // ---------------- analytics ----------------
  const mondayOf = (iso) => { const w = new Date(iso + "T12:00:00Z").getUTCDay(); return addDays(iso, -((w + 6) % 7)); };
  /** Weekly site-check pass rate for the last `weeks` weeks (Monday to Sunday). */
  function weekly(D, siteIds, weeks) {
    const start = addDays(mondayOf(D.today), -7 * (weeks - 1));
    const out = Array.from({ length: weeks }, (_, i) => ({ week: addDays(start, 7 * i), ok: 0, tot: 0, findings: 0 }));
    for (const c of D.checks) {
      if (c.type !== "site" || c.date < start || !siteIds.includes(c.site_id) || !["pass", "supply", "gaps"].includes(c.status)) continue;
      const w = out[Math.floor(daysBetween(start, c.date) / 7)];
      if (!w) continue;
      w.tot++;
      if (c.status !== "gaps") w.ok++; else w.findings++;
    }
    out.forEach((w) => (w.pct = w.tot ? (100 * w.ok) / w.tot : null));
    return out;
  }
  /** How often each standard was failed (supply gaps excluded). */
  function missedStandards(D, siteIds, from, to) {
    const n = {};
    let checks = 0;
    for (const c of D.checks) {
      if (c.date < from || c.date > to || !siteIds.includes(c.site_id) || !["pass", "supply", "gaps"].includes(c.status)) continue;
      checks++;
      for (const g of c.gaps) if (!g.supply) n[g.code] = (n[g.code] || 0) + 1;
    }
    return { checks, rows: Object.entries(n).map(([code, v]) => ({ code, label: S.itemLabel(code), n: v })).sort((a, b) => b.n - a.n) };
  }
  /** Findings per 100 checks, by trade. */
  function byTrade(D, siteIds, from, to) {
    const t = {};
    for (const c of D.checks) {
      if (c.date < from || c.date > to || !siteIds.includes(c.site_id) || !["pass", "supply", "gaps"].includes(c.status)) continue;
      const e = D.empById[c.employee_id];
      const k = (e && e.trade) || "Unknown";
      t[k] = t[k] || { trade: k, checks: 0, findings: 0 };
      t[k].checks++;
      if (c.status === "gaps") t[k].findings++;
    }
    return Object.values(t).map((x) => ({ ...x, rate: x.checks ? (100 * x.findings) / x.checks : 0 })).sort((a, b) => b.rate - a.rate);
  }
  /** Daily checklist punctuality for a site. */
  function punctuality(D, siteId, from, to) {
    if (to > D.today) to = D.today;
    const st = siteStart(D, siteId);
    if (st > from) from = st;
    const days = Math.max(0, daysBetween(from, to) + 1);
    const subs = D.submissions.filter((x) => x.site_id === siteId && x.date >= from && x.date <= to);
    const mins = subs.map((x) => { const [h, m] = x.time.split(":").map(Number); return h * 60 + m; }).filter((x) => x >= 0);
    const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
    const todayPending = to === D.today && !subs.some((x) => x.date === D.today) ? 1 : 0;
    return {
      days, sent: subs.length, onTime: subs.filter((x) => x.time <= T.checklistDue).length, late: subs.filter((x) => x.time > T.checklistDue).length,
      missed: days - subs.length - todayPending, avg: avg == null ? null : `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`,
    };
  }
  /** What each checker recorded. A checker who never finds a gap may not be checking properly. */
  function checkerActivity(D, siteIds, from, to) {
    const by = {};
    for (const c of D.checks) {
      if (c.date < from || c.date > to || !siteIds.includes(c.site_id)) continue;
      const k = c.by || "Unknown";
      const r = (by[k] ||= { name: k, site: 0, camp: 0, field: 0, gaps: 0, checked: 0, days: new Set(), sites: new Set() });
      r[c.type]++;
      r.days.add(c.date);
      r.sites.add(c.site_id);
      if (["pass", "supply", "gaps"].includes(c.status)) { r.checked++; if (c.status === "gaps") r.gaps++; }
    }
    return Object.values(by).map((r) => ({ ...r, days: r.days.size, sites: [...r.sites], gapRate: r.checked ? (100 * r.gaps) / r.checked : null })).sort((a, b) => b.checked - a.checked);
  }

  /** People whose required HR step (policy ladder) is not recorded yet. */
  function hrPending(D) {
    const out = [];
    const rec = (empId, levels, since) => D.discipline.some((x) => x.employee_id === empId && levels.includes(x.level) && x.date >= since);
    for (const e of D.employees) {
      if (!e.active || !D.user.siteIds.includes(e.site_id)) continue;
      const dates = findingsFor(D, e.id, D.today).slice().reverse();
      const needs = [];
      if (dates.length >= 2) {
        if (!rec(e.id, ["written"], dates[1])) needs.push({ level: "written", since: dates[1], why: "2nd finding" });
        if (!rec(e.id, ["refresher"], dates[1])) needs.push({ level: "refresher", since: dates[1], why: "2nd finding" });
      }
      if (dates.length >= 3 && !rec(e.id, ["hr_action", "deduction"], dates[2])) needs.push({ level: "hr_action", since: dates[2], why: `${ordinal(dates.length)} finding` });
      for (const x of D.incidents) {
        if (x.employee_id === e.id && x.type === "serious_conduct" && !rec(e.id, ["investigation", "removal", "hr_action"], x.date)) needs.push({ level: "investigation", since: x.date, why: "Serious conduct incident" });
      }
      if (needs.length) out.push({ emp: e, findings: dates.length, needs });
    }
    return out.sort((a, b) => b.needs.length - a.needs.length || a.needs[0].since.localeCompare(b.needs[0].since));
  }
  const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");

  // ---------------- charts (plain SVG, hover tooltips) ----------------
  /** Single-series line over time. points: [{label, value|null, tip}] */
  function lineChart(points, { height = 190, unit = "%", target = null, yMin = null, yMax = null, title = "" } = {}) {
    const W = 640, H = height, L = 38, R = 52, Tp = 14, B = 26;
    const vals = points.map((p) => p.value).filter((v) => v != null);
    if (!vals.length) return `<p class="muted small">No data in this period.</p>`;
    let lo = yMin != null ? yMin : Math.max(0, Math.min(...vals, target ? target.value : Infinity) - 2);
    let hi = yMax != null ? yMax : unit === "%" ? 100 : Math.max(...vals) * 1.1;
    if (hi <= lo) hi = lo + 10;
    // Clean tick steps (1, 2, 5, 10, 20, 25, 50…) so the axis reads 90 / 92 / 94…, never 93 / 98.
    const raw = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) || 10 * mag;
    lo = Math.max(0, Math.floor(lo / step) * step);
    hi = Math.ceil(hi / step) * step;
    if (unit === "%") hi = Math.min(100, hi);
    const x = (i) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
    const y = (v) => Tp + ((hi - v) * (H - Tp - B)) / (hi - lo);
    const ticks = [];
    for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
    let path = "", pen = false;
    points.forEach((p, i) => { if (p.value == null) { pen = false; return; } path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)} `; pen = true; });
    const lastI = points.map((p) => p.value != null).lastIndexOf(true);
    const fmt = (v) => (unit === "%" ? `${Math.round(v)}%` : String(Math.round(v)));
    const every = Math.ceil(points.length / 8);
    return `<svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
      ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 6}" y="${y(t) + 4}" class="ax" text-anchor="end">${fmt(t)}</text>`).join("")}
      ${target ? `<line x1="${L}" x2="${W - R}" y1="${y(target.value)}" y2="${y(target.value)}" class="target"/><text x="${W - R + 4}" y="${y(target.value) + 4}" class="ax">${esc(target.label)}</text>` : ""}
      ${points.map((p, i) => (i % every === 0 || i === points.length - 1 ? `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${esc(p.label)}</text>` : "")).join("")}
      <path d="${path}" class="line"/>
      ${lastI >= 0 ? `<text x="${x(lastI) + 8}" y="${y(points[lastI].value) - 6}" class="endlbl">${fmt(points[lastI].value)}</text>` : ""}
      ${points.map((p, i) => { const w = (W - L - R) / Math.max(1, points.length - 1); return `<g class="vh" data-tip="${esc(p.tip || `${p.label}: ${p.value == null ? "no data" : fmt(p.value)}`)}" tabindex="0">
        <rect x="${x(i) - w / 2}" y="${Tp}" width="${w}" height="${H - Tp - B}" fill="transparent"/>
        <line x1="${x(i)}" x2="${x(i)}" y1="${Tp}" y2="${H - B}" class="guide"/>
        ${p.value != null ? `<circle cx="${x(i)}" cy="${y(p.value)}" r="${i === lastI ? 4.5 : 3.5}" class="dot"/>` : ""}</g>`; }).join("")}
    </svg>`;
  }
  /** Horizontal bars, one series. rows: [{label, value, display, tip, href}] */
  function barList(rows, { max = null, unit = "" } = {}) {
    if (!rows.length) return `<p class="muted small">Nothing to show for this period.</p>`;
    const m = max || Math.max(...rows.map((r) => r.value), 1);
    return `<div class="barlist">${rows.map((r) => `<div class="bl-row" data-tip="${esc(r.tip || `${r.label}: ${r.display || r.value + unit}`)}" tabindex="0">
      <div class="bl-label">${r.href ? `<a href="${r.href}">${esc(r.label)}</a>` : esc(r.label)}</div>
      <div class="bl-track"><i style="width:${Math.max(1, (100 * r.value) / m)}%"></i></div>
      <div class="bl-val">${esc(r.display != null ? r.display : r.value + unit)}</div></div>`).join("")}</div>`;
  }
  /** A collapsible table view of chart data (accessibility, exact values). */
  function tableView(head, rows) {
    return `<details class="tbl-view"><summary>Show as table</summary><table class="t"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
  }
  // One tooltip for every [data-tip] element.
  (function tooltips() {
    let tip;
    const show = (el, x, y) => {
      if (!tip) { tip = document.createElement("div"); tip.className = "viz-tip"; document.body.appendChild(tip); }
      tip.textContent = el.getAttribute("data-tip");
      tip.hidden = false;
      const r = tip.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + "px";
      tip.style.top = Math.max(8, y - r.height - 12) + "px";
    };
    const hide = () => { if (tip) tip.hidden = true; };
    document.addEventListener("mousemove", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); el ? show(el, e.clientX, e.clientY) : hide(); });
    document.addEventListener("focusin", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } });
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, true);
  })();

  /** Download rows as a CSV file Excel opens correctly. */
  function downloadCsv(filename, head, rows) {
    const cell = (v) => { const s = v == null ? "" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const blob = new Blob(["﻿" + [head, ...rows].map((l) => l.map(cell).join(",")).join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Register the service worker (installs the app and keeps it fast).
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

  window.G = {
    api, session, login, logout, esc, nowHM, ordinal, initials, addDays, daysBetween, workingDaysBetween, todayLocal, fmtDate, fmtDay, pct, plural,
    toast, busy, formData, shrinkPhoto, loginView,
    findingsFor, index, siteAudits, openActions, supplyAge, fieldLast7, overview, controlEvidence, monthlyReport, periodReport,
    mondayOf, weekly, missedStandards, byTrade, punctuality, checkerActivity, hrPending, lineChart, barList, tableView, downloadCsv,
  };
})();
