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
    if (R.parts[0] === "report") { location.replace("#/reports" + (R.q.month ? `?month=${R.q.month}` : "")); return route(); }
    if (R.parts[0] === "reports" && /^\d{4}-\d{2}$/.test(R.q.month || "")) await ensureFrom(R.q.month + "-01");
    if (R.parts[0] === "reports" && /^\d{4}-\d{2}-\d{2}$/.test(R.q.from || "")) await ensureFrom(R.q.from);
    if (R.parts[0] === "analytics" && Number(R.q.weeks) > 13) await ensureFrom(addDays(G.mondayOf(D.today), -7 * (Number(R.q.weeks) - 1)));
    if (R.parts[0] === "activity" && !ACT) await loadActivity();
    if (R.parts[0] === "checklists" && /^\d{4}-\d{2}-\d{2}$/.test(R.q.date || "")) await ensureFrom(R.q.date);
  }

  const PAGES = {
    "": overviewPage, analytics: analyticsPage, sites: sitePage, checklists: checklistsPage, audits: auditsPage, findings: findingsPage,
    incidents: incidentsPage, hr: hrPage, employees: employeesPage, supply: supplyPage, training: trainingPage, reports: reportsPage,
    activity: activityPage, settings: settingsPage,
  };
  const nav = () => [
    ["Monitor", [["", "Overview", "home"], ["analytics", "Analytics", "trend"], ["checklists", "Daily checklists", "checklist"]]],
    ["Follow up", [["audits", "Audits", "clipboard"], ["findings", "Findings & actions", "flag"], ["incidents", "Incidents", "megaphone"], ["hr", "HR register", "scale"]]],
    ["People", [["employees", "Employees", "users"], ["supply", "Supply gaps", "box"], ["training", "Training & baseline", "cap"]]],
    ["Reports", [["reports", "Reports & exports", "file"], ...(D.user.can.activity ? [["activity", "Activity log", "pulse"]] : [])]],
    ["Admin", [["settings", D.user.can.settings ? "Sites, users & rules" : "Settings", "settings"]]],
  ];

  function render() {
    const page = R.parts[0] || "";
    const counts = {
      findings: G.openActions(D).length, supply: D.supply.filter((g) => !g.issued_on).length,
      incidents: D.incidents.filter((x) => x.status === "open").length, hr: G.hrPending(D).length,
    };
    let body;
    try { body = (PAGES[page] || overviewPage)(); } catch (e) { console.error(e); body = `<div class="flash err">Could not show this page: ${esc(e.message)}</div>`; }
    root.innerHTML = `
      <div class="shell">
        <aside class="side">
          <div class="brand"><img src="assets/logo.png" alt="Al Bonian FM" class="brand-logo"><b>Grooming<br>Control</b></div>
          <nav class="nav">${nav().map(([g, items]) => `<div class="nav-group">${g}</div>${items.map(([p, l, ic]) => `<a href="#/${p}" class="${page === p ? "on" : ""}">${G.icon(ic)}${l}${counts[p] ? `<span class="cnt ${["incidents", "hr"].includes(p) ? "hot" : ""}">${counts[p]}</span>` : ""}</a>`).join("")}`).join("")}</nav>
          <div class="user"><div class="avatar">${initials(D.user.name)}</div><div><b>${esc(D.user.name)}</b>${esc(S.roleLabel(D.user.role))}
            <div>${D.user.field ? `<a href="index.html">Checklist app</a> · ` : ""}<a href="#" data-logout>Log out</a></div></div></div>
        </aside>
        <main class="main">${D.outdatedBackend ? `<div class="notice no-print"><b>Update needed:</b> paste the latest <code>setup/grooming-backend.gs</code> into your Google Apps Script and deploy a new version to turn on incidents, the HR register, rules and the activity log (README, “Updating”).</div>` : ""}${body}</main>
      </div>`;
    window.scrollTo(0, 0);
  }

  // ---------------- small helpers ----------------
  const siteName = (id) => (D.siteById[id] || {}).name || "–";
  const empName = (id) => (D.empById[id] || {}).name || "–";
  const head = (eyebrow, title, sub, right = "") => `<div class="head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub ? `<div class="muted small mt-s">${sub}</div>` : ""}</div>${right ? `<div class="filters no-print">${right}</div>` : ""}</div>`;
  /** A page that can't be shown: keeps the heading and a way back. */
  const blocked = (title, text, back = "#/", backLabel = "Back to the overview") => `${head("", esc(title))}<div class="card pad"><p class="muted">${text}</p><p class="mt-s"><a class="blue" href="${back}">${backLabel}</a></p></div>`;
  const empty = (t) => `<p class="muted" style="padding:8px 0">${t}</p>`;
  const auditScore = (t) => `<span class="nw"><span class="score" ${t < T.auditPass ? 'style="color:var(--red)"' : ""}>${t}</span> <span class="pill ${t >= T.auditPass ? "green" : "red"}">${t >= T.auditPass ? "Pass" : "Fail"}</span></span>`;
  const stripClass = (d) => (d.pct === null ? (d.sent && G.siteChecklist() ? "c-g" : "c-x") : !d.sent && G.siteChecklist() ? "c-x" : d.pct >= 100 ? "c-g" : d.pct >= 90 ? "c-g2" : d.pct >= 80 ? "c-a" : "c-r");
  const legend = () => `<span class="legend"><span><i class="c-g"></i>100%</span><span><i class="c-g2"></i>90–99%</span><span><i class="c-a"></i>80–89%</span><span><i class="c-r"></i>&lt;80%</span><span><i class="c-x"></i>${G.siteChecklist() ? "Not sent" : "No checks"}</span></span>`;
  const statusPill = (c) => ({ pass: `<span class="pill green">Pass</span>`, gaps: `<span class="pill red">${plural(c.gaps.filter((g) => !g.supply).length, "gap")}</span>`, supply: `<span class="pill blue">Supply gap</span>`, absent: `<span class="pill amber">Absent</span>`, leave: `<span class="pill grey">On leave</span>` }[c.status]);
  const opts = (list, sel, blank) => (blank ? `<option value="">${blank}</option>` : "") + list.map((x) => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  const staffOf = (siteId) => D.employees.filter((e) => e.active && e.site_id === siteId).sort((a, b) => a.name.localeCompare(b.name));

  // ---------------- overview ----------------
  function overviewPage() {
    const { rows, kpi, alerts } = G.overview(D);
    const delta = kpi.compliance != null && kpi.prev != null ? kpi.compliance - kpi.prev : null;
    return `
      ${head(fmtDay(D.today), D.user.role === "fm_manager" ? "Overview, my sites" : "Overview, all sites", "", `<a class="btn small ghost" href="#" data-refresh>${G.icon("refresh")}Refresh</a><a class="btn small ghost" href="#/analytics">Analytics</a><a class="btn small navy" href="#/reports">Reports</a>`)}
      <div class="kpis six">
        ${!G.siteChecklist() ? `<a href="#/checklists" class="card kpi"><div class="l">Staff checked today</div><div class="v">${kpi.checkedToday}<small> / ${kpi.staffTotal}</small></div><div class="s muted">Camp, site and field checks</div></a>` : ""}
        <a href="#/checklists" class="card kpi" ${G.siteChecklist() ? "" : "hidden"}><div class="l">Checklists today</div><div class="v">${kpi.sentToday}<small> / ${kpi.sites}</small></div><div class="s ${kpi.sentToday < kpi.sites ? "red" : "green"}">${kpi.sites - kpi.sentToday ? `${kpi.sites - kpi.sentToday} site(s) not sent yet` : "All sites sent"}${kpi.lateToday ? ` · ${kpi.lateToday} late` : ""}</div></a>
        <div class="card kpi"><div class="l">Pass rate, 14 days</div><div class="v">${pct(kpi.compliance, 1)}</div><div class="s ${delta == null || Math.abs(delta) < 0.05 ? "muted" : delta > 0 ? "green" : "red"}">${delta == null ? "Supply gaps count as pass" : Math.abs(delta) < 0.05 ? "Same as the 14 days before" : `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta).toFixed(1)} pts on the 14 days before`}</div></div>
        <a href="#/findings" class="card kpi"><div class="l">Open audit findings</div><div class="v">${kpi.open}</div><div class="s ${kpi.overdue ? "red" : "muted"}">${kpi.overdue ? `${kpi.overdue} past the ${T.findingCloseDays}-day limit` : `Close within ${T.findingCloseDays} days`}</div></a>
        <div class="card kpi"><div class="l">Average audit score</div><div class="v">${kpi.avgAudit == null ? "–" : Math.round(kpi.avgAudit)}<small> / 100</small></div><div class="s muted">Pass mark ${T.auditPass} · ${plural(kpi.below, "site")} below</div></div>
        <a href="#/incidents" class="card kpi"><div class="l">Open incidents</div><div class="v">${kpi.incidentsOpen}</div><div class="s muted">Reported from site</div></a>
        <a href="#/hr" class="card kpi"><div class="l">HR steps due</div><div class="v">${kpi.hrPending}</div><div class="s ${kpi.hrPending ? "red" : "muted"}">${kpi.hrPending ? "Not recorded yet" : "All recorded"}</div></a>
      </div>
      <div class="grid2">
        <div class="card pad panel"><h3><span>Sites</span>${legend()}</h3>
          ${rows.length === 0 ? empty(`No sites yet. Add them under <a class="blue" href="#/settings">Sites & users</a>.`) : `<div class="table-wrap"><table class="t">
            <thead><tr><th>Site</th><th>FM Manager</th><th>${G.siteChecklist() ? "Today" : "Checked today"}</th><th>Daily compliance, last 14 days</th><th>Last audit</th><th>Open</th></tr></thead><tbody>
            ${rows.map((r) => `<tr>
              <td class="nw"><a href="#/sites/${r.site.id}"><b>${esc(r.site.name)}</b></a><br><span class="muted small">${r.staff} staff</span></td>
              <td class="nw">${esc(r.manager) || `<span class="muted">–</span>`}</td>
              <td><a href="#/checklists/${r.site.id}/${D.today}">${!G.siteChecklist() ? (r.checkedToday ? `<span class="pill green">${r.checkedToday} of ${r.staff}</span>` : `<span class="pill grey">None yet</span>`) : r.todayAt ? (r.todayAt > T.checklistDue ? `<span class="pill amber">${esc(r.todayAt)} late</span>` : `<span class="pill green">${esc(r.todayAt)}</span>`) : `<span class="pill ${G.nowHM() > T.checklistDue ? "red" : "grey"}">Not sent</span>`}</a></td>
              <td><div class="strip">${r.strip.map((d) => `<i class="${stripClass(d)}" title="${fmtDate(d.date)}: ${d.pct == null ? (G.siteChecklist() && d.sent ? "sent" : "no checks") : d.pct + "% passed"}${G.siteChecklist() && !d.sent ? ", not sent" : ""}"></i>`).join("")}</div></td>
              <td>${r.lastAudit ? `<a href="#/audits/${r.lastAudit.id}">${auditScore(r.lastAudit.total)}</a>` : `<span class="muted">None yet</span>`}</td>
              <td class="nw">${r.open}${r.overdue ? `<span class="red small"> · ${r.overdue} late</span>` : ""}</td></tr>`).join("")}
            </tbody></table></div>`}
        </div>
        <div class="card pad panel"><h3>Needs attention</h3>
          ${alerts.length === 0 ? empty("Nothing needs attention.") : alerts.slice(0, R.q.all ? 99 : 6).map((a) => {
            const inner = `<span class="dot ${a.level}"></span><div><b>${esc(a.title)}</b>${esc(a.detail)}</div>`;
            return a.href ? `<a href="${a.href}" class="alert">${inner}</a>` : `<div class="alert">${inner}</div>`;
          }).join("")}
          ${alerts.length > 6 && !R.q.all ? `<a class="linkbtn mt-s" style="display:inline-block" href="#/?all=1">Show all ${alerts.length}</a>` : ""}
        </div>
      </div>
      ${trendAndMissed(D.user.siteIds, 12, addDays(D.today, -29), D.today, "Most-missed standards, last 30 days")}`;
  }

  /** Two charts used on several pages: weekly pass rate and most-missed standards. */
  function trendAndMissed(siteIds, weeks, from, to, missedTitle) {
    let w = G.weekly(D, siteIds, weeks);
    const firstData = w.findIndex((x) => x.tot > 0);
    if (firstData > 0) w = w.slice(Math.min(firstData, w.length - 2));   // skip weeks before the first check
    const pts = w.map((x) => ({ label: fmtDate(x.week), value: x.pct, tip: `Week of ${fmtDate(x.week)}: ${x.pct == null ? "no checks" : `${x.pct.toFixed(1)}% passed (${x.tot - x.ok} of ${x.tot} with gaps)`}` }));
    const m = G.missedStandards(D, siteIds, from, to);
    const rows = m.rows.slice(0, 8).map((r) => ({ label: r.label, value: r.n, display: String(r.n), tip: `${r.label}: failed ${r.n} times in ${m.checks} checks (${((100 * r.n) / Math.max(1, m.checks)).toFixed(1)}%)` }));
    return `<div class="grid-half mt">
      <div class="card pad panel"><h3><span>Site-check pass rate by week</span><span class="muted small">last ${weeks} weeks · supply gaps count as pass</span></h3>
        ${G.lineChart(pts, { title: "Weekly pass rate" })}
        ${G.tableView(["Week of", "Checks", "With gaps", "Pass rate"], w.map((x) => [fmtDate(x.week, true), x.tot, x.tot - x.ok, x.pct == null ? "–" : x.pct.toFixed(1) + "%"]))}</div>
      <div class="card pad panel"><h3><span>${esc(missedTitle)}</span><span class="muted small">times failed · supply gaps excluded</span></h3>
        ${G.barList(rows)}
        ${m.rows.length ? G.tableView(["Standard", "Times failed", "Share of checks"], m.rows.map((r) => [r.label, r.n, ((100 * r.n) / Math.max(1, m.checks)).toFixed(1) + "%"])) : ""}</div>
    </div>`;
  }

  // ---------------- daily checklists ----------------
  function checklistsPage() {
    if (R.parts[1]) return siteDayPage(R.parts[1], R.parts[2] || D.today);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(R.q.date || "") ? R.q.date : D.today;
    return `
      ${head("Daily control", "Daily checklists", `${fmtDay(date)} · due by ${esc(T.checklistDue)}`, `
        <a class="btn small ghost" href="#/checklists?date=${addDays(date, -1)}">‹ Previous day</a>
        <input type="date" value="${date}" max="${D.today}" data-goto="#/checklists?date=">
        ${date < D.today ? `<a class="btn small ghost" href="#/checklists?date=${addDays(date, 1)}">Next day ›</a>` : ""}`)}
      <div class="card pad"><div class="table-wrap"><table class="t">
        <thead><tr><th>Site</th><th>Sent to Head Office</th><th>Staff</th><th>Site checks</th><th>Passed</th><th>Gaps</th><th>Supply gap</th><th>Absent / leave</th><th>Camp checks</th><th>Field checks</th></tr></thead><tbody>
        ${D.mySites.map((s) => {
          const sub = D.submissions.find((x) => x.site_id === s.id && x.date === date);
          const n = (t) => D.checks.filter((c) => c.site_id === s.id && c.date === date && c.type === t).length;
          return `<tr class="click"><td><a href="#/checklists/${s.id}/${date}"><b>${esc(s.name)}</b></a></td>
            <td>${sub ? `<span class="pill ${sub.time > T.checklistDue ? "amber" : "green"}">${esc(sub.time)}${sub.time > T.checklistDue ? " late" : ""} · ${esc(sub.by)}</span>` : `<span class="pill red">Not sent</span>`}</td>
            <td>${staffOf(s.id).length}</td><td>${n("site")}</td><td class="green">${sub ? sub.passed : "–"}</td><td class="red">${sub ? sub.gaps : "–"}</td>
            <td class="blue">${sub ? sub.supply : "–"}</td><td>${sub ? sub.absent : "–"}</td><td>${n("camp")}</td><td>${n("field")}</td></tr>`;
        }).join("")}</tbody></table></div></div>`;
  }

  function siteDayPage(siteId, date) {
    const s = D.siteById[siteId];
    if (!s) return blocked("Site not found", "This site doesn't exist or is switched off.", "#/checklists", "Back to daily checklists");
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
              <td class="small">${esc(c.note)}${c.photo ? `<div><button class="photo-btn" data-photo="${esc(c.photo)}">${G.icon("camera")}Show photo</button></div>` : ""}</td>
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
    if (!D.user.can.audit) return blocked("Record an audit", "Only the Operations Control Officer or the Director of Operations can record audits.", "#/audits", "Back to audits");
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
    if (!a) return blocked("Audit not found", "This audit doesn't exist or belongs to a site you can't see.", "#/audits", "Back to audits");
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
        ${acts.length === 0 ? empty("No open actions.") : `<div class="table-wrap"><table class="t"><thead><tr><th>Due</th><th>Site</th><th>Finding</th><th>Staff</th><th>Action</th><th>Owner</th><th>Audit</th><th></th></tr></thead><tbody>
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
          <td>${e.trained_on ? `<span class="pill green">${fmtDate(e.trained_on)}</span>` : `<span class="pill grey">No</span>`}</td>
          <td>${gaps ? `<span class="pill blue">${gaps} waiting</span>` : ""}</td><td class="small nw">${fmtDate(last)}</td></tr>`).join("")}
      </tbody></table></div></div>
      ${D.user.can.manageStaff ? `<div class="grid-half">
        <details class="card pad panel"><summary class="linkbtn" style="cursor:pointer">+ Add an employee</summary>${employeeForm({})}</details>
        <details class="card pad panel"><summary class="linkbtn" style="cursor:pointer">${G.icon("upload")}Import from Excel / CSV</summary>
          <form id="import-form" class="mt">
            <p class="small muted mb">Columns, in this order: <b>staff number, name, trade, site, uniform size, shoe size, accommodation</b>. Copy the rows from Excel and paste them here, or choose a CSV file. Existing staff numbers are updated; new site names are created.</p>
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
      <label class="field">Accommodation (camp)<input type="text" name="accommodation" value="${esc(e.accommodation || "")}" placeholder="e.g. Al Quoz Camp" list="camp-list"><datalist id="camp-list">${[...new Set(D.employees.map((x) => x.accommodation).filter(Boolean))].sort().map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      ${e.id ? `<label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" ${e.active ? "checked" : ""}> Active</label>` : ""}
      <div><button class="btn small" type="submit">${e.id ? "Save" : "Add employee"}</button></div></form>`;
  }

  function employeePage(id) {
    const e = D.empById[id];
    if (!e) return blocked("Employee not found", "This person isn't in your sites.", "#/employees", "Back to employees");
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
    if (e.baseline_on) events.push({ d: e.baseline_on, cls: "", t: "Baseline check", x: `Holds: ${e.ppe_held.map(S.baselineLabel).join(", ") || "nothing recorded"}${e.missing ? ` · missing: ${e.missing}` : ""}` });
    D.discipline.filter((x) => x.employee_id === id).forEach((x) => events.push({ d: x.date, cls: "amber", t: `HR: ${S.levelLabel(x.level)}`, x: `${x.action || ""}${x.amount != null ? ` · AED ${x.amount}` : ""}${x.notes ? ` · ${x.notes}` : ""} · ${x.by}` }));
    D.incidents.filter((x) => x.employee_id === id).forEach((x) => events.push({ d: x.date, cls: "red", t: `Incident: ${S.incidentLabel(x.type)}`, x: `${x.details} (${x.status})`, href: "#/incidents?status=all" }));
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
          <div class="muted small" style="margin-top:2px">${[e.trade, e.site_id && siteName(e.site_id), e.accommodation, fm && `FM Manager ${fm.name}`, e.uniform_size && `Uniform ${e.uniform_size}`, e.shoe_size && `Shoes ${e.shoe_size}`, e.trained_on ? `Training ✓ ${fmtDate(e.trained_on)}` : "Not trained yet"].filter(Boolean).map(esc).join(" · ")}</div></div></div></div>
      <div class="card pad panel mb"><h3><span>Warning level</span><span class="muted small">${plural(n, "finding")} in the last ${T.warningWindowDays} days · supply gaps are never counted</span></h3>
        <div class="ladder">
          <div class="rung ${rung(1)}"><div class="e">1st finding${n >= 1 ? " ✓" : ""}</div><b>Verbal warning</b>${n >= 1 ? fmtDate(finds[n - 1]) : "Correct on the spot · FM Manager or supervisor"}</div>
          <div class="rung ${rung(2)}"><div class="e">${n === 1 ? "Next finding" : `Repeat${n >= 2 ? " ✓" : ""}`}</div><b>Written warning + refresher</b>${n >= 2 ? fmtDate(finds[n - 2]) : "FM Manager with HR"}</div>
          <div class="rung ${n >= 3 ? "past" : n === 2 ? "next" : ""}"><div class="e">${n === 2 ? "Next finding" : `Further repeat${n >= 3 ? " ✓" : ""}`}</div><b>HR disciplinary action</b>Salary deduction possible (amount set by HR)</div>
          <div class="rung"><div class="e">Serious conduct</div><b>Removal from site</b>HR investigation · OCO informed</div>
        </div>
        ${n >= 3 ? `<div class="flash err mt" style="margin-bottom:0">${n} findings in ${T.warningWindowDays} days: refer to HR for disciplinary action.</div>` : ""}
        ${(() => { const p = G.hrPending(D).find((h) => h.emp.id === id); return p ? `<div class="flash warn mt" style="margin-bottom:0"><b>Not recorded yet:</b> ${p.needs.map((x) => esc(S.levelLabel(x.level))).join(", ")}. ${D.user.can.discipline ? `<a class="blue" href="#/hr">Record in the HR register</a>` : ""}</div>` : ""; })()}
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
          <div class="card pad panel mb"><h3><span>Baseline</span><span class="muted small">${e.baseline_on ? `checked ${fmtDate(e.baseline_on, true)}` : "not done yet"}</span></h3>
            ${e.baseline_on ? `<div class="chips">${S.BASELINE_ITEMS.map((i) => `<span class="pill ${e.ppe_held.includes(i.code) ? "green" : "red"}">${esc(i.label)}</span>`).join("")}</div>${e.missing ? `<p class="small mt-s">Other missing: ${esc(e.missing)}</p>` : ""}` : `<p class="muted small">The FM Manager or supervisor records sizes and PPE held in the checklist app (Training & baseline).</p>`}
          </div>
          ${D.user.can.discipline ? `<details class="card pad panel mb"><summary class="linkbtn" style="cursor:pointer">+ Record an HR step</summary>${hrForm(e.id, "written", "").replace('class="card pad panel mb"', 'class="mt"')}</details>` : ""}
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
      <div class="card pad">${list.length === 0 ? empty(issued ? "Nothing issued yet." : "Nothing waiting.") : `<div class="table-wrap"><table class="t">
        <thead><tr><th>Requested</th><th>Employee</th><th>Site</th><th>Item</th><th>Size</th><th>${issued ? "Issued" : "Waiting"}</th><th></th></tr></thead><tbody>
        ${list.map((g) => { const e = D.empById[g.employee_id] || {}; const age = G.supplyAge(g, D.today); return `<tr>
          <td class="nw">${fmtDate(g.requested_on)}</td><td><a class="blue" href="#/employees/${g.employee_id}">${esc(e.name)}</a><br><span class="muted small">${esc(e.staff_no)}</span></td>
          <td>${esc(siteName(g.site_id))}</td><td>${esc(g.item)}</td><td class="small">${/uniform/i.test(g.item) ? esc(e.uniform_size) : /shoe/i.test(g.item) ? esc(e.shoe_size) : ""}</td>
          <td class="nw">${issued ? `${fmtDate(g.issued_on)} (${plural(age, "working day")})` : `<span class="pill ${age > T.supplyWorkingDays ? "red" : "blue"}">${plural(age, "working day")}</span>`}</td>
          <td>${!issued && D.user.can.issueSupply ? `<span class="row" style="gap:6px"><input type="date" value="${D.today}" max="${D.today}" min="${g.requested_on}" style="padding:5px 8px" id="on-${g.id}"><button class="btn small ghost" data-issue="${g.id}">Mark issued</button></span>` : ""}</td></tr>`; }).join("")}
      </tbody></table></div>`}</div>`;
  }

  // ---------------- training & baseline ----------------
  function trainingPage() {
    const site = R.q.site || "";
    const show = R.q.show === "baseline" ? "baseline" : "training";
    const staff = D.employees.filter((e) => e.active && D.user.siteIds.includes(e.site_id));
    const todo = staff.filter((e) => (show === "baseline" ? !e.baseline_on : !e.trained_on) && (!site || e.site_id === site)).sort((a, b) => siteName(a.site_id).localeCompare(siteName(b.site_id)) || a.name.localeCompare(b.name));
    const t = staff.filter((e) => e.trained_on).length;
    const bl = staff.filter((e) => e.baseline_on).length;
    const bar = (p) => `<div class="bar" style="margin-top:0"><i style="width:${p}%;${p === 100 ? "background:var(--green)" : ""}"></i></div>`;
    const missingPpe = staff.filter((e) => e.baseline_on && S.BASELINE_ITEMS.some((i) => !e.ppe_held.includes(i.code))).length;
    return `
      ${head(`Training target: 100% by ${fmtDate(T.trainingDeadline, true)}`, "Training & baseline", `Toolbox talk: ${t} of ${staff.length} trained (${staff.length ? Math.round((100 * t) / staff.length) : 0}%) · Baseline check: ${bl} of ${staff.length} (${staff.length ? Math.round((100 * bl) / staff.length) : 0}%) · ${plural(missingPpe, "person", "people")} missing PPE at baseline`)}
      <div class="grid-half">
        <div class="card pad panel"><h3>By site</h3><table class="t"><thead><tr><th>Site</th><th>Trained</th><th style="width:22%"></th><th>Baseline</th><th style="width:22%"></th></tr></thead><tbody>
          ${D.mySites.map((s) => { const st = staffOf(s.id); const n = st.filter((e) => e.trained_on).length; const b = st.filter((e) => e.baseline_on).length; const p = st.length ? Math.round((100 * n) / st.length) : 0; const q = st.length ? Math.round((100 * b) / st.length) : 0;
            return `<tr><td><a href="#/training?site=${s.id}&show=${show}" class="${site === s.id ? "" : "blue"}"><b>${esc(s.name)}</b></a></td><td class="nw">${n} / ${st.length}</td><td>${bar(p)}</td><td class="nw">${b} / ${st.length}</td><td>${bar(q)}</td></tr>`; }).join("")}
        </tbody></table>
        <p class="small muted mt">Baseline checks are recorded on the phone (Training tab): sizes, PPE held and missing items. Unticked items go to Stores.</p></div>
        <div class="card pad panel"><h3><span class="chips"><a class="chip ${show === "training" ? "on" : ""}" href="#/training?show=training${site ? `&site=${site}` : ""}">Not trained</a><a class="chip ${show === "baseline" ? "on" : ""}" href="#/training?show=baseline${site ? `&site=${site}` : ""}">No baseline</a></span>${site ? `<a href="#/training?show=${show}" class="linkbtn">All sites</a>` : ""}</h3>
          ${todo.length === 0 ? `<p class="muted">Everyone is done.</p>` : `<table class="t"><tbody>${todo.map((e) => `<tr>
            <td><a class="blue" href="#/employees/${e.id}">${esc(e.name)}</a><br><span class="muted small">${esc(e.staff_no)} · ${esc(e.trade)} · ${esc(siteName(e.site_id))}</span></td>
            <td style="text-align:right">${show === "training" && D.user.can.markTraining ? `<button class="btn small ghost" data-train="${e.id}">Mark trained</button>` : ""}</td></tr>`).join("")}</tbody></table>`}
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
  // ---------------- reports & exports ----------------
  const REPORT_TABS = [["monthly", "Monthly report (COO)"], ["period", "Period report"], ["exports", "Data exports"]];
  function reportsPage() {
    const tab = REPORT_TABS.some(([k]) => k === R.q.tab) ? R.q.tab : "monthly";
    const tabs = `<div class="tabs no-print">${REPORT_TABS.map(([k, l]) => `<a href="#/reports?tab=${k}" class="${k === tab ? "on" : ""}">${l}</a>`).join("")}</div>`;
    if (tab === "period") return periodPage(tabs);
    if (tab === "exports") return exportsPage(tabs);
    const ms = months();
    const month = ms.includes(R.q.month) ? R.q.month : ms[0];
    const rows = G.monthlyReport(D, month);
    return `
      ${head("Monthly report to the COO", monthName(month), `Compliance by site, repeat findings, open actions and supply gaps${month === ms[0] ? ` · month to date (${rows[0] ? rows[0].days : 0} days)` : ""}`,
        `<select data-goto="#/reports?tab=monthly&month=">${ms.map((m) => `<option value="${m}" ${m === month ? "selected" : ""}>${monthName(m)}</option>`).join("")}</select>
         <button class="btn small ghost" data-csv-report="${month}-01|${addDays(addDays(month + "-01", 32).slice(0, 8) + "01", -1)}|abfm-grooming-${month}">Download CSV</button><button class="btn small ghost" data-print>Print / PDF</button>`)}
      ${tabs}${reportBody(rows, `${month}-01`, addDays(addDays(month + "-01", 32).slice(0, 8) + "01", -1), D.user.siteIds)}`;
  }

  function periodPage(tabs) {
    const presets = {
      week: [G.mondayOf(D.today), D.today, "This week"], lastweek: [addDays(G.mondayOf(D.today), -7), addDays(G.mondayOf(D.today), -1), "Last week"],
      d30: [addDays(D.today, -29), D.today, "Last 30 days"], d90: [addDays(D.today, -89), D.today, "Last 90 days"],
    };
    let from = /^\d{4}-\d{2}-\d{2}$/.test(R.q.from || "") ? R.q.from : presets.d30[0];
    let to = /^\d{4}-\d{2}-\d{2}$/.test(R.q.to || "") ? R.q.to : D.today;
    if (to > D.today) to = D.today;
    if (from > to) from = to;
    const site = D.mySites.some((x) => x.id === R.q.site) ? R.q.site : "";
    const ids = site ? [site] : D.user.siteIds;
    const rows = G.periodReport(D, from, to, ids);
    return `
      <div class="report-head">${head(`Period report${site ? ` · ${esc(siteName(site))}` : " · all my sites"}`, `${fmtDate(from, true)} to ${fmtDate(to, true)}`, `Generated ${fmtDay(D.today)} ${G.nowHM()} by ${esc(D.user.name)}`,
        `<button class="btn small ghost" data-csv-report="${from}|${to}|abfm-grooming-${from}-to-${to}" data-sites="${ids.join(",")}">Download CSV</button><button class="btn small ghost" data-print>Print / PDF</button>`)}</div>
      ${tabs}
      <form id="period-form" class="filters no-print mb">
        ${Object.entries(presets).map(([k, [f, t, l]]) => `<a class="chip ${from === f && to === t ? "on" : ""}" href="#/reports?tab=period&from=${f}&to=${t}${site ? `&site=${site}` : ""}">${l}</a>`).join("")}
        <input type="date" name="from" value="${from}" max="${D.today}"> to <input type="date" name="to" value="${to}" max="${D.today}">
        <select name="site">${opts(D.mySites, site, "All my sites")}</select>
        <button class="btn small navy" type="submit">Show</button>
      </form>
      ${reportBody(rows, from, to, ids)}`;
  }

  function reportBody(rows, from, to, ids) {
    const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const inRange = (d) => d >= from && d <= to;
    const checks = sum("siteChecks");
    const passWeighted = rows.reduce((a, r) => a + (r.passRate == null ? 0 : (r.passRate * r.siteChecks) / 100), 0);
    const acts = G.openActions(D).filter((x) => ids.includes(D.auditById[x.audit_id].site_id));
    const inc = D.incidents.filter((x) => ids.includes(x.site_id) && inRange(x.date)).sort((a, b) => b.date.localeCompare(a.date));
    const hr = G.hrPending(D).filter((h) => ids.includes(h.emp.site_id));
    const m = G.missedStandards(D, ids, from, to);
    return `
      <div class="kpis six">
        <div class="card kpi"><div class="l">Site-check pass rate</div><div class="v">${checks ? pct((100 * passWeighted) / checks, 1) : "–"}</div><div class="s muted">${checks} checks</div></div>
        <div class="card kpi"><div class="l">Daily checklists sent</div><div class="v">${sum("sent")}<small> / ${sum("days")}</small></div><div class="s ${sum("sent") - sum("onTime") ? "amber" : "muted"}">${sum("sent") - sum("onTime")} late (after ${esc(T.checklistDue)})</div></div>
        <div class="card kpi"><div class="l">Daily-check findings</div><div class="v">${sum("findings")}</div><div class="s muted">${sum("repeat")} repeat</div></div>
        <div class="card kpi"><div class="l">Audit actions</div><div class="v">${sum("actionsRaised")}</div><div class="s muted">${sum("actionsOnTime")} closed on time · ${sum("actionsOpen")} open</div></div>
        <div class="card kpi"><div class="l">Incidents</div><div class="v">${sum("incidents")}</div><div class="s ${sum("serious") ? "red" : "muted"}">${sum("serious")} serious conduct</div></div>
        <div class="card kpi"><div class="l">Supply gaps opened</div><div class="v">${sum("supplyOpened")}</div><div class="s muted">${sum("supplyWaiting")} still waiting</div></div>
      </div>
      <div class="card pad mb"><h3 class="mb">By site</h3><div class="table-wrap"><table class="t">
        <thead><tr><th>Site</th><th>Staff</th><th>Checklists sent (late)</th><th>Pass rate</th><th>Findings (repeat)</th><th>Field checks</th><th>Audits</th><th>Actions on time / raised</th><th>Open</th><th>Incidents</th><th>Supply opened / waiting</th><th>Avg days to issue</th><th>Trained</th><th>Baseline</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td><a href="#/sites/${r.id}"><b>${esc(r.site)}</b></a></td><td>${r.staff}</td><td class="${r.sent < r.days ? "red" : ""}">${r.sent} / ${r.days}${r.sent - r.onTime ? ` <span class="amber">(${r.sent - r.onTime})</span>` : ""}</td><td>${pct(r.passRate, 1)}</td>
          <td>${r.findings}${r.repeat ? `<span class="red"> (${r.repeat})</span>` : ""}</td><td class="${r.field < r.fieldTarget ? "red" : ""}">${r.field} / ${r.fieldTarget}</td>
          <td class="small">${r.audits ? `<span class="${r.latestAudit != null && r.latestAudit < T.auditPass ? "red" : ""}">${esc(r.audits)}</span>` : `<span class="red">None</span>`}</td>
          <td>${r.actionsOnTime} / ${r.actionsRaised}</td><td class="${r.actionsOpen ? "red" : ""}">${r.actionsOpen}</td><td>${r.incidents}${r.serious ? `<span class="red"> (${r.serious} serious)</span>` : ""}</td><td>${r.supplyOpened} / ${r.supplyWaiting}</td>
          <td>${r.supplyAvg == null ? "–" : r.supplyAvg.toFixed(1)}</td><td>${pct(r.trained)}</td><td>${pct(r.baseline)}</td></tr>`).join("")}
      </tbody></table></div></div>
      <div class="grid-half">
        <div class="card pad panel"><h3>Most-missed standards</h3>${G.barList(m.rows.slice(0, 8).map((r) => ({ label: r.label, value: r.n, display: String(r.n), tip: `${r.label}: ${r.n} of ${m.checks} checks` })))}</div>
        <div class="card pad panel"><h3>HR steps not recorded <span class="muted small">${hr.length}</span></h3>${hr.length ? `<table class="t"><tbody>${hr.slice(0, 12).map((h) => `<tr><td><a class="blue" href="#/employees/${h.emp.id}">${esc(h.emp.name)}</a><br><span class="muted small">${esc(siteName(h.emp.site_id))}</span></td><td class="small">${h.needs.map((n) => esc(S.levelLabel(n.level))).join(", ")}</td></tr>`).join("")}</tbody></table>` : empty("All recorded.")}</div>
      </div>
      <div class="grid-half mt">
        <div class="card pad panel"><h3>Open audit actions <span class="muted small">${acts.length}</span></h3>${acts.length ? `<table class="t"><tbody>${acts.slice(0, 12).map((x) => `<tr><td class="nw ${x.due_on < D.today ? "red" : ""}">${fmtDate(x.due_on)}</td><td>${esc(siteName(D.auditById[x.audit_id].site_id))}</td><td>${esc(x.finding)}</td><td class="small">${esc(x.owner)}</td></tr>`).join("")}</tbody></table>` : empty("None open.")}</div>
        <div class="card pad panel"><h3>Incidents in this period <span class="muted small">${inc.length}</span></h3>${inc.length ? `<table class="t"><tbody>${inc.slice(0, 12).map((x) => `<tr><td class="nw">${fmtDate(x.date)}</td><td>${esc(siteName(x.site_id))}</td><td>${esc(S.incidentLabel(x.type))}</td><td>${incidentPill(x)}</td></tr>`).join("")}</tbody></table>` : empty("None.")}</div>
      </div>
      <p class="muted small mt">Targets: 100% trained by ${fmtDate(T.trainingDeadline, true)} · audit score ${T.auditPass}+ · findings closed within ${T.findingCloseDays} days · ${T.fieldChecksPerWeek} field checks per site per week · supply within ${T.supplyWorkingDays} working days · checklist sent by ${esc(T.checklistDue)}.</p>`;
  }
  function reportCsv(from, to, name, ids) {
    const rows = G.periodReport(D, from, to, ids);
    G.downloadCsv(`${name}.csv`,
      ["Site", "Staff", "Days", "Checklists sent", "Sent on time", "Site checks", "Pass rate %", "Findings", "Repeat findings", "Field checks", "Field target", "Audits", "Latest audit score", "Actions raised", "Actions closed on time", "Actions open", "Incidents", "Serious conduct", "Supply gaps opened", "Supply gaps waiting", "Avg working days to issue", "Trained %", "Baseline %"],
      rows.map((r) => [r.site, r.staff, r.days, r.sent, r.onTime, r.siteChecks, r.passRate, r.findings, r.repeat, r.field, r.fieldTarget, r.audits, r.latestAudit, r.actionsRaised, r.actionsOnTime, r.actionsOpen, r.incidents, r.serious, r.supplyOpened, r.supplyWaiting, r.supplyAvg, r.trained, r.baseline]));
  }

  const EXPORTS = [
    ["checks", "Checks", "One row per check: date, type, employee, status, gaps, action, note, checked by"],
    ["gaps", "Gaps (findings detail)", "One row per failed standard, including supply gaps"],
    ["submissions", "Daily checklists sent", "Site, date, time, on time or late, totals"],
    ["audits", "Audits", "Scores by area, total, pass/fail, follow-up dates"],
    ["actions", "Audit actions", "Finding, staff, action, owner, due, closed"],
    ["incidents", "Incidents", "Type, site, staff, details, status, outcome"],
    ["hr", "HR register", "Warnings, refreshers, HR actions, deductions"],
    ["supply", "Supply gaps", "Item, employee, requested, issued, working days"],
    ["employees", "Employees", "Sizes, training, baseline, findings in window, next step"],
  ];
  function exportsPage(tabs) {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(R.q.from || "") ? R.q.from : addDays(D.today, -29);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(R.q.to || "") ? R.q.to : D.today;
    return `
      ${head("Download for Excel", "Data exports", `Dated data is limited to the period you choose. Files open in Excel (CSV, UTF-8).`)}
      ${tabs}
      <form id="export-form" class="filters mb"><label class="small muted">From <input type="date" name="from" value="${from}" max="${D.today}"></label>
        <label class="small muted">To <input type="date" name="to" value="${to}" max="${D.today}"></label>
        <select name="site">${opts(D.mySites, R.q.site || "", "All my sites")}</select></form>
      <div class="card pad"><table class="t"><tbody>
        ${EXPORTS.map(([k, l, d]) => `<tr><td><b>${l}</b><br><span class="muted small">${d}</span></td><td style="text-align:right"><button class="btn small ghost" data-export="${k}">${G.icon("download")}Download</button></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  async function runExport(kind) {
    const f = document.getElementById("export-form");
    const d = G.formData(f);
    const from = d.from || addDays(D.today, -29), to = d.to || D.today;
    await ensureFrom(from);
    const ids = d.site ? [d.site] : D.user.siteIds;
    const inR = (x) => x >= from && x <= to;
    const mine = (sid) => ids.includes(sid);
    const emp = (id) => D.empById[id] || {};
    const name = `abfm-${kind}-${from}-to-${to}.csv`;
    const T2 = S.TARGETS;
    if (kind === "checks") G.downloadCsv(name, ["Date", "Time", "Site", "Type", "Staff no", "Employee", "Trade", "Status", "Finding no", "Gaps", "Supply gaps", "Actions", "Note", "Checked by"],
      D.checks.filter((c) => mine(c.site_id) && inR(c.date)).sort((a, b) => a.date.localeCompare(b.date)).map((c) => [c.date, c.time, siteName(c.site_id), c.type, emp(c.employee_id).staff_no, emp(c.employee_id).name, emp(c.employee_id).trade, c.status, c.finding_no,
        c.gaps.filter((g) => !g.supply).map((g) => S.itemLabel(g.code)).join("; "), c.gaps.filter((g) => g.supply).map((g) => S.itemLabel(g.code)).join("; "),
        [...new Set(c.gaps.map((g) => S.actionLabel(g.action)).filter(Boolean))].join("; "), c.note, c.by]));
    if (kind === "gaps") { const rows = []; D.checks.filter((c) => mine(c.site_id) && inR(c.date)).forEach((c) => c.gaps.forEach((g) => rows.push([c.date, siteName(c.site_id), c.type, emp(c.employee_id).staff_no, emp(c.employee_id).name, S.itemLabel(g.code), (S.ITEMS.find((i) => i.code === g.code) || {}).area || "", g.supply ? "Supply gap" : "Finding", S.actionLabel(g.action), c.by])));
      G.downloadCsv(name, ["Date", "Site", "Check", "Staff no", "Employee", "Standard", "Area", "Kind", "Action taken", "Checked by"], rows); }
    if (kind === "submissions") G.downloadCsv(name, ["Date", "Site", "Sent at", "On time", "Sent by", "Staff", "Passed", "Gaps", "Supply gap", "Absent/leave"],
      D.submissions.filter((x) => mine(x.site_id) && inR(x.date)).sort((a, b) => a.date.localeCompare(b.date)).map((x) => [x.date, siteName(x.site_id), x.time, x.time <= T2.checklistDue ? "Yes" : "Late", x.by, x.total, x.passed, x.gaps, x.supply, x.absent]));
    if (kind === "audits") G.downloadCsv(name, ["Date", "Site", "Auditor", "With HSE", "Sample", "Grooming /30", "PPE /25", "Communication /25", "Daily control /20", "Total", "Result", "Report sent", "Plan received", "Verified", "Notes"],
      D.audits.filter((a) => mine(a.site_id) && inR(a.date)).map((a) => [a.date, siteName(a.site_id), a.auditor, a.with_hse, a.sample, a.s_grooming, a.s_ppe, a.s_comm, a.s_control, a.total, a.total >= T2.auditPass ? "Pass" : "Fail", a.report_on, a.plan_on, a.verified_on, a.notes]));
    if (kind === "actions") G.downloadCsv(name, ["Audit date", "Site", "Finding", "Employee", "Action", "Owner", "Due", "Closed", "Status"],
      D.actions.filter((x) => { const a = D.auditById[x.audit_id]; return a && mine(a.site_id) && inR(a.date); }).map((x) => { const a = D.auditById[x.audit_id]; return [a.date, siteName(a.site_id), x.finding, emp(x.employee_id).name || "", x.action, x.owner, x.due_on, x.closed_on, x.closed_on ? (x.closed_on <= x.due_on ? "Closed on time" : "Closed late") : x.due_on < D.today ? "Overdue" : "Open"]; }));
    if (kind === "incidents") G.downloadCsv(name, ["Date", "Time", "Site", "Type", "Employee", "Where", "What happened", "What was done", "Reported by", "Status", "Acknowledged by", "Acknowledged", "Closed", "Outcome"],
      D.incidents.filter((x) => mine(x.site_id) && inR(x.date)).map((x) => [x.date, x.time, siteName(x.site_id), S.incidentLabel(x.type), emp(x.employee_id).name || "", x.location, x.details, x.action, x.reported_by, x.status, x.ack_by, x.ack_on, x.closed_on, x.outcome]));
    if (kind === "hr") G.downloadCsv(name, ["Date", "Site", "Staff no", "Employee", "Entry", "Action", "Amount (AED)", "Notes", "Recorded by"],
      D.discipline.filter((x) => mine(x.site_id) && inR(x.date)).map((x) => [x.date, siteName(x.site_id), emp(x.employee_id).staff_no, emp(x.employee_id).name, S.levelLabel(x.level), x.action, x.amount, x.notes, x.by]));
    if (kind === "supply") G.downloadCsv(name, ["Requested", "Site", "Staff no", "Employee", "Item", "Uniform size", "Shoe size", "Issued", "Working days"],
      D.supply.filter((g) => mine(g.site_id) && inR(g.requested_on)).map((g) => [g.requested_on, siteName(g.site_id), emp(g.employee_id).staff_no, emp(g.employee_id).name, g.item, emp(g.employee_id).uniform_size, emp(g.employee_id).shoe_size, g.issued_on, G.supplyAge(g, D.today)]));
    if (kind === "employees") G.downloadCsv(`abfm-employees-${D.today}.csv`, ["Staff no", "Name", "Trade", "Site", "Active", "Uniform size", "Shoe size", "Trained", "Baseline", "PPE held", "Missing items", "Findings (window)", "Next step"],
      D.employees.filter((e) => mine(e.site_id)).map((e) => { const n = G.findingsFor(D, e.id, D.today).length; return [e.staff_no, e.name, e.trade, siteName(e.site_id), e.active ? "Yes" : "No", e.uniform_size, e.shoe_size, e.trained_on, e.baseline_on, (e.ppe_held || []).map(S.baselineLabel).join("; "), e.missing, n, n ? S.warningFor(n + 1).action : ""]; }));
    G.toast("Download started.");
  }

  // ---------------- site scorecard ----------------
  function sitePage() {
    const id = R.parts[1];
    const s = D.siteById[id];
    if (!s || !D.user.siteIds.includes(id)) return blocked("Site not found", "This site doesn't exist or is switched off.");
    const staff = staffOf(id);
    const from30 = addDays(D.today, -29);
    const p30 = G.punctuality(D, id, from30, D.today);
    const r = G.periodReport(D, addDays(D.today, -13), D.today, [id])[0];
    const sa = G.siteAudits(D, id);
    const acts = G.openActions(D).filter((x) => D.auditById[x.audit_id].site_id === id);
    const inc = D.incidents.filter((x) => x.site_id === id && x.status !== "closed");
    const warn = staff.map((e) => ({ e, n: G.findingsFor(D, e.id, D.today).length })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n);
    const supply = D.supply.filter((g) => g.site_id === id && !g.issued_on);
    const fm = D.managers.filter((m) => m.sites.includes(id)).map((m) => m.name).join(", ");
    const days = Array.from({ length: 30 }, (_, i) => addDays(D.today, i - 29));
    const cal = days.map((d) => { const sub = D.submissions.find((x) => x.site_id === id && x.date === d); return { d, cls: sub ? (sub.time <= T.checklistDue ? "c-g" : "c-a") : d === D.today ? "" : "c-r", l: sub ? `sent ${sub.time}${sub.time > T.checklistDue ? " (late)" : ""} by ${sub.by}` : d === D.today ? "not sent yet" : "not sent" }; });
    const checkers = G.checkerActivity(D, [id], from30, D.today);
    return `
      ${head(`<a href="#/">Overview</a> › Site scorecard`, esc(s.name), `${staff.length} staff · FM Manager ${esc(fm || "–")} · trained ${pct(r.trained)} · baseline ${pct(r.baseline)}`,
        `<a class="btn small ghost" href="#/checklists/${id}/${D.today}">Today's checks</a><a class="btn small ghost" href="#/reports?tab=period&site=${id}">Site report</a>${D.user.can.audit ? `<a class="btn small" href="#/audits/new?site=${id}">+ Audit</a>` : ""}`)}
      <div class="mini-kpis mb">
        <div class="card"><b>${pct(r.passRate, 1)}</b><span>Pass rate, 14 days</span></div>
        <div class="card"><b>${p30.onTime}/${p30.days}</b><span>Checklists on time, 30 days</span></div>
        <div class="card"><b>${p30.late}</b><span>Sent late · ${p30.missed} missed</span></div>
        <div class="card"><b>${G.fieldLast7(D, id, D.today)}/${T.fieldChecksPerWeek}</b><span>Field checks, last 7 days</span></div>
        <div class="card"><b>${sa[0] ? sa[0].total : "–"}</b><span>Last audit${sa[0] ? ` · ${fmtDate(sa[0].date)}` : ""}</span></div>
        <div class="card"><b>${acts.length}</b><span>Open audit actions</span></div>
        <div class="card"><b>${inc.length}</b><span>Open incidents</span></div>
        <div class="card"><b>${supply.length}</b><span>Supply gaps waiting</span></div>
      </div>
      ${trendAndMissed([id], 12, from30, D.today, "Most-missed standards here, last 30 days")}
      <div class="grid-half mt">
        <div class="card pad panel"><h3><span>Daily checklist, last 30 days</span><span class="legend"><span><i class="c-g"></i>On time</span><span><i class="c-a"></i>Late</span><span><i class="c-r"></i>Not sent</span></span></h3>
          <div class="cal">${cal.map((c) => `<i class="${c.cls}" ${c.cls ? "" : 'style="background:#f2f2ef"'} data-tip="${fmtDate(c.d)}: ${esc(c.l)}" tabindex="0"></i>`).join("")}</div>
          <p class="small muted mt-s">Average send time ${p30.avg || "–"} · due by ${esc(T.checklistDue)}</p>
          <h3 class="mt">Who is checking <span class="muted small">last 30 days</span></h3>
          ${checkers.length ? `<table class="t"><thead><tr><th>Checker</th><th>Site</th><th>Camp</th><th>Field</th><th>Gap rate</th></tr></thead><tbody>${checkers.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.site}</td><td>${c.camp}</td><td>${c.field}</td><td>${c.gapRate == null ? "–" : c.gapRate.toFixed(1) + "%"}</td></tr>`).join("")}</tbody></table>` : empty("No checks.")}
        </div>
        <div class="card pad panel"><h3>Audit history</h3>
          ${sa.length ? `<table class="t"><tbody>${sa.slice(0, 8).map((a) => `<tr><td class="nw"><a class="blue" href="#/audits/${a.id}">${fmtDate(a.date, true)}</a></td><td>${esc(a.auditor)}</td><td>${auditScore(a.total)}</td></tr>`).join("")}</tbody></table>` : empty("No audits yet.")}
          <h3 class="mt">Staff on a warning <span class="muted small">2+ findings in ${T.warningWindowDays} days</span></h3>
          ${warn.length ? `<table class="t"><tbody>${warn.map(({ e, n }) => `<tr><td><a class="blue" href="#/employees/${e.id}">${esc(e.name)}</a></td><td><span class="pill ${n >= 3 ? "red" : "amber"}">${n}</span></td><td class="small">Next finding: ${n + 1 >= 3 ? "HR action" : "written warning"}</td></tr>`).join("")}</tbody></table>` : empty("None.")}
          ${inc.length ? `<h3 class="mt">Open incidents</h3><table class="t"><tbody>${inc.map((x) => `<tr><td class="nw">${fmtDate(x.date)}</td><td>${esc(S.incidentLabel(x.type))}</td><td>${incidentPill(x)}</td></tr>`).join("")}</tbody></table>` : ""}
        </div>
      </div>`;
  }

  // ---------------- analytics ----------------
  function analyticsPage() {
    const weeks = [4, 8, 12, 26].includes(Number(R.q.weeks)) ? Number(R.q.weeks) : 12;
    const site = D.mySites.some((x) => x.id === R.q.site) ? R.q.site : "";
    const ids = site ? [site] : D.user.siteIds;
    const from = addDays(G.mondayOf(D.today), -7 * (weeks - 1));
    const to = D.today;
    const link = (o) => "#/analytics?" + new URLSearchParams({ weeks, ...(site ? { site } : {}), ...o });
    const m = G.missedStandards(D, ids, from, to);
    const trades = G.byTrade(D, ids, from, to).filter((t) => t.checks >= 10);
    const checkers = G.checkerActivity(D, ids, from, to);
    let weeksBySite = D.mySites.filter((s) => ids.includes(s.id)).map((s) => ({ s, w: G.weekly(D, [s.id], weeks) }));
    const firstWeek = weeksBySite.length ? Math.min(...weeksBySite.map((x) => { const i = x.w.findIndex((y) => y.tot > 0); return i < 0 ? x.w.length : i; })) : 0;
    if (firstWeek > 0 && firstWeek < weeks) weeksBySite = weeksBySite.map((x) => ({ s: x.s, w: x.w.slice(firstWeek) }));   // skip weeks before any checks
    const heatCls = (p) => (p == null ? "c-x" : p >= 100 ? "c-g" : p >= 95 ? "c-g2" : p >= 85 ? "c-a" : "c-r");
    const audits = D.audits.filter((a) => ids.includes(a.site_id) && a.date >= from);
    return `
      ${head("Trends and patterns", "Analytics", `${fmtDate(from, true)} to ${fmtDate(to, true)}${site ? ` · ${esc(siteName(site))}` : " · all my sites"}`,
        `${[4, 8, 12, 26].map((w) => `<a class="chip ${w === weeks ? "on" : ""}" href="${link({ weeks: w })}">${w} weeks</a>`).join("")}
         <select data-goto="#/analytics?weeks=${weeks}&site=">${opts(D.mySites, site, "All my sites")}</select>`)}
      ${trendAndMissed(ids, weeks, from, to, "Most-missed standards")}
      ${!site && weeksBySite.length > 1 ? `<div class="card pad panel mt"><h3><span>Pass rate by site and week</span><span class="legend"><span><i class="c-g"></i>100%</span><span><i class="c-g2"></i>95–99%</span><span><i class="c-a"></i>85–94%</span><span><i class="c-r"></i>&lt;85%</span><span><i class="c-x"></i>No checks</span></span></h3>
        <div class="table-wrap"><table class="heat"><thead><tr><th></th>${weeksBySite[0].w.map((x) => `<th>${fmtDate(x.week)}</th>`).join("")}</tr></thead><tbody>
        ${weeksBySite.map(({ s, w }) => `<tr><td class="name"><a href="#/sites/${s.id}">${esc(s.name)}</a></td>${w.map((x) => `<td class="${heatCls(x.pct)}" data-tip="${esc(s.name)}, week of ${fmtDate(x.week)}: ${x.pct == null ? "no checks" : `${x.pct.toFixed(1)}% (${x.tot} checks)`}" tabindex="0">${x.pct == null ? "–" : Math.round(x.pct)}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div></div>` : ""}
      <div class="grid-half mt">
        <div class="card pad panel"><h3><span>Findings by trade</span><span class="muted small">per 100 checks · trades with 10+ checks</span></h3>
          ${G.barList(trades.map((t) => ({ label: t.trade, value: t.rate, display: t.rate.toFixed(1), tip: `${t.trade}: ${t.findings} findings in ${t.checks} checks` })))}
          ${trades.length ? G.tableView(["Trade", "Checks", "Findings", "Per 100 checks"], trades.map((t) => [t.trade, t.checks, t.findings, t.rate.toFixed(1)])) : ""}</div>
        <div class="card pad panel"><h3><span>Daily checklist punctuality</span><span class="muted small">due by ${esc(T.checklistDue)}</span></h3>
          <table class="t"><thead><tr><th>Site</th><th>On time</th><th>Late</th><th>Missed</th><th>Avg time</th></tr></thead><tbody>
          ${D.mySites.filter((s) => ids.includes(s.id)).map((s) => { const p = G.punctuality(D, s.id, from, to); return `<tr><td><a href="#/sites/${s.id}">${esc(s.name)}</a></td><td>${p.onTime} / ${p.days}</td><td class="${p.late ? "amber" : ""}">${p.late}</td><td class="${p.missed ? "red" : ""}">${p.missed}</td><td>${p.avg || "–"}</td></tr>`; }).join("")}
          </tbody></table></div>
      </div>
      <div class="grid-half mt">
        <div class="card pad panel"><h3><span>Checker activity</span><span class="muted small">a very low gap rate can mean checks are not done properly</span></h3>
          <div class="table-wrap"><table class="t"><thead><tr><th>Checker</th><th>Days</th><th>Site</th><th>Camp</th><th>Field</th><th>Gaps found</th><th>Gap rate</th></tr></thead><tbody>
          ${checkers.map((c) => `<tr><td>${esc(c.name)}<br><span class="muted small">${c.sites.map(siteName).map(esc).join(", ")}</span></td><td>${c.days}</td><td>${c.site}</td><td>${c.camp}</td><td>${c.field}</td><td>${c.gaps}</td><td>${c.gapRate == null ? "–" : `<span class="${c.checked >= 50 && c.gapRate < 0.5 ? "amber" : ""}">${c.gapRate.toFixed(1)}%</span>`}</td></tr>`).join("") || `<tr><td colspan="7">${empty("No checks.")}</td></tr>`}
          </tbody></table></div></div>
        <div class="card pad panel"><h3><span>Audits in this period</span><span class="muted small">pass mark ${T.auditPass}</span></h3>
          ${audits.length ? `<table class="t"><thead><tr><th>Date</th><th>Site</th><th>Grooming</th><th>PPE</th><th>Comms</th><th>Control</th><th>Total</th></tr></thead><tbody>${audits.map((a) => `<tr><td class="nw"><a class="blue" href="#/audits/${a.id}">${fmtDate(a.date)}</a></td><td>${esc(siteName(a.site_id))}</td><td>${a.s_grooming}</td><td>${a.s_ppe}</td><td>${a.s_comm}</td><td>${a.s_control}</td><td>${auditScore(a.total)}</td></tr>`).join("")}</tbody></table>` : empty("No audits in this period.")}</div>
      </div>`;
  }

  // ---------------- incidents ----------------
  const incidentPill = (x) => (x.status === "closed" ? `<span class="pill green">Closed</span>` : x.status === "acknowledged" ? `<span class="pill blue">Acknowledged</span>` : x.type === "serious_conduct" ? `<span class="pill red">Open</span>` : `<span class="pill amber">Open</span>`);
  function incidentsPage() {
    const st = ["open", "all", "closed"].includes(R.q.status) ? R.q.status : "open";
    const list = D.incidents.filter((x) => (st === "all" ? true : st === "open" ? x.status !== "closed" : x.status === "closed")).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const can = D.user.can.incidents;
    return `
      ${head("Reported from the field", "Incidents", "Difficult customers, complaints and serious conduct. The supervisor reports the same day; the FM Manager acknowledges and closes.",
        `<span class="chips">${["open", "closed", "all"].map((k) => `<a href="#/incidents?status=${k}" class="chip ${k === st ? "on" : ""}">${k[0].toUpperCase() + k.slice(1)}</a>`).join("")}</span>`)}
      <div class="card pad">${list.length === 0 ? empty(st === "open" ? "No open incidents." : "Nothing here.") : `<div class="table-wrap"><table class="t">
        <thead><tr><th>Reported</th><th>Site</th><th>Type</th><th>Staff</th><th>What happened</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.map((x) => `<tr>
          <td class="nw">${fmtDate(x.date)} ${esc(x.time)}<br><span class="muted small">${esc(x.reported_by)}</span></td><td>${esc(siteName(x.site_id))}<br><span class="muted small">${esc(x.location)}</span></td>
          <td>${esc(S.incidentLabel(x.type))}</td><td>${x.employee_id ? `<a class="blue" href="#/employees/${x.employee_id}">${esc(empName(x.employee_id))}</a>` : `<span class="muted">–</span>`}</td>
          <td class="small" style="max-width:340px">${esc(x.details)}${x.action ? `<br><span class="muted">Done: ${esc(x.action)}</span>` : ""}${x.outcome ? `<br><span class="green">Outcome: ${esc(x.outcome)}</span>` : ""}</td>
          <td class="nw">${incidentPill(x)}${x.ack_by ? `<br><span class="muted small">${esc(x.ack_by)} · ${fmtDate(x.ack_on)}</span>` : ""}</td>
          <td class="nw">${can ? (x.status === "closed" ? `<button class="linkbtn" data-inc="${x.id}" data-op="reopen">Reopen</button>` : `${x.status === "open" ? `<button class="btn small ghost" data-inc="${x.id}" data-op="ack">Acknowledge</button> ` : ""}<button class="btn small ghost" data-inc="${x.id}" data-op="close">Close…</button>`) : ""}</td></tr>`).join("")}
      </tbody></table></div>`}</div>
      <details class="card pad panel mt"><summary class="linkbtn" style="cursor:pointer">+ Record an incident</summary>
        <form id="incident-form" class="grid-form mt">
          <label class="field">Site<select name="site_id" required>${opts(D.mySites, "", "Choose…")}</select></label>
          <label class="field">Type<select name="type">${S.INCIDENT_TYPES.map((t) => `<option value="${t.code}">${esc(t.label)}</option>`).join("")}</select></label>
          <label class="field">Staff member (optional)<select name="employee_id"><option value="">–</option>${D.employees.filter((e) => e.active && D.user.siteIds.includes(e.site_id)).sort((a, b) => a.name.localeCompare(b.name)).map((e) => `<option value="${e.id}">${esc(e.name)} · ${esc(siteName(e.site_id))}</option>`).join("")}</select></label>
          <label class="field">Where<input type="text" name="location"></label>
          <label class="field" style="grid-column:1/-1">What happened<textarea name="details" required></textarea></label>
          <label class="field" style="grid-column:1/-1">What was done<textarea name="action"></textarea></label>
          <div><button class="btn small" type="submit">Save incident</button></div>
        </form></details>`;
  }

  // ---------------- HR register ----------------
  function hrPage() {
    const pending = G.hrPending(D);
    const reg = [...D.discipline].sort((a, b) => b.date.localeCompare(a.date));
    const can = D.user.can.discipline;
    const deduct = (lvl) => (lvl === "hr_action" ? T.deductFurther : "");
    return `
      ${head("Warnings and disciplinary steps", "HR register", `Policy ladder: 1st finding verbal warning · repeat: written warning and refresher (FM Manager with HR) · further repeat: HR action, salary deduction${T.deductRepeat || T.deductFurther ? ` (AED ${esc(T.deductRepeat || "–")} / ${esc(T.deductFurther || "–")})` : ""} · serious conduct: removal and HR investigation.`)}
      <div class="card pad panel mb"><h3>Steps due, not recorded yet <span class="muted small">${pending.length}</span></h3>
        ${pending.length === 0 ? empty("Everything due has been recorded.") : `<div class="table-wrap"><table class="t"><thead><tr><th>Employee</th><th>Site</th><th>Findings (${T.warningWindowDays} days)</th><th>Due</th><th></th></tr></thead><tbody>
          ${pending.map((p) => `<tr><td><a class="blue" href="#/employees/${p.emp.id}">${esc(p.emp.name)}</a><br><span class="muted small">${esc(p.emp.staff_no)} · ${esc(p.emp.trade)}</span></td><td>${esc(siteName(p.emp.site_id))}</td>
            <td><span class="pill ${p.findings >= 3 ? "red" : p.findings === 2 ? "amber" : "grey"}">${p.findings}</span></td>
            <td class="small">${p.needs.map((n) => `<b>${esc(S.levelLabel(n.level))}</b> <span class="muted">(${esc(n.why)}, ${fmtDate(n.since)})</span>`).join("<br>")}</td>
            <td class="nw">${can ? p.needs.map((n) => `<button class="btn small ghost" data-record="${p.emp.id}" data-level="${n.level}" data-amount="${esc(deduct(n.level))}">Record ${esc(S.levelLabel(n.level).replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase()))}</button>`).join(" ") : ""}</td></tr>`).join("")}
        </tbody></table></div>`}
      </div>
      <div id="hr-form-slot"></div>
      <div class="card pad panel"><h3>Register <span class="muted small">${reg.length} entries</span></h3>
        ${reg.length === 0 ? empty("Nothing recorded yet.") : `<div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Employee</th><th>Site</th><th>Entry</th><th>Action / notes</th><th>Amount</th><th>By</th><th></th></tr></thead><tbody>
          ${reg.map((x) => `<tr><td class="nw">${fmtDate(x.date, true)}</td><td><a class="blue" href="#/employees/${x.employee_id}">${esc(empName(x.employee_id))}</a></td><td>${esc(siteName(x.site_id))}</td>
            <td>${esc(S.levelLabel(x.level))}</td><td class="small">${esc(x.action)}${x.notes ? `<br><span class="muted">${esc(x.notes)}</span>` : ""}</td><td>${x.amount != null ? `AED ${x.amount}` : ""}</td><td class="small">${esc(x.by)}</td>
            <td>${can ? `<button class="linkbtn" data-delhr="${x.id}">Delete</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>`}
      </div>`;
  }
  function hrForm(empId, level, amount) {
    const e = D.empById[empId];
    const levels = D.user.role === "fm_manager" ? S.DISCIPLINE_LEVELS.filter((l) => ["verbal", "written", "refresher"].includes(l.code)) : S.DISCIPLINE_LEVELS;
    return `<form id="hr-form" class="card pad panel mb" data-emp="${empId}"><h3>Record for ${esc(e ? e.name : "")}</h3><div class="grid-form">
      <label class="field">Entry<select name="level">${levels.map((l) => `<option value="${l.code}" ${l.code === level ? "selected" : ""}>${esc(l.label)}</option>`).join("")}</select></label>
      <label class="field">Date<input type="date" name="date" value="${D.today}" max="${D.today}"></label>
      <label class="field">Action taken<input type="text" name="action" placeholder="e.g. Written warning issued and signed"></label>
      <label class="field">Amount (AED, if a deduction)<input type="number" name="amount" min="0" step="1" value="${esc(amount || "")}"></label>
      <label class="field" style="grid-column:1/-1">Notes<textarea name="notes"></textarea></label>
      <div class="row"><button class="btn small" type="submit">Save</button><button class="btn small ghost" type="button" data-cancelhr>Cancel</button></div></div></form>`;
  }

  // ---------------- activity log ----------------
  let ACT = null;
  async function loadActivity() {
    if (!D.user.can.activity) { ACT = []; return; }
    G.busy(true);
    try { ACT = (await G.api("activity", { limit: 1000 })).activity; } catch (e) { ACT = []; G.toast(e.message, "err"); } finally { G.busy(false); }
  }
  function activityPage() {
    if (!D.user.can.activity) return blocked("Activity log", "Only the Operations Control Officer, Director of Operations or HR can see the activity log.");
    const q = (R.q.q || "").toLowerCase();
    const list = (ACT || []).filter((x) => !q || `${x.user} ${x.action} ${x.details}`.toLowerCase().includes(q));
    const LABEL = { saveCheck: "Saved a check", submitDay: "Sent daily checklist", addSupply: "Added supply request", issueSupply: "Marked supply issued", trained: "Marked training", createAudit: "Recorded audit", auditStep: "Audit follow-up step", addAction: "Added audit finding", toggleAction: "Closed / reopened action", saveSite: "Changed site", saveUser: "Changed user", changePin: "Changed PIN", saveEmployee: "Changed employee", importEmployees: "Imported staff", saveSettings: "Changed rules", addIncident: "Reported incident", updateIncident: "Updated incident", addDiscipline: "HR register entry", deleteDiscipline: "Deleted HR entry", saveBaseline: "Baseline check", testDigest: "Sent test email" };
    return `
      ${head("Who did what, and when", "Activity log", `Latest ${(ACT || []).length} changes. Logins and page views are not logged.`,
        `<form id="act-filter" class="filters"><input type="search" name="q" value="${esc(R.q.q || "")}" placeholder="Search user, action, name"><button class="btn small navy" type="submit">Search</button></form><button class="btn small ghost" data-reload-act>${G.icon("refresh")}Refresh</button>`)}
      <div class="card pad">${list.length === 0 ? empty("Nothing logged yet.") : `<div class="table-wrap"><table class="t"><thead><tr><th>Time</th><th>User</th><th>What</th><th>Details</th></tr></thead><tbody>
        ${list.slice(0, 1000).map((x) => `<tr><td class="nw small">${esc(x.time)}</td><td>${esc(x.user)}<br><span class="muted small">${esc(S.roleLabel(x.role))}</span></td><td>${esc(LABEL[x.action] || x.action)}</td><td class="small">${esc(x.details)}</td></tr>`).join("")}
      </tbody></table></div>`}</div>`;
  }

  // ---------------- settings ----------------
  function settingsPage() {
    if (!D.user.can.manageUsers) return head("Setup", "Settings") + empty("Only the Administrator, the Director of Operations or the OCO can manage sites, users and rules.") + pinForm();
    const edit = D.users.find((x) => x.id === R.q.edit);
    const sites = [...D.sites].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return `
      ${head("Setup", "Sites, users & rules")}
      <div class="tabs"><a href="#/settings" class="${R.q.tab === "rules" ? "" : "on"}">Sites & users</a>${D.user.can.settings ? `<a href="#/settings?tab=rules" class="${R.q.tab === "rules" ? "on" : ""}">Rules & daily email</a>` : ""}</div>
      ${R.q.tab === "rules" && D.user.can.settings ? rulesForm() : `<div class="grid-half">
        <div class="card pad panel"><h3>Users</h3><div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Role</th><th>Sites</th><th></th></tr></thead><tbody>
          ${D.users.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map((x) => { const all = ["director", "oco", "hse", "hr", "stores", "admin", "camp_boss"].includes(x.role); return `<tr ${x.active ? "" : 'style="opacity:.5"'}>
            <td><b>${esc(x.name)}</b><br><span class="muted small">${esc(x.username)}${x.email ? ` · ${esc(x.email)}` : ""}</span></td><td class="small">${esc(S.roleLabel(x.role))}</td>
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
              <label class="field">Email (optional, for the daily summary)<input type="email" name="email" value="${edit ? esc(edit.email || "") : ""}"></label>
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
      </div>`}`;
  }
  function rulesForm() {
    const num = (k, label, hint, max = 365) => `<label class="field">${label}<input type="number" name="${k}" value="${esc(T[k])}" min="0" max="${max}" required>${hint ? `<span class="muted" style="font-weight:400">${hint}</span>` : ""}</label>`;
    const dash = T.dashboardUrl || location.href.split("#")[0];
    return `<form id="rules-form">
      <div class="grid-half">
        <div class="card pad panel"><h3>Policy rules</h3>
          <p class="small muted mb">From the Grooming, Etiquette & Work Efficiency Policy. Changing them here updates the apps, alerts and reports for everyone.</p>
          <div class="grid-form">
            ${num("auditPass", "Audit pass mark (out of 100)", "", 100)}
            ${num("findingCloseDays", "Close audit findings within (days)")}
            ${num("reportDays", "Send audit report within (days)")}
            ${num("planDays", "Action plan within (days)")}
            ${num("reauditDays", "Re-audit a failed site within (days)")}
            ${num("fieldChecksPerWeek", "Field checks per site per week", "", 50)}
            ${num("supplyWorkingDays", "Stores supply target (working days)")}
            ${num("warningWindowDays", "Count repeat findings over (days)")}
            <label class="field">Daily checklist due by<input type="time" name="checklistDue" value="${esc(T.checklistDue)}" required></label>
            <label class="field">Sites send a daily checklist<select name="siteChecklist"><option value="1" ${T.siteChecklist !== "0" ? "selected" : ""}>Yes: supervisors check every staff member on site daily</option><option value="0" ${T.siteChecklist === "0" ? "selected" : ""}>No: checks come from the Camp Boss and HSE only</option></select></label>
            <label class="field">Training deadline<input type="date" name="trainingDeadline" value="${esc(T.trainingDeadline)}"></label>
          </div>
          <h3 class="mt">Salary deductions (HR to confirm under labour law)</h3>
          <div class="grid-form">
            <label class="field">Repeat finding (AED)<input type="number" name="deductRepeat" value="${esc(T.deductRepeat)}" min="0" placeholder="Not set"></label>
            <label class="field">Further repeat (AED)<input type="number" name="deductFurther" value="${esc(T.deductFurther)}" min="0" placeholder="Not set"></label>
          </div>
        </div>
        <div class="card pad panel"><h3>Daily email summary</h3>
          <p class="small muted mb">Each evening, every manager login that has an email address gets a summary for their own sites: checklists not sent or late, overdue audit actions, failing sites, open incidents and slow supply. Quiet days send nothing.</p>
          <label class="confirm" style="margin-top:0"><input type="checkbox" name="digestOn" ${T.digestOn === "1" ? "checked" : ""}> Send the daily summary</label>
          <div class="grid-form">
            <label class="field">Send at (hour, Dubai time)<select name="digestHour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${Number(T.digestHour) === h ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("")}</select></label>
            <label class="field">Dashboard link in the email<input type="text" name="dashboardUrl" value="${esc(dash)}"></label>
          </div>
          <p class="small muted">First time only: in the Apps Script editor run <b>setupDailyEmail</b> once, so Google lets the script send email. Add email addresses to users on the Sites & users tab.</p>
          <button type="button" class="btn small ghost mt-s" data-test-email>Send a test summary to me${D.user.email ? ` (${esc(D.user.email)})` : ""}</button>
        </div>
      </div>
      <div class="row mt" style="justify-content:flex-end"><button class="btn" type="submit">Save rules</button></div>
    </form>`;
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
    else if (d.csvReport) { const [f, t, n] = d.csvReport.split("|"); reportCsv(f, t, n, d.sites ? d.sites.split(",") : D.user.siteIds); }
    else if (d.export) runExport(d.export).catch((e) => G.toast(e.message, "err"));
    else if (d.inc) {
      let outcome = "";
      if (d.op === "close") { outcome = prompt("Outcome (what was done to close it):", ""); if (outcome === null) return; }
      act("updateIncident", { id: d.inc, op: d.op, outcome }, { ack: "Acknowledged.", close: "Closed.", reopen: "Reopened." }[d.op]);
    }
    else if (d.record) { const slot = document.getElementById("hr-form-slot"); slot.innerHTML = hrForm(d.record, d.level, d.amount); slot.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (d.cancelhr !== undefined) document.getElementById("hr-form-slot").innerHTML = "";
    else if (d.delhr) { if (confirm("Delete this HR register entry?")) act("deleteDiscipline", { id: d.delhr }, "Deleted."); }
    else if (d.reloadAct !== undefined) { await loadActivity(); render(); }
    else if (d.testEmail !== undefined) {
      G.busy(true);
      try { await G.api("testDigest"); G.toast("Test summary sent. Check your inbox."); } catch (e) { G.toast(e.message, "err"); } finally { G.busy(false); }
    }
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
    else if (f.id === "period-form") location.hash = "#/reports?" + new URLSearchParams({ tab: "period", ...Object.fromEntries(Object.entries(d).filter(([, v]) => v)) });
    else if (f.id === "act-filter") location.hash = "#/activity?" + new URLSearchParams(d.q ? { q: d.q } : {});
    else if (f.id === "incident-form") act("addIncident", d, "Incident recorded.");
    else if (f.id === "hr-form") act("addDiscipline", { employee_id: f.dataset.emp, ...d }, "Recorded in the HR register.");
    else if (f.id === "rules-form") {
      const st = { ...d, digestOn: d.digestOn ? "1" : "0" };
      act("saveSettings", { settings: st }, (o) => (o.warning === "email" ? "Saved. To send email, run setupDailyEmail once in the Apps Script editor." : "Rules saved."));
    }
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
      act("saveUser", { id: f.dataset.id || undefined, username: d.username, name: d.name, role: d.role, pin: d.pin, email: d.email || "", sites: [].concat(d.sites || []) }, "Saved.", () => { location.hash = "#/settings"; render(); });
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
