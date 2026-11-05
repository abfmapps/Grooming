/* Shared code for the checklist app (index.html) and the dashboard (admin.html). */
(function () {
  const S = window.STD;
  const T = S.TARGETS;
  const TOKEN = "abfm_grooming_token";
  const USER = "abfm_grooming_user";

  // ---------------- backend ----------------
  const ERRORS = {
    login: "Please sign in again.", hr: "That HR number isn't registered. Ask your manager to add you.", locked: "Too many tries. Try again in 10 minutes.",
    inactive: "Your account is switched off. Ask your manager.", not_admin: "This email isn't on the admin list. Ask the OCO to add it.",
    super_only: "Only the OCO can add or change dashboard admins.", one_oco: "There is only one OCO account.", hr_format: "Type the HR number.", role_name: "Choose a role.",
    role: "Your role cannot do this.", site: "You don't have access to this site.", notfound: "Not found. Refresh and try again.",
    missing: "Some staff are not checked yet.", exists: "That HR number or email is already used.",
    self: "You can't switch off or change the role of this account.", name: "Fill in the name.", item: "Choose or type an item.", finding: "Type the finding.",
    offline: "No connection. Check the signal and try again.", details: "Describe what happened.", setting: "One of the rules has an invalid value.",
    email: "That email address doesn't look right.", no_email: "Add your email address first (Sites & users → Users).", amount: "The amount must be a number.",
    bad: "Something in the form isn't valid.", unknown: "This needs a newer version of the backend. Refresh the page; if it keeps happening, tell the OCO.", setup: "The app isn't connected to its database yet. See README, step 1.",
    no_mail: "Email isn't connected yet, so the daily summary can't be sent.",
  };
  async function api(action, body = {}) {
    if (!window.GROOMING_API) throw new Error(ERRORS.setup);
    let r;
    try {
      const token = action === "login" ? "" : await currentToken();
      r = await fetch(window.GROOMING_API, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...body, fn: action, token }),
      });
    } catch (e) { throw new Error(ERRORS.offline); }
    const out = await r.json().catch(() => ({ ok: false, error: "error" }));
    if (!out.ok) {
      if (out.error === "login" && action !== "login") { await logout(false); location.reload(); }
      const err = new Error(ERRORS[out.error] || "Something went wrong. Please try again." + (out.detail ? ` (${out.detail})` : ""));
      err.code = out.error;
      throw err;
    }
    return out;
  }
  // ---------------- sign-in ----------------
  // Checklist users: HR number → our own session token (TOKEN). Dashboard admins: email + password with Supabase Auth.
  const SB = window.GROOMING_SB;
  const sb = window.supabase && SB ? window.supabase.createClient(SB.url, SB.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "abfm_grooming_admin" },
  }) : null;
  let recovering = /type=recovery/.test(location.hash);
  if (sb) sb.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") recovering = true; });
  let authMode = "any";                       // the dashboard sets "admin": it only uses the admin sign-in
  const authReady = () => (sb ? sb.auth.getSession().catch(() => null) : Promise.resolve());
  async function adminToken() {
    if (!sb) return "";
    const { data } = await sb.auth.getSession().catch(() => ({ data: {} }));
    return data && data.session ? data.session.access_token : "";
  }
  async function currentToken() {
    if (authMode === "admin") return adminToken();
    return localStorage.getItem(TOKEN) || (await adminToken());
  }
  async function hasSession() { return authMode !== "admin" && !!localStorage.getItem(TOKEN) || !!(await adminToken()); }
  function cachedUser() { try { return JSON.parse(localStorage.getItem(USER) || "null"); } catch (e) { return null; } }
  function rememberUser(u) { localStorage.setItem(USER, JSON.stringify(u)); }
  async function loginHr(hr) {
    const out = await api("login", { hr });
    localStorage.setItem(TOKEN, out.token);
    rememberUser(out.user);
    return out.user;
  }
  async function logout(go = true) {
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(USER);
    if (sb) await sb.auth.signOut().catch(() => {});
    if (go) location.replace(location.pathname);
  }

  // ---------------- icons (line icons, 24px grid, drawn with currentColor) ----------------
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checklist: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 1.5 1.5L12 8"/><path d="M14 9.5h3"/><path d="m8 15 1.5 1.5L12 14"/><path d="M14 15.5h3"/>',
    bed: '<path d="M3 18V7"/><path d="M3 14h18v4"/><path d="M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>',
    walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6 2.5 2.5V21"/><path d="M8 12.5 10 8l4 1 2 3.5 2.5 1"/><path d="m10 8-1.5 5.5"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4.5"/><path d="M12 17.5h.01"/>',
    megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16 8.5a5 5 0 0 1 0 7"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
    cap: '<path d="M2 9.5 12 5l10 4.5-10 4.5L2 9.5z"/><path d="M6 11.5V16c2 2 10 2 12 0v-4.5"/><path d="M22 9.5V15"/>',
    chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="m10 16-4-4 4-4"/><path d="M6 12h10"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    upload: '<path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 11h6"/><path d="M9 15h4"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    scale: '<path d="M12 4v16"/><path d="M5 20h14"/><path d="M4 8h16"/><path d="m4 8-2.5 6a3 3 0 0 0 5 0z"/><path d="m20 8-2.5 6a3 3 0 0 0 5 0z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 13h6"/><path d="M9 17h6"/>',
    pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1"/>',
    building: '<path d="M4 21V5l8-2v18"/><path d="M12 9h8v12"/><path d="M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01"/><path d="M2 21h20"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  };
  const icon = (name, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;

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

  const loginShell = (inner) => `
      <main class="login">
        <div class="card">
          <img src="assets/logo.png" alt="ABFM" class="login-logo">
          <div class="eyebrow">Al Bonian FM</div>
          <h1>Grooming Control</h1>
          <div class="bar-accent"></div>
          ${inner}
          <div style="text-align:center;margin-top:14px">${installButton()}</div>
        </div>
      </main>`;

  /** Checklist app: sign in with your HR number. Managers can switch to the email sign-in. */
  function loginView(root, { title, after }) {
    root.innerHTML = loginShell(`
          <p class="muted small mb">${esc(title)}</p>
          <div class="flash err" id="login-err" hidden></div>
          <form id="login-form">
            <label class="field">HR number<input type="text" name="hr" autocomplete="username" autocapitalize="characters" spellcheck="false" required></label>
            <button class="btn block" type="submit">Sign in</button>
          </form>
          ${sb ? `<p class="small muted" style="text-align:center;margin-top:14px">OCO or manager? <a href="#" class="blue" id="to-admin">Sign in with email</a></p>` : ""}`);
    root.querySelector("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = root.querySelector("#login-err");
      busy(true);
      try { after(await loginHr(formData(e.target).hr.trim())); }
      catch (x) { err.textContent = x.message; err.hidden = false; }
      finally { busy(false); }
    });
    const ta = root.querySelector("#to-admin");
    if (ta) ta.addEventListener("click", (e) => { e.preventDefault(); adminLoginView(root, { after, back: () => loginView(root, { title, after }) }); });
  }

  /** Dashboard admins: email + password (Supabase Auth), with create account, forgot password and new password. */
  function adminLoginView(root, { after, mode, error = "", note = "", back }) {
    mode = mode || (recovering ? "newpw" : "in");
    const T2 = { in: "Sign in with your admin email and password.", up: "Use the email address the OCO added as an admin. You'll get an email to confirm it.", reset: "We'll email you a link to choose a new password.", newpw: "Choose a new password." }[mode];
    root.innerHTML = loginShell(`
          <p class="muted small mb">${T2}</p>
          ${note ? `<div class="flash">${note}</div>` : ""}
          ${error ? `<div class="flash err">${error}</div>` : ""}
          <form id="admin-form">
            ${mode !== "newpw" ? `<label class="field">Email<input type="email" name="email" autocomplete="username" spellcheck="false" required></label>` : ""}
            ${mode !== "reset" ? `<label class="field">${mode === "in" ? "Password" : "New password (at least 8 characters)"}<input type="password" name="pw" minlength="${mode === "in" ? 1 : 8}" autocomplete="${mode === "in" ? "current-password" : "new-password"}" required></label>` : ""}
            <button class="btn block" type="submit">${{ in: "Sign in", up: "Create account", reset: "Send reset link", newpw: "Save new password" }[mode]}</button>
          </form>
          <p class="small muted" style="text-align:center;margin-top:14px">
            ${mode === "in" ? `<a href="#" class="blue" data-mode="up">Create an admin account</a> · <a href="#" class="blue" data-mode="reset">Forgot password?</a>` : mode === "newpw" ? "" : `<a href="#" class="blue" data-mode="in">Back to sign in</a>`}
            ${back && mode === "in" ? `<br><a href="#" class="blue" id="back-hr">Sign in with HR number instead</a>` : ""}
          </p>`);
    root.querySelectorAll("[data-mode]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); adminLoginView(root, { after, mode: a.dataset.mode, back }); }));
    const bh = root.querySelector("#back-hr");
    if (bh) bh.addEventListener("click", (e) => { e.preventDefault(); back(); });
    root.querySelector("#admin-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const email = (f.email || "").trim(), pw = f.pw || "";
      const here = location.href.split("#")[0].split("?")[0];
      busy(true);
      try {
        if (mode === "in") {
          const { error: er } = await sb.auth.signInWithPassword({ email, password: pw });
          if (er) throw new Error(/confirm/i.test(er.message) ? "Please confirm your email first: check your inbox for the link." : /invalid/i.test(er.message) ? "Wrong email or password." : er.message);
          localStorage.removeItem(TOKEN);
          after();
        } else if (mode === "up") {
          const { error: er } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: here } });
          if (er) throw new Error(er.message);
          adminLoginView(root, { after, back, note: "Account created. Check your email and click the link to confirm it, then sign in." });
        } else if (mode === "reset") {
          const { error: er } = await sb.auth.resetPasswordForEmail(email, { redirectTo: here });
          if (er) throw new Error(er.message);
          adminLoginView(root, { after, back, note: "If that email has an account, a reset link is on its way." });
        } else {
          const { error: er } = await sb.auth.updateUser({ password: pw });
          if (er) throw new Error(er.message);
          recovering = false;
          history.replaceState(null, "", here);
          toast("Password saved.");
          after();
        }
      } catch (x) { adminLoginView(root, { after, mode, back, error: esc(x.message) }); }
      finally { busy(false); }
    });
  }
  /** Signed-in admins can change their password. */
  async function changePassword(pw) {
    const { error: er } = await sb.auth.updateUser({ password: pw });
    if (er) throw new Error(er.message);
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

  /** Sites send a daily checklist (supervisors on site), or checks come from the Camp Boss and HSE only. */
  const siteChecklist = () => T.siteChecklist !== "0";
  const countsType = (t) => (siteChecklist() ? t === "site" : t === "site" || t === "camp");

  function overview(D) {
    const today = D.today;
    const from = addDays(today, -13);
    const staffCount = (id) => D.employees.filter((e) => e.active && e.site_id === id).length;
    const acts = openActions(D);
    const comp = (siteId, a, b) => {
      let ok = 0, tot = 0;
      for (const c of D.checks) if (countsType(c.type) && c.site_id === siteId && c.date >= a && c.date <= b && ["pass", "supply", "gaps"].includes(c.status)) { tot++; if (c.status !== "gaps") ok++; }
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
      const checkedToday = new Set(D.checks.filter((c) => c.site_id === s.id && c.date === today).map((c) => c.employee_id)).size;
      return { checkedToday,
        site: s, staff: staffCount(s.id), manager: D.managers.filter((m) => m.sites.includes(s.id)).map((m) => m.name).join(", "),
        todayAt: sub ? sub.time : null, strip, lastAudit: sa[0] || null, open: a.length, overdue: a.filter((x) => x.due_on < today).length,
      };
    });
    const sum = (a, b) => D.mySites.reduce((acc, s) => { const c = comp(s.id, a, b); return { ok: acc.ok + c.ok, tot: acc.tot + c.tot }; }, { ok: 0, tot: 0 });
    const now = sum(from, today), prev = sum(addDays(today, -27), addDays(today, -14));
    const audited = rows.filter((r) => r.lastAudit);
    const staff = D.employees.filter((e) => e.active && D.user.siteIds.includes(e.site_id));
    const kpi = {
      staffTotal: staff.length, checkedToday: rows.reduce((a, r) => a + r.checkedToday, 0),
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
    const notAudited = [], lowField = [], notSent = [];
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
      if (r.staff > 0 && (!last || daysBetween(last.date, today) > 31)) notAudited.push(r.site.name);
      if (siteChecklist() && !r.todayAt && r.staff > 0) notSent.push(r.site.name);
      if (r.staff > 0 && fieldLast7(D, r.site.id, today) < T.fieldChecksPerWeek) lowField.push(r.site.name);
    }
    const names = (l) => l.slice(0, 3).join(", ") + (l.length > 3 ? ` and ${l.length - 3} more` : "");
    if (notSent.length) {
      const past = nowHM() > T.checklistDue;
      out.push({ level: past ? "amber" : "grey", title: `${plural(notSent.length, "site")}: today's checklist ${past ? "overdue" : "not sent yet"}`, detail: `Due by ${T.checklistDue} · ${names(notSent)}`, href: "#/checklists" });
    }
    if (notAudited.length) out.push({ level: "grey", title: `${plural(notAudited.length, "site")} not audited in the last month`, detail: `Every site is audited at least monthly · ${names(notAudited)}`, href: "#/audits" });
    if (lowField.length) out.push({ level: "grey", title: `${plural(lowField.length, "site")} below ${T.fieldChecksPerWeek} field checks this week`, detail: `Random checks during work, last 7 days · ${names(lowField)}`, href: "#/analytics" });
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
      const site = D.checks.filter((c) => c.site_id === s.id && countsType(c.type) && inRange(c.date) && ["pass", "supply", "gaps"].includes(c.status));
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
      if (!countsType(c.type) || c.date < start || !siteIds.includes(c.site_id) || !["pass", "supply", "gaps"].includes(c.status)) continue;
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
  /** Who was checked on a site in a period (any check type), and when checks happen. */
  function coverage(D, siteId, from, to) {
    const staff = D.employees.filter((e) => e.active && e.site_id === siteId);
    const ids = new Set(staff.map((e) => e.id));
    const cs = D.checks.filter((c) => c.site_id === siteId && c.date >= from && c.date <= to && ids.has(c.employee_id));
    const mins = cs.map((c) => { const [h, m] = String(c.time || "").split(":").map(Number); return h * 60 + m; }).filter((x) => x >= 0);
    const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
    const checked = new Set(cs.map((c) => c.employee_id)).size;
    return {
      staff: staff.length, checked, checks: cs.length, pct: staff.length ? (100 * checked) / staff.length : null,
      last: cs.reduce((m, c) => (c.date > m ? c.date : m), ""), avg: avg == null ? null : `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`,
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

  // ---------------- install as an app ----------------
  let deferredInstall = null;
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; document.querySelectorAll("[data-install]").forEach((b) => (b.hidden = false)); });
  window.addEventListener("appinstalled", () => { deferredInstall = null; document.querySelectorAll("[data-install]").forEach((b) => (b.hidden = true)); });
  /** An "Install app" button: shown on Android/desktop Chrome when installable, and on iPhone with instructions. */
  function installButton(cls = "") {
    if (standalone()) return "";
    return `<button type="button" class="install-btn ${cls}" data-install>${icon("download")}Install app</button>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest && e.target.closest("[data-install]");
    if (!b) return;
    if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; b.hidden = true; return; }
    toast(isIOS ? "Open this page in Safari, tap the Share button, then “Add to Home Screen”." : "Open the browser menu (⋮) and choose “Install app” or “Add to Home screen”. If it says “Open app”, it's already installed.");
  });

  // Register the service worker (installs the app and keeps it fast).
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    // A new version takes over: reload once so the screen shows it. Check for updates on open and when the app comes back to the front.
    const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    }).catch(() => {});
  }

  window.G = {
    version: "15", api, logout, loginHr, hasSession, cachedUser, rememberUser, authReady, adminLoginView, changePassword,
    setAuthMode: (m) => { authMode = m; }, isRecovering: () => recovering, esc, nowHM, ordinal, icon, siteChecklist, installButton, initials, addDays, daysBetween, workingDaysBetween, todayLocal, fmtDate, fmtDay, pct, plural,
    toast, busy, formData, shrinkPhoto, loginView,
    findingsFor, index, siteAudits, openActions, supplyAge, fieldLast7, overview, controlEvidence, monthlyReport, periodReport,
    mondayOf, weekly, missedStandards, byTrade, punctuality, coverage, checkerActivity, hrPending, lineChart, barList, tableView, downloadCsv,
  };
})();
