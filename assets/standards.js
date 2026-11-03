/* Checklist standards, taken from the ABFM Grooming, Etiquette & Work Efficiency Policy.
   Edit this file to change what supervisors check. Item codes are saved with every check,
   so keep existing codes and add new ones rather than renaming. After editing, bump VERSION in sw.js. */
window.STD = (function () {
  const AREAS = [
    { code: "grooming", label: "Grooming and uniform", points: 30 },
    { code: "ppe", label: "PPE", points: 25 },
    { code: "communication", label: "Conduct and communication", points: 25 },
  ];
  const ITEMS = [
    // Standard 1: Grooming
    { code: "hygiene", area: "grooming", label: "Personal hygiene", hint: "Bathed, fresh breath, mild deodorant, no chewing gum", checks: ["site", "camp"] },
    { code: "nails", area: "grooming", label: "Nails short and clean", hint: "Grease removed", checks: ["site", "camp"] },
    { code: "hair", area: "grooming", label: "Hair short and neat", hint: "Clean, combed, not below the collar, no colour, no personal cap", checks: ["site", "camp"] },
    { code: "facial_hair", area: "grooming", label: "Beard / moustache trimmed", hint: "Or clean shaven", checks: ["site", "camp"] },
    { code: "uniform", area: "grooming", label: "Full uniform, correct size", hint: "No jeans, shorts, lungis or sleeveless tops", checks: ["site", "camp", "field"], supply: true },
    { code: "uniform_clean", area: "grooming", label: "Uniform clean and pressed", hint: "", checks: ["site", "camp"] },
    { code: "accessories", area: "grooming", label: "Accessories within policy", hint: "One small ring per hand, no earrings or piercings, chains inside the shirt", checks: ["site", "camp"] },
    { code: "id_card", area: "grooming", label: "ID card carried and displayed", hint: "", checks: ["site", "camp", "field"], supply: true },
    // Standard 3: PPE
    { code: "shoes", area: "ppe", label: "Safety shoes", hint: "Steel-toe, non-slip", checks: ["site", "field"], supply: true },
    { code: "gloves", area: "ppe", label: "Correct gloves for the task", hint: "Fabric or rubber", checks: ["site", "field"], supply: true },
    { code: "ppe_task", area: "ppe", label: "Task PPE", hint: "Mask, goggles, ear plugs, helmet in tight spaces, as the task needs", checks: ["field"], supply: true },
    // Standard 2: Etiquette and customer communication
    { code: "greeting", area: "communication", label: "Greets politely, stays calm", hint: "Never argues; difficult customers go to the supervisor", checks: ["site", "field"] },
    { code: "phone", area: "communication", label: "Phone on silent, no personal calls or photos", hint: "No selfies or photos of customers", checks: ["site", "field"] },
    { code: "behaviour", area: "communication", label: "Behaviour on duty", hint: "Upright, hands out of pockets, no eating, chewing or spitting in client areas", checks: ["field"] },
    { code: "work_tidy", area: "communication", label: "Prepared and tidy on the job", hint: "Knows the request, shoe covers, barrier at height, cleans up before leaving", checks: ["field"] },
  ];
  const CHECK_TYPES = {
    site: { label: "Site check", short: "Site", who: "FM Manager or supervisor checks every staff member on site" },
    camp: { label: "Camp check", short: "Camp", who: "Camp Boss checks grooming, uniform and ID card before staff leave" },
    field: { label: "Random field check", short: "Field", who: "Technicians checked during work, at least 3 per site per week" },
  };
  const ACTIONS = [
    { code: "corrected", label: "Corrected on the spot" },
    { code: "sent_to_change", label: "Sent to change" },
    { code: "item_issued", label: "Item issued" },
    { code: "verbal_warning", label: "Verbal warning" },
    { code: "written_warning", label: "Written warning" },
    { code: "referred_hr", label: "Referred to HR" },
  ];
  /* Defaults. Administrators can change these in the dashboard (Sites & users → Rules); the saved values win. */
  const TARGETS = {
    auditPass: 85, findingCloseDays: 7, reportDays: 2, planDays: 3, reauditDays: 14,
    fieldChecksPerWeek: 3, supplyWorkingDays: 5, warningWindowDays: 90, trainingDeadline: "2026-11-25",
    checklistDue: "18:00", deductRepeat: "", deductFurther: "", digestOn: "0", digestHour: 19, dashboardUrl: "",
  };
  /* Incidents supervisors report the same day (policy: difficult customers, serious conduct). */
  const INCIDENT_TYPES = [
    { code: "difficult_customer", label: "Difficult customer", hint: "Upset or aggressive customer, handed to the supervisor" },
    { code: "complaint", label: "Customer complaint", hint: "About appearance, behaviour or work" },
    { code: "serious_conduct", label: "Serious conduct", hint: "Staff removed from site; HR investigation, OCO informed" },
    { code: "damage", label: "Damage at the property", hint: "Customer property damaged or soiled" },
    { code: "other", label: "Other", hint: "" },
  ];
  /* Baseline check: what each person should hold. */
  const BASELINE_ITEMS = [
    { code: "uniform", label: "Full uniform set" }, { code: "id_card", label: "ID card" }, { code: "shoes", label: "Safety shoes" },
    { code: "gloves_fabric", label: "Fabric gloves" }, { code: "gloves_rubber", label: "Rubber gloves" }, { code: "mask", label: "Mask" },
    { code: "goggles", label: "Goggles" }, { code: "ear_plugs", label: "Ear plugs" }, { code: "helmet", label: "Helmet" }, { code: "shoe_covers", label: "Shoe covers" },
  ];
  /* HR register entries. */
  const DISCIPLINE_LEVELS = [
    { code: "verbal", label: "Verbal warning" }, { code: "written", label: "Written warning" }, { code: "refresher", label: "Refresher session" },
    { code: "hr_action", label: "HR disciplinary action" }, { code: "deduction", label: "Salary deduction" },
    { code: "investigation", label: "HR investigation" }, { code: "removal", label: "Removed from site" },
  ];
  const ROLES = [
    { code: "supervisor", label: "Supervisor / Team Leader" },
    { code: "camp_boss", label: "Camp Boss" },
    { code: "site_manager", label: "Site Manager" },
    { code: "fm_manager", label: "FM Manager" },
    { code: "director", label: "Director of Operations" },
    { code: "oco", label: "Operations Control Officer" },
    { code: "hse", label: "HSE" },
    { code: "hr", label: "HR" },
    { code: "stores", label: "Stores / Procurement" },
    { code: "admin", label: "Administrator" },
  ];
  return {
    AREAS, ITEMS, CHECK_TYPES, ACTIONS, TARGETS, ROLES, INCIDENT_TYPES, BASELINE_ITEMS, DISCIPLINE_LEVELS,
    incidentLabel: (code) => (INCIDENT_TYPES.find((i) => i.code === code) || {}).label || code,
    baselineLabel: (code) => (BASELINE_ITEMS.find((i) => i.code === code) || {}).label || code,
    levelLabel: (code) => (DISCIPLINE_LEVELS.find((i) => i.code === code) || {}).label || code,
    /** Apply the rules saved by the administrator. */
    applySettings(st) {
      if (!st) return;
      for (const k of Object.keys(TARGETS)) if (st[k] !== undefined && st[k] !== null) TARGETS[k] = typeof TARGETS[k] === "number" ? Number(st[k]) || TARGETS[k] : String(st[k]);
    },
    itemsFor: (type) => ITEMS.filter((i) => i.checks.includes(type)),
    itemLabel: (code) => (ITEMS.find((i) => i.code === code) || {}).label || code,
    actionLabel: (code) => (ACTIONS.find((a) => a.code === code) || {}).label || "",
    roleLabel: (code) => (ROLES.find((r) => r.code === code) || {}).label || code,
    /** Escalation ladder from the policy. n = this finding's number in the 90-day window. */
    warningFor(n) {
      if (n <= 1) return { level: "First finding", action: "Correct on the spot; verbal warning recorded", by: "FM Manager or supervisor" };
      if (n === 2) return { level: "Repeat finding", action: "Written warning and refresher session", by: "FM Manager with HR" };
      return { level: "Further repeat", action: "Disciplinary action under HR policy (salary deduction possible)", by: "HR" };
    },
  };
})();
