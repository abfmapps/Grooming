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
    offline: "No connection. Check the signal and try again.", setup: "The app isn't connected to its Google Sheet yet. See README, step 2.",
  };
  async function api(action, body = {}) {
    if (!window.GROOMING_API) throw new Error(ERRORS.setup);
    let r;
    try {
      r = await fetch(window.GROOMING_API, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...body, action, token: localStorage.getItem(TOKEN) || "" }),
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
        out.push({ level: "amber", title: `${r.site.name}: today's checklist not sent`, detail: missed ? `${plural(missed, "missed day")} in the last 13` : "Due by end of day", href: "#/checklists" });
      }
      const f = fieldLast7(D, r.site.id, today);
      if (r.staff > 0 && f < T.fieldChecksPerWeek) out.push({ level: "grey", title: `${r.site.name}: ${f} of ${T.fieldChecksPerWeek} field checks this week`, detail: "Random checks during work, last 7 days" });
    }
    const repeat = D.employees.filter((e) => e.active && D.user.siteIds.includes(e.site_id) && findingsFor(D, e.id, today).length >= 3);
    if (repeat.length) out.push({ level: "amber", title: `${plural(repeat.length, "employee")} on a 3rd finding or more`, detail: "Refer to HR for disciplinary action", href: "#/employees?filter=repeat" });
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

  function monthlyReport(D, month) {
    const from = `${month}-01`;
    const lastDay = addDays(addDays(from, 32).slice(0, 8) + "01", -1);
    const to = lastDay < D.today ? lastDay : D.today;
    const days = Math.max(0, daysBetween(from, to) + 1);
    const inRange = (d) => d >= from && d <= to;
    return D.mySites.map((s) => {
      const site = D.checks.filter((c) => c.site_id === s.id && c.type === "site" && inRange(c.date) && ["pass", "supply", "gaps"].includes(c.status));
      const finds = D.checks.filter((c) => c.site_id === s.id && c.status === "gaps" && inRange(c.date));
      const audits = siteAudits(D, s.id).filter((a) => inRange(a.date)).reverse();
      const acts = D.actions.filter((x) => audits.some((a) => a.id === x.audit_id));
      const sup = D.supply.filter((g) => g.site_id === s.id && inRange(g.requested_on));
      const issued = sup.filter((g) => g.issued_on);
      const staff = D.employees.filter((e) => e.active && e.site_id === s.id);
      return {
        site: s.name, staff: staff.length, days,
        sent: D.submissions.filter((x) => x.site_id === s.id && inRange(x.date)).length,
        siteChecks: site.length, passRate: site.length ? (100 * site.filter((c) => c.status !== "gaps").length) / site.length : null,
        findings: finds.length, repeat: finds.filter((c) => (c.finding_no || 1) >= 2).length,
        field: D.checks.filter((c) => c.site_id === s.id && c.type === "field" && inRange(c.date)).length, fieldTarget: Math.round((days / 7) * T.fieldChecksPerWeek),
        audits: audits.map((a) => `${fmtDate(a.date)}: ${a.total}`).join(", "), latestAudit: audits.length ? audits[audits.length - 1].total : null,
        actionsRaised: acts.length, actionsOnTime: acts.filter((x) => x.closed_on && x.closed_on <= x.due_on).length, actionsOpen: acts.filter((x) => !x.closed_on).length,
        supplyOpened: sup.length, supplyWaiting: sup.length - issued.length,
        supplyAvg: issued.length ? issued.reduce((a, g) => a + workingDaysBetween(g.requested_on, g.issued_on), 0) / issued.length : null,
        trained: staff.length ? (100 * staff.filter((e) => e.trained_on).length) / staff.length : null,
      };
    });
  }

  // Register the service worker (installs the app and keeps it fast).
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

  window.G = {
    api, session, login, logout, esc, initials, addDays, daysBetween, workingDaysBetween, todayLocal, fmtDate, fmtDay, pct, plural,
    toast, busy, formData, shrinkPhoto, loginView,
    findingsFor, index, siteAudits, openActions, supplyAge, fieldLast7, overview, controlEvidence, monthlyReport,
  };
})();
