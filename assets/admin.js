/* Management dashboard (admin.html): Director, OCO, HSE, HR, Stores, FM Managers. */
(function () {
  const S = window.STD, T = S.TARGETS, G = window.G;
  const { esc, initials, fmtDate, fmtDay, pct, plural, addDays } = G;
  const root = document.getElementById("root");
  let D = null;

  // ---------------- start / data ----------------
  async function start() {
    const u = G.session();
    if (!u) return G.loginView(root, { title: "Management dashboard. Log in with your username and PIN.", after: afterLogin });
    if (!u.manage) { location.href = "index.html"; return; }
    await load();
    window.addEventListener("hashchange", () => route().then(render));
    await route();
    render();
  }
  function afterLogin(u) {
    if (!u.manage) { location.href = "index.html"; return; }
    start();
  }
  async function load(from) {
    G.busy(true);
    try {
      const out = await G.api("admin", from ? { from } : {});
      D = G.index(out);
      localStorage.setItem("abfm_grooming_user", JSON.stringify(D.user));
    } catch (e) {
      root.innerHTML = `<div class="main"><div class="flash err">${esc(e.message)}</div><button class="btn" onclick="location.reload()">Try again</button> <button class="btn ghost" onclick="G.logout()">Log out</button></div>`;
      throw e;
    } finally { G.busy(false); }
  }
  async function reload() { await load(D.from < addDays(D.today, -100) ? D.from : undefined); render(); }
  /** Make sure data back to `date` is loaded (for older reports and checklists). */
  async function ensureFrom(date) { if (date < D.from) await load(date); }

  let R = { parts: [], q: {} };
  async function route() {
    const [path, qs] = (location.hash.replace(/^#\/?/, "") || "").split("?");
    R = { parts: path.split("/").filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs || "")) };
    if (R.parts[0] === "report" && /^\d{4}-\d{2}$/.test(R.q.month || "")) await ensureFrom(R.q.month + "-01");
    if (R.parts[0] === "checklists" && /^\d{4}-\d{2}-\d{2}$/.test(R.q.date || "")) await ensureFrom(R.q.date);
  }

  const PAGES = {
    "": overviewPage, checklists: checklistsPage, audits: auditsPage, findings: findingsPage, employees: employeesPage,
    supply: supplyPage, training: trainingPage, report: reportPage, settings: settingsPage,
  };
  const NAV = [["", "Overview"], ["checklists", "Daily checklists"], ["audits", "Audits"], ["findings", "Findings & actions"], ["employees", "Employees"], ["supply", "Supply gaps"], ["training", "Training"], ["report", "Monthly report"], ["settings", "Sites & users"]];

  function render() {
    const page = R.parts[0] || "";
    const counts = { findings: G.openActions(D).length, supply: D.supply.filter((g) => !g.issued_on).length };
    let body;
    try { body = (PAGES[page] || overviewPage)(); } catch (e) { console.error(e); body = `<div class="flash err">Could not show this page: ${esc(e.message)}</div>`; }
    root.innerHTML = `
      <div class="shell">
        <aside class="side">
          <div class="brand"><img src="assets/logo.png" alt="ABFM" class="brand-logo"><div class="eyebrow">Al Bonian FM</div><b>Grooming Control</b></div>
          <nav class="nav">${NAV.map(([p, l]) => `<a href="#/${p}" class="${page === p ? "on" : ""}"><span class="d"></span>${l}${counts[p] ? `<span class="cnt">${counts[p]}</span>` : ""}</a>`).join("")}</nav>
          <div class="user"><div class="avatar">${initials(D.user.name)}</div><div><b>${esc(D.user.name)}</b>${esc(S.roleLabel(D.user.role))}
            <div>${D.user.field ? `<a href="index.html">Checklist app</a> · ` : ""}<a href="#" data-logout>Log out</a></div></div></div>
        </aside>
        <main class="main">${body}</main>
      </div>`;
    window.scrollTo(0, 0);
  }

  // ---------------- small helpers ----------------
  const siteName = (id) => (D.siteById[id] || {}).name || "–";
  const empName = (id) => (D.empById[id] || {}).name || "–";
  const head = (eyebrow, title, sub, right = "") => `<div class="head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub ? `<div class="muted small mt-s">${sub}</div>` : ""}</div>${right ? `<div class="filters no-print">${right}</div>` : ""}</div>`;
  const empty = (t) => `<p class="muted" style="padding:8px 0">${t}</p>`;
  const auditScore = (t) => `<span class="nw"><span class="score" ${t < T.auditPass ? 'style="color:var(--red)"' : ""}>${t}</span> <span class="pill ${t >= T.auditPass ? "green" : "red"}">${t >= T.auditPass ? "Pass" : "Fail"}</span></span>`;
  const stripClass = (d) => (d.pct === null ? (d.sent ? "c-g" : "c-x") : !d.sent ? "c-x" : d.pct >= 100 ? "c-g" : d.pct >= 90 ? "c-g2" : d.pct >= 80 ? "c-a" : "c-r");
  const legend = `<span class="legend"><span><i class="c-g"></i>100%</span><span><i class="c-g2"></i>90–99%</span><span><i class="c-a"></i>80–89%</span><span><i class="c-r"></i>&lt;80%</span><span><i class="c-x"></i>Not sent</span></span>`;
  const statusPill = (c) => ({ pass: `<span class="pill green">✓ Pass</span>`, gaps: `<span class="pill red">${plural(c.gaps.filter((g) => !g.supply).length, "gap")}</span>`, supply: `<span class="pill blue">Supply gap</span>`, absent: `<span class="pill amber">Absent</span>`, leave: `<span class="pill grey">On leave</span>` }[c.status]);
  const opts = (list, sel, blank) => (blank ? `<option value="">${blank}</option>` : "") + list.map((x) => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  const staffOf = (siteId) => D.employees.filter((e) => e.active && e.site_id === siteId).sort((a, b) => a.name.localeCompare(b.name));

  // ---------------- overview ----------------
  function overviewPage() {
    const { rows, kpi, alerts } = G.overview(D);
    const delta = kpi.compliance != null && kpi.prev != null ? kpi.compliance - kpi.prev : null;
    return `
      ${head(fmtDay(D.today), D.user.role === "fm_manager" ? "Overview, my sites" : "Overview, all sites", "", `<a class="btn small ghost" href="#" data-refresh>↻ Refresh</a><a class="btn small navy" href="#/report">Monthly report</a>`)}
      <div class="kpis">
        <div class="card kpi"><div class="l">Checklists received today</div><div class="v">${kpi.sentToday}<small> / ${kpi.sites}</small></div><div class="s ${kpi.sentToday < kpi.sites ? "red" : "green"}">${kpi.sites - kpi.sentToday ? `${kpi.sites - kpi.sentToday} site(s) not sent yet` : "All sites sent"}</div></div>
        <div class="card kpi"><div class="l">Staff passing daily check (14 days)</div><div class="v">${pct(kpi.compliance, 1)}</div><div class="s ${delta == null ? "muted" : delta >= 0 ? "green" : "red"}">${delta == null ? "Supply gaps count as pass" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)} pts vs previous 14 days`}</div></div>
        <div class="card kpi"><div class="l">Open audit findings</div><div class="v">${kpi.open}</div><div class="s ${kpi.overdue ? "red" : "muted"}">${kpi.overdue ? `${kpi.overdue} past the ${T.findingCloseDays}-day limit` : `Close within ${T.findingCloseDays} days`}</div></div>
        <div class="card kpi"><div class="l">Average latest audit score</div><div class="v">${kpi.avgAudit == null ? "–" : Math.round(kpi.avgAudit)}<small> / 100</small></div><div class="s muted">Pass mark ${T.auditPass} · ${plural(kpi.below, "site")} below</div></div>
        <div class="card kpi"><div class="l">Staff trained</div><div class="v">${pct(kpi.trained)}</div><div class="s muted">Target 100% by ${fmtDate(T.trainingDeadline)}</div><div class="bar"><i style="width:${kpi.trained || 0}%"></i></div></div>
      </div>
      <div class="grid2">
        <div class="card pad panel"><h3><span>Sites</span>${legend}</h3>
          ${rows.length === 0 ? empty(`No sites yet. Add them under <a class="blue" href="#/settings">Sites & users</a>.`) : `<div class="table-wrap"><table class="t">
            <thead><tr><th>Site</th><th>FM Manager</th><th>Today</th><th>Daily compliance, last 14 days</th><th>Last audit</th><th>Open</th></tr></thead><tbody>
            ${rows.map((r) => `<tr>
              <td><a href="#/checklists/${r.site.id}/${D.today}"><b>${esc(r.site.name)}</b></a><br><span class="muted small">${r.staff} staff</span></td>
              <td>${esc(r.manager) || `<span class="muted">–</span>`}</td>
              <td>${r.todayAt ? `<span class="pill green">✓ ${esc(r.todayAt)}</span>` : `<span class="pill red">Not sent</span>`}</td>
              <td><div class="strip">${r.strip.map((d) => `<i class="${stripClass(d)}" title="${fmtDate(d.date)}: ${d.sent ? (d.pct == null ? "sent" : d.pct + "%") : "not sent"}"></i>`).join("")}</div></td>
              <td>${r.lastAudit ? `<a href="#/audits/${r.lastAudit.id}">${auditScore(r.lastAudit.total)}</a>` : `<span class="muted">None yet</span>`}</td>
              <td>${r.open}${r.overdue ? `<span class="red small"> (${r.overdue} late)</span>` : ""}</td></tr>`).join("")}
            </tbody></table></div>`}
        </div>
        <div class="card pad panel"><h3>Needs attention</h3>
          ${alerts.length === 0 ? empty("Nothing needs attention. 👍") : alerts.slice(0, 12).map((a) => {
            const inner = `<span class="dot ${a.level}"></span><div><b>${esc(a.title)}</b>${esc(a.detail)}</div>`;
            return a.href ? `<a href="${a.href}" class="alert">${inner}</a>` : `<div class="alert">${inner}</div>`;
          }).join("")}
          ${alerts.length > 12 ? `<div class="muted small mt-s">+ ${alerts.length - 12} more</div>` : ""}
        </div>
      </div>`;
  }

  // ---------------- daily checklists ----------------
  function checklistsPage() {
    if (R.parts[1]) return siteDayPage(R.parts[1], R.parts[2] || D.today);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(R.q.date || "") ? R.q.date : D.today;
    return `
      ${head("Daily control", "Daily checklists", fmtDay(date), `
        <a class="btn small ghost" href="#/checklists?date=${addDays(date, -1)}">‹ Previous day</a>
        <input type="date" value="${date}" max="${D.today}" data-goto="#/checklists?date=">
        ${date < D.today ? `<a class="btn small ghost" href="#/checklists?date=${addDays(date, 1)}">Next day ›</a>` : ""}`)}
      <div class="card pad"><div class="table-wrap"><table class="t">
        <thead><tr><th>Site</th><th>Sent to Head Office</th><th>Staff</th><th>Site checks</th><th>Passed</th><th>Gaps</th><th>Supply gap</th><th>Absent / leave</th><th>Camp checks</th><th>Field checks</th></tr></thead><tbody>
        ${D.mySites.map((s) => {
          const sub = D.submissions.find((x) => x.site_id === s.id && x.date === date);
          const n = (t) => D.checks.filter((c) => c.site_id === s.id && c.date === date && c.type === t).length;
          return `<tr class="click"><td><a href="#/checklists/${s.id}/${date}"><b>${esc(s.name)}</b></a></td>
            <td>${sub ? `<span class="pill green">✓ ${esc(sub.time)} · ${esc(sub.by)}</span>` : `<span class="pill red">Not sent</span>`}</td>
            <td>${staffOf(s.id).length}</td><td>${n("site")}</td><td class="green">${sub ? sub.passed : "–"}</td><td class="red">${sub ? sub.gaps : "–"}</td>
            <td class="blue">${sub ? sub.supply : "–"}</td><td>${sub ? sub.absent : "–"}</td><td>${n("camp")}</td><td>${n("field")}</td></tr>`;
        }).join("")}</tbody></table></div></div>`;
  }

  function siteDayPage(siteId, date) {
    const s = D.siteById[siteId];
    if (!s) return empty("Site not found.");
    const sub = D.submissions.find((x) => x.site_id === siteId && x.date === date);
    const rows = D.checks.filter((c) => c.site_id === siteId && c.date === date);
    const checkedSite = new Set(rows.filter((c) => c.type === "site").map((c) => c.employee_id));
    const unchecked = staffOf(siteId).filter((e) => !checkedSite.has(e.id));
    return `
      ${head(`<a href="#/checklists?date=${date}">Daily checklists</a> › ${esc(s.name)}`, fmtDay(date), sub ? `Sent to Head Office at ${esc(sub.time)} by ${esc(sub.by)}` : "Not sent to Head Office", `<button class="btn small ghost" data-print>Print</button>`)}
      ${date === D.today && unchecked.length ? `<div class="flash warn">Not checked on site yet: ${unchecked.map((e) => esc(e.name)).join(", ")}</div>` : ""}
      ${["site", "camp", "field"].map((t) => {
        const list = rows.filter((c) => c.type === t).sort((a, b) => empName(a.employee_id).localeCompare(empName(b.employee_id)));
        if (!list.length) return "";
        return `<div class="card pad panel mb"><h3>${S.CHECK_TYPES[t].label} <span class="muted small">${list.length} checked</span></h3><div class="table-wrap"><table class="t">
          <thead><tr><th>Employee</th><th>Status</th><th>Gaps</th><th>Action taken</th><th>Note</th><th>Checked by</th></tr></thead><tbody>
          ${list.map((c) => {
            const e = D.empById[c.employee_id] || {};
            return `<tr><td><a href="#/employees/${c.employee_id}"><b>${esc(e.name)}</b></a><br><span class="muted small">${esc(e.staff_no)} · ${esc(e.trade)}</span></td>
              <td>${statusPill(c)}${c.finding_no ? `<div class="small muted mt-s">Finding no. ${c.finding_no}</div>` : ""}</td>
              <td class="small">${c.gaps.map((g) => esc(S.itemLabel(g.code)) + (g.supply ? " (supply gap)" : "")).join(", ")}</td>
              <td class="small">${[...new Set(c.gaps.filter((g) => !g.supply).map((g) => S.actionLabel(g.action)).filter(Boolean))].join(", ")}</td>
              <td class="small">${esc(c.note)}${c.photo ? `<div><button class="photo-btn" data-photo="${esc(c.photo)}">📷 Show photo</button></div>` : ""}</td>
              <td class="small nw">${esc(c.by)}<br><span class="muted">${esc(c.time)}</span></td></tr>`;
          }).join("")}</tbody></table></div></div>`;
      }).join("")}
      ${rows.length ? "" : empty("No checks recorded on this day.")}`;
  }

  // ---------------- audits ----------------
  function auditsPage() {
    if (R.parts[1] === "new") return newAuditPage();
    if (R.parts[1]) return auditPage(R.parts[1]);
    return `
      ${head("Independent, unannounced", "Audits", "Every site at least monthly · 5+ staff sampled · pass mark 85 · report within 2 days", D.user.can.audit ? `<a class="btn" href="#/audits/new">+ New audit</a>` : "")}
      <div class="card pad">${D.audits.length === 0 ? empty("No audits recorded yet.") : `<div class="table-wrap"><table class="t">
        <thead><tr><th>Date</th><th>Site</th><th>Auditor</th><th>Sample</th><th>Grooming /30</th><th>PPE /25</th><th>Comms /25</th><th>Control /20</th><th>Total</th><th>Report</th><th>Open actions</th></tr></thead><tbody>
        ${D.audits.map((a) => {
          const open = D.actions.filter((x) => x.audit_id === a.id && !x.closed_on);
          const late = open.filter((x) => x.due_on < D.today).length;
          return `<tr class="click"><td class="nw"><a href="#/audits/${a.id}"><b>${fmtDate(a.date, true)}</b></a></td><td>${esc(siteName(a.site_id))}</td>
            <td>${esc(a.auditor)}${a.with_hse ? `<span class="muted small"><br>with ${esc(a.with_hse)}</span>` : ""}</td><td>${a.sample}</td>
            <td>${a.s_grooming}</td><td>${a.s_ppe}</td><td>${a.s_comm}</td><td>${a.s_control}</td><td>${auditScore(a.total)}</td>
            <td>${a.report_on ? `<span class="pill green">Sent ${fmtDate(a.report_on)}</span>` : G.daysBetween(a.date, D.today) > T.reportDays ? `<span class="pill red">Late</span>` : `<span class="pill grey">Due</span>`}</td>
            <td>${open.length ? `<span class="${late ? "red" : ""}">${open.length}${late ? ` (${late} late)` : ""}</span>` : `<span class="muted">0</span>`}</td></tr>`;
        }).join("")}</tbody></table></div>`}</div>`;
  }

  let AF = null; // new-audit form state
  function newAuditPage() {
    if (!D.user.can.audit) return empty("Only the OCO, HSE or Director can record audits.");
    const siteId = D.mySites.some((s) => s.id === R.q.site) ? R.q.site : "";
    const ev = siteId ? G.controlEvidence(D, siteId, D.today) : null;
    if (!AF || AF.site !== siteId) AF = { site: siteId, date: D.today, scores: { s_grooming: 30, s_ppe: 25, s_comm: 25, s_control: ev ? ev.suggested : 20 }, rows: 3 };
    return `
      ${head(`<a href="#/audits">Audits</a> › New`, "Record an audit", "Sample at least 5 staff on the day, then check the daily checklists and gap log.")}
      <form id="audit-form">
        <div class="grid-half">
          <div class="card pad panel"><h3>Visit</h3>
            <label class="field">Site<select name="site_id" required data-goto="#/audits/new?site="><option value="" disabled ${siteId ? "" : "selected"}>Choose a site…</option>${opts(D.mySites, siteId)}</select></label>
            <div class="grid-form">
              <label class="field">Audit date<input type="date" name="date" value="${AF.date}" max="${D.today}" required data-af="date"></label>
              <label class="field">Staff sampled<input type="number" name="sample" min="1" value="5" required></label>
            </div>
            <label class="field">Auditor<input type="text" value="${esc(D.user.name)}" disabled></label>
            <label class="field">With HSE (name)<input type="text" name="with_hse" placeholder="Optional"></label>
            <label class="field">Notes<textarea name="notes" placeholder="General observations"></textarea></label>
          </div>
          <div class="card pad panel" id="audit-score">${auditScoreBox(ev)}</div>
        </div>
        <div class="card pad panel mt"><h3>Findings and corrective actions <span class="muted small">Due date defaults to ${T.findingCloseDays} days after the audit</span></h3>
          ${siteId ? "" : `<p class="muted small mb">Choose a site to pick staff names.</p>`}
          <div class="table-wrap"><table class="t"><thead><tr><th>Finding</th><th>Staff member (optional)</th><th>Corrective action</th><th>Owner</th><th>Due</th></tr></thead><tbody id="finding-rows">
            ${Array.from({ length: AF.rows }, (_, i) => findingRow(i, siteId)).join("")}
          </tbody></table></div>
          <button type="button" class="linkbtn mt-s" data-addrow>+ Add another finding</button>
          <div class="small muted mt-s">A finding linked to a staff member counts towards that person's warning level.</div>
        </div>
        <div class="row mt" style="justify-content:flex-end"><a class="btn ghost" href="#/audits">Cancel</a><button class="btn" type="submit" ${siteId ? "" : "disabled"}>Save audit</button></div>
      </form>`;
  }
  function findingRow(i, siteId) {
    return `<tr><td><input type="text" name="finding_${i}" placeholder="e.g. No ear plugs at grinder" style="width:100%"></td>
      <td><select name="employee_${i}" style="width:100%"><option value="">– Site / none –</option>${staffOf(siteId).map((e) => `<option value="${e.id}">${esc(e.name)} · ${esc(e.staff_no)}</option>`).join("")}</select></td>
      <td><input type="text" name="action_${i}" placeholder="e.g. Ear plugs issued" style="width:100%"></td>
      <td><input type="text" name="owner_${i}" placeholder="FM Manager" style="width:130px"></td>
      <td><input type="date" name="due_${i}" value="${addDays(AF.date, T.findingCloseDays)}"></td></tr>`;
  }
  function auditScoreBox(ev) {
    const areas = [["s_grooming", "Grooming and uniform", 30], ["s_ppe", "PPE", 25], ["s_comm", "Customer communication", 25], ["s_control", "Daily control evidence (checklists, gap log, field checks)", 20]];
    const total = Object.values(AF.scores).reduce((a, b) => a + (Number(b) || 0), 0);
    const pass = total >= T.auditPass;
    return `<h3>Score</h3>
      ${areas.map(([k, l, max]) => `<div class="area"><div class="top"><span>${l}</span><span class="row" style="gap:6px">
        <input type="number" name="${k}" min="0" max="${max}" value="${AF.scores[k]}" required style="width:70px;padding:5px 8px" data-score="${k}" data-max="${max}"><b>/ ${max}</b></span></div>
        <div class="hbar"><i style="width:${(100 * (Number(AF.scores[k]) || 0)) / max}%"></i></div>
        ${k === "s_control" && ev ? `<div class="small muted mt-s">Last 30 days: ${ev.submitted} of ${ev.days} daily checklists sent · ${ev.field} of ${ev.fieldTarget} field checks. Suggested score: <b>${ev.suggested}</b></div>` : ""}</div>`).join("")}
      <div class="total ${pass ? "pass" : "fail"}"><div class="big">${total}</div><div><b>${pass ? "Pass" : `Below ${T.auditPass}: non-compliant`}</b>
        <div class="small">${pass ? "Site meets the standard." : `FM Manager must send a corrective action plan. Re-audit by ${fmtDate(addDays(AF.date, T.reauditDays))}.`}</div></div></div>`;
  }

  function auditPage(id) {
    const a = D.auditById[id];
    if (!a) return empty("Audit not found.");
    const acts = D.actions.filter((x) => x.audit_id === id);
    const hist = G.siteAudits(D, a.site_id);
    const at = hist.indexOf(a);
    const prev = hist[at + 1];          // audits are sorted newest first
    const later = at > 0 ? hist[at - 1] : null;
    const pass = a.total >= T.auditPass;
    const closed = acts.filter((x) => x.closed_on).length;
    const allClosed = acts.length > 0 && closed === acts.length;
    const lastClose = acts.reduce((m, x) => (x.closed_on && x.closed_on > m ? x.closed_on : m), "");
    const due = { report: addDays(a.date, T.reportDays), plan: addDays(a.date, T.planDays), close: addDays(a.date, T.findingCloseDays) };
    const cls = (done, d) => (done ? "done" : D.today > d ? "late" : "now");
    const btn = (step, done, label) => ((step === "plan" ? D.user.can.closeActions : D.user.can.audit)
      ? `<div class="mt-s no-print">${done ? `<button class="linkbtn" data-step="${step}" data-undo="1">Undo</button>` : `<button class="btn small ghost" data-step="${step}">${label}</button>`}</div>` : "");
    const areas = [["Grooming and uniform", a.s_grooming, 30], ["PPE", a.s_ppe, 25], ["Customer communication", a.s_comm, 25], ["Daily control evidence", a.s_control, 20, "checklists, gap log, field checks"]];
    return `
      ${head(`<a href="#/audits">Audits</a> › ${esc(siteName(a.site_id))}`, `Audit, ${fmtDate(a.date, true)}`, `Unannounced · ${esc(a.auditor)}${a.with_hse ? ` with HSE (${esc(a.with_hse)})` : ""} · ${a.sample} staff sampled`, `<button class="btn small ghost" data-print>Print / save PDF</button>`)}
      ${R.q.created ? `<div class="flash ok">Audit saved. Mark the report as sent once the FM Manager has it.</div>` : ""}
      <div class="audit-grid" style="display:grid;grid-template-columns:minmax(0,400px) minmax(0,1fr);gap:18px">
        <div class="card pad panel"><h3>Score</h3>
          ${areas.map(([l, v, max, sub]) => `<div class="area"><div class="top"><span>${l}${sub ? `<br><span class="muted small">${sub}</span>` : ""}</span><b>${v} / ${max}</b></div><div class="hbar"><i style="width:${(100 * v) / max}%"></i></div></div>`).join("")}
          <div class="total ${pass ? "pass" : "fail"}"><div class="big">${a.total}</div><div><b style="font-size:15px">${pass ? "Pass" : `Below ${T.auditPass}: non-compliant`}</b>
            <div class="small" style="margin-top:3px">${pass ? "The site meets the standard." : `The FM Manager must send a corrective action plan. Re-audit by ${fmtDate(addDays(a.date, T.reauditDays))}.`}</div></div></div>
          ${a.notes ? `<p class="small mt">${esc(a.notes)}</p>` : ""}
        </div>
        <div>
          <div class="steps">
            <div class="step done"><div class="e">Day 0 ✓</div><b>Audit visit</b>${fmtDate(a.date)}</div>
            <div class="step ${cls(a.report_on, due.report)}"><div class="e">By day 2${a.report_on ? " ✓" : ""}</div><b>Report sent</b>${a.report_on ? fmtDate(a.report_on) : `Due ${fmtDate(due.report)}`}${btn("report", a.report_on, "Mark sent")}</div>
            <div class="step ${cls(a.plan_on, due.plan)}"><div class="e">By day 3${a.plan_on ? " ✓" : ""}</div><b>Action plan</b>${a.plan_on ? fmtDate(a.plan_on) : `Due ${fmtDate(due.plan)}`}${btn("plan", a.plan_on, "Mark received")}</div>
            <div class="step ${cls(allClosed || !acts.length, due.close)}"><div class="e">By day 7${allClosed ? " ✓" : D.today > due.close && acts.length ? " · late" : ""}</div><b>Actions closed</b>${!acts.length ? "No findings" : allClosed ? fmtDate(lastClose) : `Due ${fmtDate(due.close)} · ${closed} of ${acts.length}`}</div>
            <div class="step ${a.verified_on ? "done" : ""}"><div class="e">Next visit${a.verified_on ? " ✓" : ""}</div><b>Verified on site</b>${a.verified_on ? fmtDate(a.verified_on) : "By the OCO"}${btn("verified", a.verified_on, "Mark verified")}</div>
          </div>
          <div class="card pad panel"><h3><span>Findings and corrective actions</span>${acts.length ? `<span class="pill ${allClosed ? "green" : "amber"}">${closed} of ${acts.length} closed</span>` : ""}</h3>
            ${acts.length === 0 ? `<p class="muted small">No findings recorded.</p>` : `<div class="table-wrap"><table class="t"><thead><tr><th>Finding</th><th>Staff</th><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>
              ${acts.map((x) => `<tr><td>${esc(x.finding)}</td><td>${x.employee_id ? `<a class="blue" href="#/employees/${x.employee_id}">${esc(empName(x.employee_id))}</a>` : `<span class="muted">(site)</span>`}</td>
                <td>${esc(x.action)}</td><td>${esc(x.owner)}</td><td class="nw">${fmtDate(x.due_on)}</td>
                <td class="nw">${x.closed_on ? `<span class="pill green">Closed ${fmtDate(x.closed_on)}</span>` : x.due_on < D.today ? `<span class="pill red">Overdue</span>` : `<span class="pill amber">Open</span>`}
                  ${D.user.can.closeActions ? `<button class="linkbtn no-print" style="margin-left:6px" data-toggle="${x.id}" ${x.closed_on ? 'data-reopen="1"' : ""}>${x.closed_on ? "Reopen" : "Close"}</button>` : ""}</td></tr>`).join("")}
            </tbody></table></div>`}
            ${D.user.can.closeActions ? `<details class="mt no-print"><summary class="linkbtn" style="cursor:pointer">+ Add a finding</summary>
              <form id="action-form" class="grid-form mt-s" data-audit="${a.id}">
                <label class="field">Finding<input type="text" name="finding" required></label>
                <label class="field">Staff member<select name="employee_id"><option value="">– Site / none –</option>${staffOf(a.site_id).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></label>
                <label class="field">Action<input type="text" name="action"></label>
                <label class="field">Owner<input type="text" name="owner"></label>
                <label class="field">Due<input type="date" name="due_on" value="${due.close}"></label>
                <div style="align-self:end;margin-bottom:12px"><button class="btn small" type="submit">Add</button></div>
              </form></details>` : ""}
          </div>
          <div class="banner mt"><b>Escalation check:</b> ${prev ? `The previous audit (${fmtDate(prev.date)}) scored ${prev.total}. ` : "This is the first audit for this site. "}
            ${!pass && prev && prev.total < T.auditPass ? "This site has failed two audits in a row: escalate to the Director of Operations."
              : !pass ? (later ? `Re-audited on ${fmtDate(later.date)} (${later.total}).` : "If the next audit also fails, the site goes to the Director of Operations.")
              : "A site that fails two audits in a row, or misses closure dates, goes to the Director of Operations."}</div>
        </div>
      </div>`;
  }

  // ---------------- findings ----------------
  function findingsPage() {
    const days = [7, 30, 90].includes(Number(R.q.days)) ? Number(R.q.days) : 30;
    const acts = G.openActions(D);
    const from = addDays(D.today, -days + 1);
    const daily = D.checks.filter((c) => c.status === "gaps" && c.date >= from).sort((a, b) => b.date.localeCompare(a.date) || siteName(a.site_id).localeCompare(siteName(b.site_id)));
    return `
      ${head("Follow-up", "Findings & actions", "Every audit finding is closed within 7 days. Daily-check findings build each person's warning level.")}
      <div class="card pad panel mb"><h3>Open audit actions <span class="muted small">${acts.length} open · ${acts.filter((a) => a.due_on < D.today).length} overdue</span></h3>
        ${acts.length === 0 ? empty("No open actions. 👍") : `<div class="table-wrap"><table class="t"><thead><tr><th>Due</th><th>Site</th><th>Finding</th><th>Staff</th><th>Action</th><th>Owner</th><th>Audit</th><th></th></tr></thead><tbody>
          ${acts.map((x) => { const a = D.auditById[x.audit_id]; return `<tr>
            <td class="nw">${x.due_on < D.today ? `<span class="pill red">${fmtDate(x.due_on)} · late</span>` : fmtDate(x.due_on)}</td><td>${esc(siteName(a.site_id))}</td><td>${esc(x.finding)}</td>
            <td>${x.employee_id ? `<a class="blue" href="#/employees/${x.employee_id}">${esc(empName(x.employee_id))}</a>` : `<span class="muted">(site)</span>`}</td>
            <td>${esc(x.action)}</td><td>${esc(x.owner)}</td><td class="nw"><a class="blue" href="#/audits/${a.id}">${fmtDate(a.date)}</a></td>
            <td>${D.user.can.closeActions ? `<button class="btn small ghost" data-toggle="${x.id}">Close</button>` : ""}</td></tr>`; }).join("")}
        </tbody></table></div>`}
      </div>
      <div class="card pad panel"><h3><span>Daily-check findings</span><span class="chips">${[7, 30, 90].map((d) => `<a href="#/findings?days=${d}" class="chip ${d === days ? "on" : ""}">Last ${d} days</a>`).join("")}</span></h3>
        ${D.from > from ? `<p class="small muted mb">Showing data loaded from ${fmtDate(D.from)}.</p>` : ""}
        ${daily.length === 0 ? empty("No findings in this period.") : `<div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Site</th><th>Employee</th><th>Check</th><th>Gaps</th><th>Action taken</th><th>Warning level</th></tr></thead><tbody>
          ${daily.slice(0, 500).map((c) => { const n = c.finding_no || 1; const real = c.gaps.filter((g) => !g.supply); const e = D.empById[c.employee_id] || {}; return `<tr>
            <td class="nw">${fmtDate(c.date)}</td><td>${esc(siteName(c.site_id))}</td><td><a class="blue" href="#/employees/${c.employee_id}">${esc(e.name)}</a><br><span class="muted small">${esc(e.staff_no)}</span></td>
            <td>${S.CHECK_TYPES[c.type].short}</td><td class="small">${real.map((g) => esc(S.itemLabel(g.code))).join(", ")}</td>
            <td class="small">${[...new Set(real.map((g) => S.actionLabel(g.action)).filter(Boolean))].join(", ")}</td>
            <td><span class="pill ${n >= 3 ? "red" : n === 2 ? "amber" : "grey"}">No. ${n}: ${S.warningFor(n).level}</span></td></tr>`; }).join("")}
        </tbody></table></div>`}
      </div>`;
  }

  // ---------------- employees ----------------
  function employeesPage() {
    if (R.parts[1]) return employeePage(R.parts[1]);
    const q = (R.q.q || "").toLowerCase().trim();
    const site = R.q.site || "";
    const filter = R.q.filter || "";
    let list = D.employees.filter((e) => (filter === "inactive" ? !e.active : e.active) && (!site || e.site_id === site) && (!q || `${e.name} ${e.staff_no} ${e.trade}`.toLowerCase().includes(q)));
    list = list.map((e) => ({ e, n: G.findingsFor(D, e.id, D.today).length, gaps: D.supply.filter((g) => g.employee_id === e.id && !g.issued_on).length, last: D.checks.filter((c) => c.employee_id === e.id).reduce((m, c) => (c.date > m ? c.date : m), "") }));
    if (filter === "repeat") list = list.filter((x) => x.n >= 2).sort((a, b) => b.n - a.n);
    else list.sort((a, b) => a.e.name.localeCompare(b.e.name));
    return `
      ${head("People", "Employees", `${list.length} shown · warning level counts findings in the last 90 days`, `
        <form id="emp-filter" class="filters"><input type="search" name="q" value="${esc(R.q.q || "")}" placeholder="Name, staff ID, trade">
          <select name="site">${opts(D.mySites, site, "All sites")}</select>
          <select name="filter"><option value="">Active</option><option value="repeat" ${filter === "repeat" ? "selected" : ""}>Repeat findings (2+)</option><option value="inactive" ${filter === "inactive" ? "selected" : ""}>Inactive</option></select>
          <button class="btn small navy" type="submit">Filter</button></form>`)}
      <div class="card pad mb"><div class="table-wrap"><table class="t">
        <thead><tr><th>Employee</th><th>Trade</th><th>Site</th><th>Sizes</th><th>Findings (90d)</th><th>Next step</th><th>Trained</th><th>Supply</th><th>Last check</th></tr></thead><tbody>
        ${list.slice(0, 1000).map(({ e, n, gaps, last }) => `<tr class="click">
          <td><a href="#/employees/${e.id}" class="row"><span class="avatar" style="width:30px;height:30px;font-size:11px">${initials(e.name)}</span><span><b>${esc(e.name)}</b><br><span class="muted small">${esc(e.staff_no)}</span></span></a></td>
          <td>${esc(e.trade)}</td><td>${e.site_id ? esc(siteName(e.site_id)) : `<span class="muted">–</span>`}</td>
          <td class="small nw">${e.uniform_size ? `Uniform ${esc(e.uniform_size)}` : ""}${e.shoe_size ? ` · Shoes ${esc(e.shoe_size)}` : ""}</td>
          <td>${n ? `<span class="pill ${n >= 3 ? "red" : n === 2 ? "amber" : "grey"}">${n}</span>` : `<span class="muted">0</span>`}</td>
          <td class="small">${n ? S.warningFor(n + 1).action.split(";")[0].split("(")[0] : ""}</td>
          <td>${e.trained_on ? `<span class="pill green">✓ ${fmtDate(e.trained_on)}</span>` : `<span class="pill grey">No</span>`}</td>
          <td>${gaps ? `<span class="pill blue">${gaps} waiting</span>` : ""}</td><td class="small nw">${fmtDate(last)}</td></tr>`).join("")}
      </tbody></table></div></div>
      ${D.user.can.manageStaff ? `<div class="grid-half">
        <details class="card pad panel"><summary class="linkbtn" style="cursor:pointer">+ Add an employee</summary>${employeeForm({})}</details>
        <details class="card pad panel"><summary class="linkbtn" style="cursor:pointer">⇪ Import from Excel / CSV</summary>
          <form id="import-form" class="mt">
            <p class="small muted mb">Columns, in this order: <b>staff number, name, trade, site, uniform size, shoe size</b>. Copy the rows from Excel and paste them here, or choose a CSV file. Existing staff numbers are updated; new site names are created.</p>
            <label class="field">CSV file<input type="file" name="file" accept=".csv,.txt"></label>
            <label class="field">…or paste rows<textarea name="csv" placeholder="ABFM-1001, Rajesh Kumar, Cleaner, Al Reem Villas, L, 42"></textarea></label>
            <button class="btn small" type="submit">Import</button>
          </form></details></div>` : ""}`;
  }
  function employeeForm(e) {
    return `<form id="employee-form" class="grid-form mt" data-id="${e.id || ""}">
      <label class="field">Staff number<input type="text" name="staff_no" value="${esc(e.staff_no || "")}" required></label>
      <label class="field">Full name<input type="text" name="name" value="${esc(e.name || "")}" required></label>
      <label class="field">Trade<input type="text" name="trade" value="${esc(e.trade || "")}" placeholder="Cleaner, Technician…"></label>
      <label class="field">Site<select name="site_id">${opts(D.mySites, e.site_id, "–")}</select></label>
      <label class="field">Uniform size<input type="text" name="uniform_size" value="${esc(e.uniform_size || "")}"></label>
      <label class="field">Shoe size<input type="text" name="shoe_size" value="${esc(e.shoe_size || "")}"></label>
      ${e.id ? `<label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" ${e.active ? "checked" : ""}> Active</label>` : ""}
      <div><button class="btn small" type="submit">${e.id ? "Save" : "Add employee"}</button></div></form>`;
  }

  function employeePage(id) {
    const e = D.empById[id];
    if (!e) return empty("Employee not found.");
    const finds = G.findingsFor(D, id, D.today);
    const n = finds.length;
    const fm = D.managers.find((m) => m.sites.includes(e.site_id));
    const checks = D.checks.filter((c) => c.employee_id === id).sort((a, b) => b.date.localeCompare(a.date));
    const events = [];
    for (const c of checks) {
      const label = S.CHECK_TYPES[c.type].label;
      const real = c.gaps.filter((g) => !g.supply);
      if (c.status === "pass" && c.type !== "field") continue;
      if (c.status === "gaps") events.push({ d: c.date, cls: "red", t: `${label}: finding${c.finding_no ? ` (no. ${c.finding_no})` : ""}`, x: `${real.map((g) => S.itemLabel(g.code)).join(", ")}. ${[...new Set(real.map((g) => S.actionLabel(g.action)).filter(Boolean))].join(", ")}${c.note ? `. ${c.note}` : ""} · ${c.by}` });
      else if (c.status === "pass") events.push({ d: c.date, cls: "green", t: `${label} passed`, x: `Checked by ${c.by}` });
      else if (c.status === "supply") events.push({ d: c.date, cls: "blue", t: `${label}: supply gap only`, x: c.gaps.map((g) => S.itemLabel(g.code)).join(", ") });
      else events.push({ d: c.date, cls: "", t: c.status === "absent" ? "Absent" : "On leave", x: c.note });
    }
    D.supply.filter((g) => g.employee_id === id).forEach((g) => events.push({ d: g.requested_on, cls: "blue", t: `Supply gap: ${g.item}`, x: g.issued_on ? `Requested ${fmtDate(g.requested_on)} · issued ${fmtDate(g.issued_on)}` : "Still waiting from Stores" }));
    D.actions.filter((x) => x.employee_id === id).forEach((x) => { const a = D.auditById[x.audit_id]; if (a) events.push({ d: a.date, cls: "red", t: "Audit finding", x: `${x.finding}${x.action ? `. ${x.action}` : ""}${x.closed_on ? ` · closed ${fmtDate(x.closed_on)}` : " · open"}`, href: `#/audits/${a.id}` }); });
    if (e.trained_on) events.push({ d: e.trained_on, cls: "amber", t: "Toolbox talk training", x: "Grooming, Etiquette & Work Standards" });
    events.sort((a, b) => b.d.localeCompare(a.d));
    const days = Array.from({ length: 30 }, (_, i) => addDays(D.today, i - 29));
    const cal = days.map((d) => {
      const cs = checks.filter((c) => c.date === d && c.type !== "field");
      if (!cs.length) return { d, cls: "", l: "No check" };
      if (cs.some((c) => c.status === "gaps")) return { d, cls: "c-r", l: "Finding" };
      if (cs.some((c) => ["absent", "leave"].includes(c.status))) return { d, cls: "c-x", l: "Absent / leave" };
      if (cs.some((c) => c.status === "supply")) return { d, cls: "c-g2", l: "Supply gap" };
      return { d, cls: "c-g", l: "Pass" };
    });
    const recent = checks.filter((c) => c.date >= days[0]);
    const nf = recent.filter((c) => c.status === "gaps").length;
    const by = S.ITEMS.map((i) => ({ i, n: checks.filter((c) => c.date >= addDays(D.today, -89) && c.gaps.some((g) => g.code === i.code && !g.supply)).length })).filter((x) => x.n);
    const rung = (k) => (n >= k ? "past" : n + 1 === k ? "next" : "");
    return `
      <div class="head"><div class="row" style="gap:16px"><div class="avatar" style="width:60px;height:60px;font-size:20px">${initials(e.name)}</div>
        <div><div class="eyebrow"><a href="#/employees">Employees</a> › ${esc(e.staff_no)}</div><h1>${esc(e.name)}${e.active ? "" : ` <span class="pill grey">Inactive</span>`}</h1>
          <div class="muted small" style="margin-top:2px">${[e.trade, e.site_id && siteName(e.site_id), fm && `FM Manager ${fm.name}`, e.uniform_size && `Uniform ${e.uniform_size}`, e.shoe_size && `Shoes ${e.shoe_size}`, e.trained_on ? `Training ✓ ${fmtDate(e.trained_on)}` : "Not trained yet"].filter(Boolean).map(esc).join(" · ")}</div></div></div></div>
      <div class="card pad panel mb"><h3><span>Warning level</span><span class="muted small">${plural(n, "finding")} in the last 90 days · supply gaps are never counted</span></h3>
        <div class="ladder">
          <div class="rung ${rung(1)}"><div class="e">1st finding${n >= 1 ? " ✓" : ""}</div><b>Verbal warning</b>${n >= 1 ? fmtDate(finds[n - 1]) : "Correct on the spot · FM Manager or supervisor"}</div>
          <div class="rung ${rung(2)}"><div class="e">${n === 1 ? "Next finding" : `Repeat${n >= 2 ? " ✓" : ""}`}</div><b>Written warning + refresher</b>${n >= 2 ? fmtDate(finds[n - 2]) : "FM Manager with HR"}</div>
          <div class="rung ${n >= 3 ? "past" : n === 2 ? "next" : ""}"><div class="e">${n === 2 ? "Next finding" : `Further repeat${n >= 3 ? " ✓" : ""}`}</div><b>HR disciplinary action</b>Salary deduction possible (amount set by HR)</div>
          <div class="rung"><div class="e">Serious conduct</div><b>Removal from site</b>HR investigation · OCO informed</div>
        </div>
        ${n >= 3 ? `<div class="flash err mt" style="margin-bottom:0">${n} findings in 90 days: refer to HR for disciplinary action.</div>` : ""}
      </div>
      <div class="grid-half">
        <div class="card pad panel"><h3>History</h3>${events.length ? `<div class="tl">${events.slice(0, 40).map((v) => `<div class="ev ${v.cls}"><b>${fmtDate(v.d)} · ${v.href ? `<a class="blue" href="${v.href}">${esc(v.t)}</a>` : esc(v.t)}</b>${v.x ? `<small>${esc(v.x)}</small>` : ""}</div>`).join("")}</div>` : `<p class="muted">Nothing recorded yet.</p>`}</div>
        <div>
          <div class="card pad panel mb"><h3><span>Daily checks · last 30 days</span><span class="pill green">${recent.filter((c) => ["pass", "supply"].includes(c.status)).length} pass · ${plural(nf, "finding")} · ${recent.filter((c) => ["absent", "leave"].includes(c.status)).length} absent</span></h3>
            <div class="cal">${cal.map((c) => `<i class="${c.cls}" ${c.cls ? "" : 'style="background:#f2f2ef"'} title="${fmtDate(c.d)}: ${c.l}"></i>`).join("")}</div>
            <div class="legend mt-s"><span><i class="c-g"></i>Pass</span><span><i class="c-g2"></i>Supply gap</span><span><i class="c-r"></i>Finding</span><span><i class="c-x"></i>Absent / leave</span><span><i style="background:#f2f2ef"></i>No check</span></div>
            <h3 class="mt">Gaps by standard (90 days)</h3>
            ${by.length ? `<table class="t"><tbody>${by.map((x) => `<tr><td>${esc(x.i.label)}<span class="muted small"> · ${S.AREAS.find((a) => a.code === x.i.area).label}</span></td><td><b>${x.n}</b></td></tr>`).join("")}</tbody></table>` : `<p class="muted small">No gaps.</p>`}
          </div>
          ${D.user.can.manageStaff ? `<details class="card pad panel"><summary class="linkbtn" style="cursor:pointer">Edit employee details</summary>${employeeForm(e)}</details>` : ""}
        </div>
      </div>`;
  }

  // ---------------- supply ----------------
  function supplyPage() {
    const issued = R.q.tab === "issued";
    const list = D.supply.filter((g) => (issued ? g.issued_on : !g.issued_on)).sort((a, b) => (issued ? b.issued_on.localeCompare(a.issued_on) : a.requested_on.localeCompare(b.requested_on)));
    const late = issued ? 0 : list.filter((g) => G.supplyAge(g, D.today) > T.supplyWorkingDays).length;
    return `
      ${head("HR / Procurement / Stores", "Supply gaps", `Staff who asked for an item and have not received it are not marked non-compliant. Target: issue within ${T.supplyWorkingDays} working days.`,
        `<span class="chips"><a href="#/supply" class="chip ${issued ? "" : "on"}">Waiting</a><a href="#/supply?tab=issued" class="chip ${issued ? "on" : ""}">Issued</a></span>`)}
      ${late ? `<div class="flash warn">${plural(late, "item")} waiting longer than ${T.supplyWorkingDays} working days.</div>` : ""}
      <div class="card pad">${list.length === 0 ? empty(issued ? "Nothing issued yet." : "Nothing waiting. 👍") : `<div class="table-wrap"><table class="t">
        <thead><tr><th>Requested</th><th>Employee</th><th>Site</th><th>Item</th><th>Size</th><th>${issued ? "Issued" : "Waiting"}</th><th></th></tr></thead><tbody>
        ${list.map((g) => { const e = D.empById[g.employee_id] || {}; const age = G.supplyAge(g, D.today); return `<tr>
          <td class="nw">${fmtDate(g.requested_on)}</td><td><a class="blue" href="#/employees/${g.employee_id}">${esc(e.name)}</a><br><span class="muted small">${esc(e.staff_no)}</span></td>
          <td>${esc(siteName(g.site_id))}</td><td>${esc(g.item)}</td><td class="small">${/uniform/i.test(g.item) ? esc(e.uniform_size) : /shoe/i.test(g.item) ? esc(e.shoe_size) : ""}</td>
          <td class="nw">${issued ? `${fmtDate(g.issued_on)} (${plural(age, "working day")})` : `<span class="pill ${age > T.supplyWorkingDays ? "red" : "blue"}">${plural(age, "working day")}</span>`}</td>
          <td>${!issued && D.user.can.issueSupply ? `<span class="row" style="gap:6px"><input type="date" value="${D.today}" max="${D.today}" min="${g.requested_on}" style="padding:5px 8px" id="on-${g.id}"><button class="btn small ghost" data-issue="${g.id}">Mark issued</button></span>` : ""}</td></tr>`; }).join("")}
      </tbody></table></div>`}</div>`;
  }

  // ---------------- training ----------------
  function trainingPage() {
    const site = R.q.site || "";
    const staff = D.employees.filter((e) => e.active && D.user.siteIds.includes(e.site_id));
    const untrained = staff.filter((e) => !e.trained_on && (!site || e.site_id === site)).sort((a, b) => siteName(a.site_id).localeCompare(siteName(b.site_id)) || a.name.localeCompare(b.name));
    const t = staff.filter((e) => e.trained_on).length;
    return `
      ${head(`Target: 100% by ${fmtDate(T.trainingDeadline, true)}`, "Training", `Staff toolbox talk: Grooming, Etiquette & Work Standards · ${t} of ${staff.length} trained (${staff.length ? Math.round((100 * t) / staff.length) : 0}%)`)}
      <div class="grid-half">
        <div class="card pad panel"><h3>By site</h3><table class="t"><thead><tr><th>Site</th><th>Trained</th><th style="width:40%"></th></tr></thead><tbody>
          ${D.mySites.map((s) => { const st = staffOf(s.id); const n = st.filter((e) => e.trained_on).length; const p = st.length ? Math.round((100 * n) / st.length) : 0;
            return `<tr><td><a href="#/training?site=${s.id}" class="${site === s.id ? "" : "blue"}"><b>${esc(s.name)}</b></a></td><td class="nw">${n} / ${st.length} <span class="muted">(${p}%)</span></td>
              <td><div class="bar" style="margin-top:0"><i style="width:${p}%;${p === 100 ? "background:var(--green)" : ""}"></i></div></td></tr>`; }).join("")}
        </tbody></table></div>
        <div class="card pad panel"><h3><span>Not trained yet${site ? ` · ${esc(siteName(site))}` : ""}</span>${site ? `<a href="#/training" class="linkbtn">All sites</a>` : ""}</h3>
          ${untrained.length === 0 ? `<p class="muted">Everyone is trained. 👍</p>` : `<table class="t"><tbody>${untrained.map((e) => `<tr>
            <td><a class="blue" href="#/employees/${e.id}">${esc(e.name)}</a><br><span class="muted small">${esc(e.staff_no)} · ${esc(e.trade)} · ${esc(siteName(e.site_id))}</span></td>
            <td style="text-align:right">${D.user.can.markTraining ? `<button class="btn small ghost" data-train="${e.id}">Mark trained</button>` : ""}</td></tr>`).join("")}</tbody></table>`}
        </div>
      </div>`;
  }

  // ---------------- monthly report ----------------
  function months() {
    const out = [];
    let [y, m] = D.today.slice(0, 7).split("-").map(Number);
    for (let i = 0; i < 12; i++) { out.push(`${y}-${String(m).padStart(2, "0")}`); if (--m === 0) { m = 12; y--; } }
    return out;
  }
  const monthName = (ym) => new Date(ym + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  function reportPage() {
    const ms = months();
    const month = ms.includes(R.q.month) ? R.q.month : ms[0];
    const rows = G.monthlyReport(D, month);
    const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    return `
      ${head("Monthly report to the COO", monthName(month), `Compliance by site, repeat findings, open actions and supply gaps${month === ms[0] ? ` · month to date (${rows[0] ? rows[0].days : 0} days)` : ""}`,
        `<select data-goto="#/report?month=">${ms.map((m) => `<option value="${m}" ${m === month ? "selected" : ""}>${monthName(m)}</option>`).join("")}</select>
         <button class="btn small ghost" data-csv="${month}">Download CSV (Excel)</button><button class="btn small ghost" data-print>Print / PDF</button>`)}
      <div class="kpis">
        <div class="card kpi"><div class="l">Daily checklists sent</div><div class="v">${sum("sent")}<small> / ${sum("days")}</small></div><div class="s muted">site-days</div></div>
        <div class="card kpi"><div class="l">Daily-check findings</div><div class="v">${sum("findings")}</div><div class="s muted">${sum("repeat")} repeat</div></div>
        <div class="card kpi"><div class="l">Audit actions raised</div><div class="v">${sum("actionsRaised")}</div><div class="s muted">${sum("actionsOnTime")} closed on time · ${sum("actionsOpen")} open</div></div>
        <div class="card kpi"><div class="l">Supply gaps opened</div><div class="v">${sum("supplyOpened")}</div><div class="s muted">${sum("supplyWaiting")} still waiting</div></div>
      </div>
      <div class="card pad"><div class="table-wrap"><table class="t">
        <thead><tr><th>Site</th><th>Staff</th><th>Checklists sent</th><th>Pass rate</th><th>Findings (repeat)</th><th>Field checks</th><th>Audits</th><th>Actions on time / raised</th><th>Open actions</th><th>Supply opened / waiting</th><th>Avg days to issue</th><th>Trained</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td><b>${esc(r.site)}</b></td><td>${r.staff}</td><td class="${r.sent < r.days ? "red" : ""}">${r.sent} / ${r.days}</td><td>${pct(r.passRate, 1)}</td>
          <td>${r.findings}${r.repeat ? `<span class="red"> (${r.repeat})</span>` : ""}</td><td class="${r.field < r.fieldTarget ? "red" : ""}">${r.field} / ${r.fieldTarget}</td>
          <td class="small">${r.audits ? `<span class="${r.latestAudit != null && r.latestAudit < T.auditPass ? "red" : ""}">${esc(r.audits)}</span>` : `<span class="red">None</span>`}</td>
          <td>${r.actionsOnTime} / ${r.actionsRaised}</td><td class="${r.actionsOpen ? "red" : ""}">${r.actionsOpen}</td><td>${r.supplyOpened} / ${r.supplyWaiting}</td>
          <td>${r.supplyAvg == null ? "–" : r.supplyAvg.toFixed(1)}</td><td>${pct(r.trained)}</td></tr>`).join("")}
      </tbody></table></div></div>
      <p class="muted small mt">Targets: 100% trained by ${fmtDate(T.trainingDeadline, true)} · audit score ${T.auditPass}+ · findings closed within ${T.findingCloseDays} days · ${T.fieldChecksPerWeek} field checks per site per week · supply within ${T.supplyWorkingDays} working days.</p>`;
  }
  function downloadCsv(month) {
    const rows = G.monthlyReport(D, month);
    const headRow = ["Site", "Staff", "Days", "Checklists sent", "Site checks", "Pass rate %", "Findings", "Repeat findings", "Field checks", "Field target", "Audits", "Latest audit score", "Actions raised", "Actions closed on time", "Actions open", "Supply gaps opened", "Supply gaps waiting", "Avg working days to issue", "Trained %"];
    const cell = (v) => { const s = v == null ? "" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [headRow, ...rows.map((r) => [r.site, r.staff, r.days, r.sent, r.siteChecks, r.passRate, r.findings, r.repeat, r.field, r.fieldTarget, r.audits, r.latestAudit, r.actionsRaised, r.actionsOnTime, r.actionsOpen, r.supplyOpened, r.supplyWaiting, r.supplyAvg, r.trained])];
    const blob = new Blob(["﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `abfm-grooming-${month}.csv`;
    a.click();
  }

  // ---------------- settings ----------------
  function settingsPage() {
    if (!D.user.can.manageUsers) return head("Setup", "Sites & users") + empty("Only the Administrator or the Director of Operations can manage sites and users.") + pinForm();
    const edit = D.users.find((x) => x.id === R.q.edit);
    const sites = [...D.sites].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return `
      ${head("Setup", "Sites & users")}
      <div class="grid-half">
        <div class="card pad panel"><h3>Users</h3><div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Role</th><th>Sites</th><th></th></tr></thead><tbody>
          ${D.users.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map((x) => { const all = ["director", "oco", "hse", "hr", "stores", "admin"].includes(x.role); return `<tr ${x.active ? "" : 'style="opacity:.5"'}>
            <td><b>${esc(x.name)}</b><br><span class="muted small">${esc(x.username)}</span></td><td class="small">${esc(S.roleLabel(x.role))}</td>
            <td class="small">${all ? `<span class="muted">All sites</span>` : x.sites.map(siteName).map(esc).join(", ") || `<span class="red">None</span>`}</td>
            <td class="nw"><a class="linkbtn" href="#/settings?edit=${x.id}">Edit</a> · <button class="linkbtn" data-user-active="${x.id}" data-v="${x.active ? "" : "1"}">${x.active ? "Deactivate" : "Activate"}</button></td></tr>`; }).join("")}
        </tbody></table></div>
          <form id="user-form" class="mt" data-id="${edit ? edit.id : ""}">
            <h3>${edit ? `Edit ${esc(edit.name)}` : "Add a user"}</h3>
            <div class="grid-form">
              <label class="field">Username<input type="text" name="username" value="${edit ? esc(edit.username) : ""}" ${edit ? "disabled" : "required"} autocapitalize="none"></label>
              <label class="field">Full name<input type="text" name="name" value="${edit ? esc(edit.name) : ""}" required></label>
              <label class="field">Role<select name="role">${S.ROLES.map((r) => `<option value="${r.code}" ${(edit ? edit.role : "supervisor") === r.code ? "selected" : ""}>${r.label}</option>`).join("")}</select></label>
              <label class="field">${edit ? "New PIN (leave empty to keep)" : "PIN (4–8 digits)"}<input type="password" name="pin" inputmode="numeric" pattern="\\d{4,8}" ${edit ? "" : "required"}></label>
            </div>
            <div class="field">Sites (for supervisors, camp bosses, site and FM managers)</div>
            <div class="chips mb">${D.sites.filter((s) => s.active).map((s) => `<label class="chip" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" name="sites" value="${s.id}" ${edit && edit.sites.includes(s.id) ? "checked" : ""}> ${esc(s.name)}</label>`).join("")}</div>
            <div class="row"><button class="btn small" type="submit">${edit ? "Save changes" : "Add user"}</button>${edit ? `<a class="btn small ghost" href="#/settings">Cancel</a>` : ""}</div>
          </form>
        </div>
        <div>
          <div class="card pad panel mb"><h3>Sites</h3><table class="t"><thead><tr><th>Site</th><th>Staff</th><th></th></tr></thead><tbody>
            ${sites.map((s) => `<tr ${s.active ? "" : 'style="opacity:.5"'}><td><b>${esc(s.name)}</b>${s.active ? "" : `<span class="muted small"> (inactive)</span>`}</td><td>${staffOf(s.id).length}</td>
              <td><button class="linkbtn" data-site-active="${s.id}" data-v="${s.active ? "" : "1"}">${s.active ? "Deactivate" : "Activate"}</button></td></tr>`).join("")}
          </tbody></table>
            <form id="site-form" class="row mt"><input type="text" name="name" placeholder="New site name" required class="grow"><button class="btn small" type="submit">Add site</button></form>
            <p class="muted small mt">Staff are added under <a class="blue" href="#/employees">Employees</a>, one by one or by importing your Excel list.</p>
          </div>
          ${pinForm()}
        </div>
      </div>`;
  }
  function pinForm() {
    return `<div class="card pad panel"><h3>Change my PIN</h3><form id="pin-form" class="grid-form">
      <label class="field">Current PIN<input type="password" name="old" inputmode="numeric" required></label>
      <label class="field">New PIN (4–8 digits)<input type="password" name="pin" inputmode="numeric" pattern="\\d{4,8}" required></label>
      <div style="align-self:end;margin-bottom:12px"><button class="btn small" type="submit">Change PIN</button></div></form></div>`;
  }

  // ---------------- events ----------------
  async function act(action, body, msg, after) {
    G.busy(true);
    try {
      const out = await G.api(action, body);
      if (msg) G.toast(typeof msg === "function" ? msg(out) : msg);
      await load(D.from < addDays(D.today, -100) ? D.from : undefined);
      if (after) after(out); else render();
      return out;
    } catch (e) { G.toast(e.message, "err"); }
    finally { G.busy(false); }
  }

  root.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button, a");
    if (!b) return;
    const d = b.dataset;
    if (d.logout !== undefined) { ev.preventDefault(); G.logout(); }
    else if (d.refresh !== undefined) { ev.preventDefault(); await reload(); G.toast("Up to date."); }
    else if (d.print !== undefined) window.print();
    else if (d.csv) downloadCsv(d.csv);
    else if (d.addrow !== undefined) {
      AF.rows++;
      document.getElementById("finding-rows").insertAdjacentHTML("beforeend", findingRow(AF.rows - 1, AF.site));
    } else if (d.step) act("auditStep", { id: R.parts[1], step: d.step, undo: !!d.undo });
    else if (d.toggle) act("toggleAction", { id: d.toggle, reopen: !!d.reopen }, d.reopen ? "Reopened." : "Closed.");
    else if (d.issue) act("issueSupply", { id: d.issue, on: (document.getElementById("on-" + d.issue) || {}).value }, "Marked as issued.");
    else if (d.train) act("trained", { employee_id: d.train }, "Marked as trained.");
    else if (d.userActive) { const x = D.users.find((u) => u.id === d.userActive); act("saveUser", { id: x.id, name: x.name, role: x.role, sites: x.sites, active: !!d.v }, "Saved."); }
    else if (d.siteActive) act("saveSite", { id: d.siteActive, active: !!d.v }, "Saved.");
    else if (d.photo) {
      G.busy(true);
      try {
        const out = await G.api("photo", { id: d.photo });
        b.outerHTML = `<a href="${out.data}" target="_blank"><img src="${out.data}" class="photo-thumb" alt="Check photo"></a>`;
      } catch (e) { G.toast(e.message, "err"); } finally { G.busy(false); }
    }
  });

  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.goto) location.hash = t.dataset.goto + t.value;
    if (t.dataset.af === "date" && AF) { AF.date = t.value; document.getElementById("audit-score").innerHTML = auditScoreBox(AF.site ? G.controlEvidence(D, AF.site, D.today) : null); }
  });
  root.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.dataset.score && AF) {
      AF.scores[t.dataset.score] = Math.max(0, Math.min(Number(t.dataset.max), Number(t.value) || 0));
      const box = document.getElementById("audit-score");
      const pos = t.selectionStart, name = t.name;
      box.innerHTML = auditScoreBox(AF.site ? G.controlEvidence(D, AF.site, D.today) : null);
      const n = box.querySelector(`[name="${name}"]`);
      n.focus();
      try { n.setSelectionRange(pos, pos); } catch (e) {}
    }
  });

  root.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const d = G.formData(f);
    if (f.id === "emp-filter") location.hash = "#/employees?" + new URLSearchParams(Object.entries(d).filter(([, v]) => v));
    else if (f.id === "audit-form") {
      const findings = [];
      for (let i = 0; i < AF.rows; i++) if (d[`finding_${i}`]) findings.push({ finding: d[`finding_${i}`], employee_id: d[`employee_${i}`], action: d[`action_${i}`], owner: d[`owner_${i}`], due_on: d[`due_${i}`] });
      act("createAudit", { site_id: d.site_id, date: d.date, sample: d.sample, with_hse: d.with_hse, notes: d.notes, s_grooming: d.s_grooming, s_ppe: d.s_ppe, s_comm: d.s_comm, s_control: d.s_control, findings },
        "Audit saved.", (out) => { AF = null; location.hash = `#/audits/${out.id}?created=1`; });
    } else if (f.id === "action-form") act("addAction", { audit_id: f.dataset.audit, ...d }, "Finding added.");
    else if (f.id === "employee-form") {
      const body = { ...d, id: f.dataset.id || undefined };
      if (f.dataset.id) body.active = !!d.active;
      act("saveEmployee", body, "Saved.");
    } else if (f.id === "import-form") {
      let text = d.csv || "";
      const file = f.querySelector("input[type=file]").files[0];
      if (file) text = await file.text();
      const rows = text.split(/\r?\n/).map(parseCsvLine).filter((r) => r.length >= 2);
      act("importEmployees", { rows }, (o) => `Import done: ${o.added} added, ${o.updated} updated${o.skipped ? `, ${o.skipped} skipped` : ""}.`);
    } else if (f.id === "user-form") {
      act("saveUser", { id: f.dataset.id || undefined, username: d.username, name: d.name, role: d.role, pin: d.pin, sites: [].concat(d.sites || []) }, "Saved.", () => { location.hash = "#/settings"; render(); });
    } else if (f.id === "site-form") act("saveSite", { name: d.name }, "Site added.");
    else if (f.id === "pin-form") {
      G.busy(true);
      try { await G.api("changePin", d); G.toast("PIN changed."); f.reset(); } catch (e) { G.toast(e.message, "err"); } finally { G.busy(false); }
    }
  });

  function parseCsvLine(line) {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === "," || c === "\t" || c === ";") { out.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  }

  start().catch(() => {});
})();
