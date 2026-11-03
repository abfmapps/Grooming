/* Daily Checklist app (index.html): for supervisors, FM Managers, Camp Boss and Site Managers. */
(function () {
  const S = window.STD, T = S.TARGETS, G = window.G;
  const { esc, initials, fmtDate, fmtDay, plural } = G;
  const root = document.getElementById("root");
  const SITE_KEY = "abfm_grooming_site";
  let F = null;        // data from the backend for the chosen site
  let CF = null;       // check form state

  // ---------------- start ----------------
  async function start() {
    const u = G.session();
    if (!u) return G.loginView(root, { title: "Daily checklist for supervisors and managers. Log in with your username and PIN.", after: afterLogin });
    if (!u.field) { location.href = "admin.html"; return; }
    await load();
    window.addEventListener("hashchange", render);
    render();
  }
  function afterLogin(u) {
    if (!u.field) { location.href = "admin.html"; return; }
    location.hash = "#/";
    start();
  }
  async function load(quiet) {
    if (!quiet) root.innerHTML = `<div class="loading">Loading…</div>`;
    try {
      F = await G.api("field", { site: localStorage.getItem(SITE_KEY) || "" });
      localStorage.setItem("abfm_grooming_user", JSON.stringify(F.user));
    } catch (e) {
      root.innerHTML = `<div class="m"><div class="m-body"><div class="flash err">${esc(e.message)}</div><button class="btn" onclick="location.reload()">Try again</button> <button class="btn ghost" onclick="G.logout()">Log out</button></div></div>`;
      throw e;
    }
  }

  function route() {
    const [path, qs] = (location.hash.replace(/^#\/?/, "") || "").split("?");
    return { parts: path.split("/").filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs || "")) };
  }

  function render() {
    const { parts, q } = route();
    const page = parts[0] || "";
    let html;
    if (!F.site) html = noSite();
    else if (page === "check" && parts[2]) html = checkPage(parts[1], parts[2]);
    else if (page === "check") html = staffList(parts[1], q);
    else if (page === "submit") html = submitPage(q);
    else if (page === "supply") html = supplyPage();
    else if (page === "training") html = trainingPage();
    else html = today();
    root.innerHTML = `<div class="m">${html}</div>${tabs(page)}`;
    window.scrollTo(0, 0);
  }

  function tabs(page) {
    const t = [
      ["#/", "Today", "🏠", page === ""], ["#/check/" + mainType(), "Staff", "✅", page === "check" || page === "submit"],
      ["#/supply", "Supply", "📦", page === "supply"], ["#/training", "Training", "🎓", page === "training"],
      F.user.manage ? ["admin.html", "Dashboard", "📊", false] : ["#/logout", "Log out", "↩︎", false],
    ];
    return `<div class="m-tabs"><nav>${t.map(([h, l, i, on]) => `<a href="${h}" class="${on ? "on" : ""}"><span class="ic">${i}</span>${l}</a>`).join("")}</nav></div>`;
  }

  // ---------------- data helpers ----------------
  const types = () => F.user.can.checkTypes;
  const mainType = () => (types().includes("site") ? "site" : types()[0]);
  const site = () => F.sites.find((s) => s.id === F.site);
  const checksOn = (type, date = F.today) => {
    const m = new Map();
    F.checks.filter((c) => c.type === type && c.date === date).forEach((c) => m.set(c.employee_id, c));
    return m;
  };
  const priorFindings = (empId) => (F.findings[empId] || []).filter((d) => d !== F.today).sort().reverse();

  function pill(c) {
    if (!c) return `<span class="pill grey">To check</span>`;
    const n = c.gaps.filter((g) => !g.supply).length;
    return {
      pass: `<span class="pill green">✓ Pass</span>`, gaps: `<span class="pill red">${plural(n, "gap")}</span>`,
      supply: `<span class="pill blue">Supply gap</span>`, absent: `<span class="pill amber">Absent</span>`, leave: `<span class="pill grey">On leave</span>`,
    }[c.status];
  }

  // ---------------- pages ----------------
  function noSite() {
    return `<div class="m-body"><h1>Hello ${esc(F.user.name.split(" ")[0])}</h1>
      <p class="muted mt">You are not assigned to a site yet. Ask your administrator to add you to a site.</p>
      <a class="btn ghost mt" href="#/logout">Log out</a></div>`;
  }

  function today() {
    const staff = F.staff;
    const mt = mainType();
    const done = checksOn(mt);
    const checked = staff.filter((e) => done.has(e.id)).length;
    const p = staff.length ? Math.round((100 * checked) / staff.length) : 0;
    const field = F.checks.filter((c) => c.type === "field" && c.date >= G.addDays(F.today, -6)).length;
    const camp = checksOn("camp").size;
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const sub = F.submission;
    const left = staff.length - checked;
    return `
      <div class="hero">
        <div class="logo-row"><div class="hi">${greet}</div><a href="#/logout" class="small" style="opacity:.7">Log out</a></div>
        <h1>${esc(F.user.name)}</h1>
        <select id="site-pick" aria-label="Site">${F.sites.map((s) => `<option value="${s.id}" ${s.id === F.site ? "selected" : ""}>📍 ${esc(s.name)} · ${esc(S.roleLabel(F.user.role))}</option>`).join("")}</select>
        <div class="prog">
          <div class="ring" style="background:conic-gradient(var(--orange) 0 ${p}%, rgba(255,255,255,.18) ${p}% 100%)"><div>${checked}/${staff.length}</div></div>
          <div><div style="font-weight:600">${fmtDay(F.today)}</div>
            <div class="small" style="opacity:.8;margin-top:3px">${checked} of ${staff.length} staff checked<br>${mt === "site" ? (sub ? `Checklist sent at ${esc(sub.time)}` : "Checklist due by end of day") : "Camp check before staff leave"}</div></div>
        </div>
      </div>
      <div class="m-body">
        ${types().includes("site") ? `<a href="#/check/site" class="card task"><div class="ico" style="background:var(--orange-soft)">✅</div><div class="grow"><b>Site check</b><span>${left ? `${left} staff left to check` : "Everyone checked"}</span></div>${left ? `<span class="chev">›</span>` : `<span class="pill green">Done</span>`}</a>` : ""}
        <a href="#/check/camp" class="card task" aria-disabled="${!types().includes("camp")}"><div class="ico" style="background:var(--blue-soft)">🏠</div><div class="grow"><b>Camp check</b><span>${camp ? `${camp} of ${staff.length} checked by the Camp Boss` : "Not done yet today"}</span></div>${camp >= staff.length && staff.length ? `<span class="pill green">Done</span>` : types().includes("camp") ? `<span class="chev">›</span>` : ""}</a>
        ${types().includes("field") ? `<a href="#/check/field" class="card task"><div class="ico" style="background:var(--amber-soft)">🔧</div><div class="grow"><b>Random field check</b><span>${field} done in the last 7 days (target ${T.fieldChecksPerWeek})</span></div>${field >= T.fieldChecksPerWeek ? `<span class="pill green">On target</span>` : `<span class="chev">›</span>`}</a>` : ""}
        <a href="#/supply" class="card task"><div class="ico" style="background:var(--red-soft)">📦</div><div class="grow"><b>Supply gaps</b><span>${F.supply.length ? `${plural(F.supply.length, "item")} waiting from Stores` : "Nothing waiting"}</span></div><span class="chev">›</span></a>
        ${types().includes("site") ? (sub ? `<a href="#/submit" class="btn ghost block mt-s">✓ Sent to Head Office at ${esc(sub.time)}. View</a>` : `<a href="#/submit" class="btn block mt-s ${left ? "ghost" : "navy"}">${left ? "Submit to Head Office (finish checks first)" : "Submit to Head Office"}</a>`) : ""}
        <p class="muted small mt" style="text-align:center"><a href="#/refresh">↻ Refresh</a></p>
      </div>`;
  }

  function staffList(typeArg, q) {
    const type = types().includes(typeArg) ? typeArg : mainType();
    const checks = checksOn(type);
    const f = ["all", "todo", "gaps", "pass"].includes(q.f) ? q.f : "all";
    const term = (q.q || "").toLowerCase().trim();
    const st = (e) => (checks.get(e.id) || {}).status;
    const counts = {
      all: F.staff.length, todo: F.staff.filter((e) => !checks.has(e.id)).length,
      gaps: F.staff.filter((e) => ["gaps", "supply"].includes(st(e))).length, pass: F.staff.filter((e) => st(e) === "pass").length,
    };
    const shown = F.staff.filter((e) => {
      if (term && !`${e.name} ${e.staff_no} ${e.trade}`.toLowerCase().includes(term)) return false;
      if (f === "todo") return !checks.has(e.id);
      if (f === "gaps") return ["gaps", "supply"].includes(st(e));
      if (f === "pass") return st(e) === "pass";
      return true;
    }).sort((a, b) => Number(checks.has(a.id)) - Number(checks.has(b.id)) || a.name.localeCompare(b.name));
    const link = (o) => `#/check/${type}?` + new URLSearchParams({ f, ...(term ? { q: term } : {}), ...o });
    return `
      <div class="m-top">
        <a href="#/" class="back">‹ Today</a>
        <h1>${S.CHECK_TYPES[type].label} · ${esc(site().name)}</h1>
        <div class="muted small">${S.CHECK_TYPES[type].who}</div>
        ${types().length > 1 ? `<div class="chips mt-s">${types().map((t) => `<a href="#/check/${t}" class="chip ${t === type ? "on" : ""}">${S.CHECK_TYPES[t].short}</a>`).join("")}</div>` : ""}
        <input class="search" type="search" id="search" value="${esc(q.q || "")}" placeholder="🔍  Search name, staff ID or trade" data-type="${type}" data-f="${f}">
        <div class="chips mt-s">${["all", "todo", "gaps", "pass"].map((k) => `<a href="${link({ f: k })}" class="chip ${f === k ? "on" : ""}">${{ all: "All", todo: "To check", gaps: "Gaps", pass: "Pass" }[k]} ${counts[k]}</a>`).join("")}</div>
      </div>
      <div class="m-body">
        ${q.saved ? `<div class="flash ok">Saved: ${esc(q.saved)}</div>` : ""}
        ${type === "field" ? `<div class="flash info">Pick technicians at random while they are working. Target: 3 per site per week.</div>` : ""}
        ${shown.length === 0 ? `<p class="muted">${F.staff.length ? "No one matches." : "No staff on this site yet. Ask HR or the administrator to add them."}</p>` : `
        <div class="card emp-list">${shown.map((e) => `
          <a href="#/check/${type}/${e.id}" class="emp"><div class="avatar">${initials(e.name)}</div>
            <div class="grow"><b>${esc(e.name)}</b><span>${esc(e.staff_no)} · ${esc(e.trade)}</span></div>${pill(checks.get(e.id))}</a>`).join("")}
        </div>`}
        ${type === "site" && counts.todo === 0 && F.staff.length ? `<a href="#/submit" class="btn navy block mt">Everyone checked: review and submit ›</a>` : ""}
      </div>`;
  }

  // ---------------- check one employee ----------------
  function checkPage(typeArg, empId) {
    const type = types().includes(typeArg) ? typeArg : mainType();
    const e = F.staff.find((x) => x.id === empId);
    if (!e) return `<div class="m-body"><p class="muted">Employee not found.</p><a href="#/check/${type}" class="btn ghost">Back</a></div>`;
    const existing = checksOn(type).get(e.id);
    if (!CF || CF.empId !== e.id || CF.type !== type) {
      CF = { empId: e.id, type, mode: existing && ["absent", "leave"].includes(existing.status) ? existing.status : "checked", note: existing ? existing.note : "", photo: null, items: {} };
      for (const it of S.itemsFor(type)) {
        const g = existing && existing.gaps.find((x) => x.code === it.code);
        CF.items[it.code] = { ok: existing ? !g : null, supply: g ? g.supply : false, action: g && g.action ? g.action : "", requested: F.today };
      }
    }
    const prior = priorFindings(e.id);
    const openGaps = F.supply.filter((g) => g.employee_id === e.id);
    return `
      <div class="m-top">
        <a href="#/check/${type}" class="back">‹ ${S.CHECK_TYPES[type].label}</a>
        <div class="row"><div class="avatar">${initials(e.name)}</div><div class="grow"><b style="font-size:16px">${esc(e.name)}</b>
          <div class="muted small">${esc(e.staff_no)} · ${esc(e.trade)}${e.uniform_size ? ` · Uniform ${esc(e.uniform_size)}` : ""}${e.shoe_size ? ` · Shoes ${esc(e.shoe_size)}` : ""}</div></div></div>
      </div>
      <div class="m-body">
        ${existing ? `<div class="flash info">Already checked today. Saving again replaces the earlier result.</div>` : ""}
        ${prior.length ? `<div class="flash warn">⚠️ <b>${plural(prior.length, "finding")} in the last 90 days</b> (latest ${fmtDate(prior[0])}).</div>` : ""}
        ${openGaps.length ? `<div class="flash info">📦 Waiting from Stores: ${openGaps.map((g) => `${esc(g.item)} (requested ${fmtDate(g.requested_on)})`).join(", ")}</div>` : ""}
        <form id="check-form">${checkFormBody(type, prior.length, openGaps)}</form>
      </div>`;
  }

  function checkFormBody(type, priorCount, openGaps) {
    const items = S.itemsFor(type);
    const st = CF.items;
    const unanswered = items.filter((i) => st[i.code].ok === null).length;
    const failed = items.filter((i) => st[i.code].ok === false && !st[i.code].supply);
    const missingAction = failed.filter((i) => !st[i.code].action).length;
    const w = S.warningFor(priorCount + 1);
    const quick = S.ACTIONS.filter((a) => ["corrected", "sent_to_change", "item_issued", "verbal_warning"].includes(a.code));
    const blocked = CF.mode === "checked" && (unanswered > 0 || missingAction > 0);
    const areas = S.AREAS.filter((a) => items.some((i) => i.area === a.code));
    return `
      <div class="status-row">${["checked", "absent", "leave"].map((m) => `<button type="button" class="chip ${CF.mode === m ? "on" : ""}" data-mode="${m}">${{ checked: "Present", absent: "Absent", leave: "On leave" }[m]}</button>`).join("")}</div>
      ${CF.mode === "checked" ? `
        <button type="button" class="btn ghost small mb" data-allok>✓ Mark remaining items OK</button>
        ${areas.map((a) => `<div class="card sec"><h4><span>${a.label}</span><span class="muted" style="letter-spacing:0">${a.points} pts</span></h4>
          ${items.filter((i) => i.area === a.code).map((i) => {
            const s = st[i.code];
            return `<div class="item">
              <div class="row"><div class="grow"><div class="lbl">${esc(i.label)}</div>${i.hint ? `<div class="hint">${esc(i.hint)}</div>` : ""}</div>
                <div class="yn"><button type="button" aria-label="${esc(i.label)}: OK" class="y ${s.ok === true ? "on" : ""}" data-ok="${i.code}">✓</button><button type="button" aria-label="${esc(i.label)}: not OK" class="n ${s.ok === false ? "on" : ""}" data-no="${i.code}">✕</button></div></div>
              ${s.ok === false ? `<div class="gapbox">
                ${i.supply ? `<div class="l">IS THIS A SUPPLY GAP?</div><div class="chips">
                    <button type="button" class="chip ${!s.supply ? "on" : ""}" data-supply="${i.code}" data-v="0">No, staff not compliant</button>
                    <button type="button" class="chip ${s.supply ? "sel-blue" : ""}" data-supply="${i.code}" data-v="1">Yes, requested, not received</button></div>
                  ${s.supply ? `<label class="field mt-s" style="margin-bottom:4px">Date requested<input type="date" data-req="${i.code}" value="${s.requested}" max="${F.today}"></label>
                    <div class="blue small">📦 Not counted against the employee. Sent to Stores.${openGaps.some((g) => g.item === i.label) ? " Already on the supply list." : ""}</div>` : ""}` : ""}
                ${!s.supply ? `<div class="l" style="margin-top:${i.supply ? 10 : 2}px">ACTION TAKEN TODAY</div><div class="chips">${quick.map((ac) => `<button type="button" class="chip ${s.action === ac.code ? "sel-green" : ""}" data-action="${i.code}" data-v="${ac.code}">${ac.label}</button>`).join("")}</div>` : ""}
              </div>` : ""}
            </div>`;
          }).join("")}</div>`).join("")}
        ${failed.length ? `<div class="flash warn"><b>This is finding no. ${priorCount + 1} in 90 days: ${w.level.toLowerCase()}.</b><br>Policy: ${w.action} (${w.by}).</div>` : ""}
        <div class="card sec"><h4><span>Note and photo (optional)</span></h4>
          <textarea id="note" placeholder="What was wrong, what was done" style="width:100%">${esc(CF.note)}</textarea>
          <label class="field mt-s">Photo<input type="file" id="photo" accept="image/*" capture="environment"></label>
          ${CF.photo ? `<img src="${CF.photo}" class="photo-thumb" alt="New photo">` : ""}
        </div>` : `<div class="card sec"><h4><span>Note (optional)</span></h4><textarea id="note" style="width:100%">${esc(CF.note)}</textarea></div>`}
      <div class="sticky-save">
        ${CF.mode === "checked" && unanswered ? `<div class="muted small mb" style="text-align:center">${plural(unanswered, "item")} not answered</div>` : ""}
        ${CF.mode === "checked" && !unanswered && missingAction ? `<div class="red small mb" style="text-align:center">Choose the action taken for each gap</div>` : ""}
        <button class="btn block" type="submit" ${blocked ? "disabled" : ""}>Save</button>
      </div>`;
  }

  function rerenderForm() {
    const form = document.getElementById("check-form");
    if (!form) return;
    const y = window.scrollY;
    form.innerHTML = checkFormBody(CF.type, priorFindings(CF.empId).length, F.supply.filter((g) => g.employee_id === CF.empId));
    window.scrollTo(0, y);
  }

  async function saveCheck() {
    const items = S.itemsFor(CF.type);
    const gaps = CF.mode !== "checked" ? [] : items.filter((i) => CF.items[i.code].ok === false).map((i) => {
      const s = CF.items[i.code];
      return { code: i.code, label: i.label, supply: !!(i.supply && s.supply), action: i.supply && s.supply ? "" : s.action, requested: s.requested };
    });
    const emp = F.staff.find((e) => e.id === CF.empId);
    G.busy(true);
    try {
      const out = await G.api("saveCheck", { employee_id: CF.empId, type: CF.type, status: CF.mode, gaps, note: CF.note, photo: CF.photo || "" });
      F.checks = F.checks.filter((c) => c.id !== out.check.id && !(c.employee_id === CF.empId && c.type === CF.type && c.date === F.today)).concat([out.check]);
      const todayGaps = F.checks.some((c) => c.employee_id === CF.empId && c.date === F.today && c.status === "gaps");
      const list = (F.findings[CF.empId] || []).filter((d) => d !== F.today);
      F.findings[CF.empId] = todayGaps ? list.concat([F.today]) : list;
      const type = CF.type;
      CF = null;
      location.hash = `#/check/${type}?saved=${encodeURIComponent(emp.name)}`;
      load(true).then(() => { if (route().parts[0] === "check" && !route().parts[2]) render(); }).catch(() => {});
    } catch (e) { G.toast(e.message, "err"); }
    finally { G.busy(false); }
  }

  // ---------------- submit ----------------
  function submitPage(q) {
    const checks = checksOn("site");
    const c = [...checks.values()];
    const missing = F.staff.filter((e) => !checks.has(e.id));
    const sub = F.submission;
    const withGaps = c.filter((x) => x.gaps.length).map((x) => ({ x, e: F.staff.find((e) => e.id === x.employee_id) })).filter((r) => r.e).sort((a, b) => a.e.name.localeCompare(b.e.name));
    return `
      <div class="m-top"><a href="#/" class="back">‹ Today</a><h1>Submit daily checklist</h1><div class="muted small">${esc(site().name)} · ${fmtDay(F.today)}</div></div>
      <div class="m-body">
        ${q.sent ? `<div class="flash ok">✓ Sent to Head Office. You can resend if you change any check today.</div>` : sub ? `<div class="flash ok">Sent at ${esc(sub.time)} by ${esc(sub.by)}.</div>` : ""}
        <div class="stats">
          <div class="card stat"><b>${F.staff.length}</b><span>Staff on site</span></div>
          <div class="card stat"><b class="green">${c.filter((x) => x.status === "pass").length}</b><span>Passed</span></div>
          <div class="card stat"><b class="red">${c.filter((x) => x.status === "gaps").length}</b><span>With gaps</span></div>
          <div class="card stat"><b class="blue">${c.filter((x) => x.status === "supply").length}</b><span>Supply gap · ${c.filter((x) => ["absent", "leave"].includes(x.status)).length} absent/leave</span></div>
        </div>
        ${missing.length ? `<div class="flash warn"><b>${missing.length} not checked yet:</b> ${missing.slice(0, 6).map((e) => esc(e.name)).join(", ")}${missing.length > 6 ? "…" : ""}<div class="mt-s"><a href="#/check/site?f=todo" class="btn small">Check them now</a></div></div>` : ""}
        ${withGaps.length ? `<div class="eyebrow" style="margin:4px 2px 8px">Gaps and action taken</div><div class="card mb">${withGaps.map(({ x, e }) => {
          const real = x.gaps.filter((g) => !g.supply);
          const acts = [...new Set(real.map((g) => S.actionLabel(g.action)).filter(Boolean))].join(", ");
          return `<div class="gl"><div class="row between"><b>${esc(e.name)}</b>${real.length ? `<span class="pill amber">${esc(acts || "Gap")}</span>` : `<span class="pill blue">Supply gap</span>`}</div>
            <small>${x.gaps.map((g) => esc(S.itemLabel(g.code)) + (g.supply ? " (supply)" : "")).join(" · ")}</small></div>`;
        }).join("")}</div>` : ""}
        <form id="submit-form">
          <label class="confirm"><input type="checkbox" name="confirm" required> I confirm I checked every staff member on this site today.</label>
          <button class="btn navy block" type="submit" ${missing.length ? "disabled" : ""}>${sub ? "Send again" : "Send to Head Office"}</button>
        </form>
      </div>`;
  }

  // ---------------- supply ----------------
  function supplyPage() {
    const can = F.user.can.issueSupply;
    return `
      <div class="m-top"><a href="#/" class="back">‹ Today</a><h1>Supply gaps · ${esc(site().name)}</h1>
        <div class="muted small">Items staff asked for but have not received. These are not counted against the staff member.</div></div>
      <div class="m-body">
        ${F.supply.length === 0 ? `<p class="muted mb">Nothing waiting from Stores. 👍</p>` : `<div class="card mb">${F.supply.map((g) => {
          const e = F.staff.find((x) => x.id === g.employee_id) || { name: "?" };
          const age = G.supplyAge(g, F.today);
          const size = /uniform/i.test(g.item) && e.uniform_size ? ` (size ${esc(e.uniform_size)})` : /shoe/i.test(g.item) && e.shoe_size ? ` (size ${esc(e.shoe_size)})` : "";
          return `<div class="gl"><div class="row between"><b>${esc(e.name)}</b><span class="pill ${age > T.supplyWorkingDays ? "red" : "blue"}">${plural(age, "working day")}</span></div>
            <small>${esc(g.item)}${size} · requested ${fmtDate(g.requested_on)}</small>
            ${can ? `<button class="btn small ghost mt-s" data-issue="${g.id}">✓ Received today</button>` : ""}</div>`;
        }).join("")}</div>`}
        <details class="card sec"><summary style="padding:12px 0;font-weight:600;cursor:pointer">+ Record a new request</summary>
          <form id="supply-form" style="padding-bottom:8px">
            <label class="field">Employee<select name="employee_id" required>${F.staff.map((e) => `<option value="${e.id}">${esc(e.name)} · ${esc(e.staff_no)}</option>`).join("")}</select></label>
            <label class="field">Item<select name="item">${S.ITEMS.filter((i) => i.supply).map((i) => `<option>${esc(i.label)}</option>`).join("")}<option value="">Other (type below)</option></select></label>
            <label class="field">Other item<input type="text" name="other" placeholder="e.g. Rain jacket"></label>
            <label class="field">Date requested<input type="date" name="requested" value="${F.today}" max="${F.today}"></label>
            <button class="btn block" type="submit">Add</button>
          </form></details>
      </div>`;
  }

  // ---------------- training ----------------
  function trainingPage() {
    const done = F.staff.filter((e) => e.trained_on).length;
    const p = F.staff.length ? Math.round((100 * done) / F.staff.length) : 0;
    const list = [...F.staff].sort((a, b) => Number(!!a.trained_on) - Number(!!b.trained_on) || a.name.localeCompare(b.name));
    return `
      <div class="m-top"><a href="#/" class="back">‹ Today</a><h1>Toolbox talk training</h1>
        <div class="muted small">Grooming, Etiquette & Work Standards. Target: 100% of staff by ${fmtDate(T.trainingDeadline, true)}.</div>
        <div class="bar" style="height:8px"><i style="width:${p}%"></i></div><div class="small mt-s"><b>${done} of ${F.staff.length}</b> trained (${p}%)</div></div>
      <div class="m-body">
        <div class="flash info">Run the toolbox talk with the team, then mark each person who attended.</div>
        <div class="card emp-list">${list.map((e) => `
          <div class="emp"><div class="avatar">${initials(e.name)}</div><div class="grow"><b>${esc(e.name)}</b><span>${esc(e.staff_no)} · ${e.trained_on ? `Trained ${fmtDate(e.trained_on)}` : "Not trained yet"}</span></div>
            ${F.user.can.markTraining ? (e.trained_on ? `<button class="pill green" style="border:0;cursor:pointer" data-train="${e.id}" data-undo="1" title="Tap to undo">✓ Trained</button>` : `<button class="btn small" data-train="${e.id}">Mark trained</button>`) : ""}</div>`).join("")}
        </div>
      </div>`;
  }

  // ---------------- events ----------------
  root.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button, a");
    if (!b) return;
    if (b.getAttribute("href") === "#/logout") { ev.preventDefault(); G.logout(); return; }
    if (b.getAttribute("href") === "#/refresh") { ev.preventDefault(); await load(); location.hash = "#/"; render(); return; }
    if (CF && b.closest("#check-form")) {
      const d = b.dataset;
      if (d.mode) CF.mode = d.mode;
      else if (d.allok !== undefined) Object.values(CF.items).forEach((s) => { if (s.ok === null) s.ok = true; });
      else if (d.ok) CF.items[d.ok].ok = true;
      else if (d.no) CF.items[d.no].ok = false;
      else if (d.supply) CF.items[d.supply].supply = d.v === "1";
      else if (d.action) CF.items[d.action].action = d.v;
      else return;
      rerenderForm();
      return;
    }
    if (b.dataset.issue) {
      G.busy(true);
      try { await G.api("issueSupply", { id: b.dataset.issue }); F.supply = F.supply.filter((g) => g.id !== b.dataset.issue); G.toast("Marked as received."); render(); }
      catch (e) { G.toast(e.message, "err"); } finally { G.busy(false); }
    }
    if (b.dataset.train) {
      G.busy(true);
      try {
        await G.api("trained", { employee_id: b.dataset.train, undo: !!b.dataset.undo });
        const e = F.staff.find((x) => x.id === b.dataset.train);
        e.trained_on = b.dataset.undo ? null : F.today;
        render();
      } catch (e) { G.toast(e.message, "err"); } finally { G.busy(false); }
    }
  });

  root.addEventListener("change", async (ev) => {
    const t = ev.target;
    if (t.id === "site-pick") { localStorage.setItem(SITE_KEY, t.value); await load(); render(); }
    if (t.dataset.req && CF) CF.items[t.dataset.req].requested = t.value;
    if (t.id === "photo" && t.files[0]) {
      try { CF.photo = await G.shrinkPhoto(t.files[0]); rerenderForm(); } catch (e) { G.toast(e.message, "err"); }
    }
  });

  root.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.id === "note" && CF) CF.note = t.value;
    if (t.id === "search") {
      clearTimeout(t._t);
      t._t = setTimeout(() => {
        const qs = new URLSearchParams({ f: t.dataset.f, ...(t.value ? { q: t.value } : {}) });
        history.replaceState(null, "", `#/check/${t.dataset.type}?${qs}`);
        const pos = t.selectionStart;
        render();
        const n = document.getElementById("search");
        n.focus();
        n.setSelectionRange(pos, pos);
      }, 250);
    }
  });

  root.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (f.id === "check-form") return saveCheck();
    if (f.id === "submit-form") {
      G.busy(true);
      try { const out = await G.api("submitDay", { site_id: F.site }); F.submission = out.submission; location.hash = "#/submit?sent=1"; }
      catch (e) { G.toast(e.message, "err"); } finally { G.busy(false); }
    }
    if (f.id === "supply-form") {
      const d = G.formData(f);
      G.busy(true);
      try { await G.api("addSupply", { employee_id: d.employee_id, item: d.item || d.other, requested: d.requested }); await load(true); G.toast("Added to the supply list."); render(); }
      catch (e) { G.toast(e.message, "err"); } finally { G.busy(false); }
    }
  });

  start().catch(() => {});
})();
