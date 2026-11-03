// Checklist standards, taken from the ABFM Grooming, Etiquette & Work Efficiency Policy.
// Edit this file to change what supervisors check. Item codes are stored in the
// database, so keep existing codes stable and add new ones instead of renaming.

export type CheckType = "site" | "camp" | "field";

export type AreaCode = "grooming" | "ppe" | "communication";

export interface Area {
  code: AreaCode;
  label: string;
  auditPoints: number;
}

export interface Item {
  code: string;
  area: AreaCode;
  label: string;
  hint: string;
  checks: CheckType[];
  /** True when a missing item could be a supply gap (uniform, PPE, ID card). */
  supplyItem?: boolean;
}

export const AREAS: Area[] = [
  { code: "grooming", label: "Grooming and uniform", auditPoints: 30 },
  { code: "ppe", label: "PPE", auditPoints: 25 },
  { code: "communication", label: "Conduct and communication", auditPoints: 25 },
];

export const ITEMS: Item[] = [
  // Standard 1: Grooming
  { code: "hygiene", area: "grooming", label: "Personal hygiene", hint: "Bathed, fresh breath, mild deodorant, no chewing gum", checks: ["site", "camp"] },
  { code: "nails", area: "grooming", label: "Nails short and clean", hint: "Grease removed", checks: ["site", "camp"] },
  { code: "hair", area: "grooming", label: "Hair short and neat", hint: "Clean, combed, not below the collar, no colour, no personal cap", checks: ["site", "camp"] },
  { code: "facial_hair", area: "grooming", label: "Beard / moustache trimmed", hint: "Or clean shaven", checks: ["site", "camp"] },
  { code: "uniform", area: "grooming", label: "Full uniform, correct size", hint: "No jeans, shorts, lungis or sleeveless tops", checks: ["site", "camp", "field"], supplyItem: true },
  { code: "uniform_clean", area: "grooming", label: "Uniform clean and pressed", hint: "", checks: ["site", "camp"] },
  { code: "accessories", area: "grooming", label: "Accessories within policy", hint: "One small ring per hand, no earrings or piercings, chains inside the shirt", checks: ["site", "camp"] },
  { code: "id_card", area: "grooming", label: "ID card carried and displayed", hint: "", checks: ["site", "camp", "field"], supplyItem: true },
  // Standard 3: PPE
  { code: "shoes", area: "ppe", label: "Safety shoes", hint: "Steel-toe, non-slip", checks: ["site", "field"], supplyItem: true },
  { code: "gloves", area: "ppe", label: "Correct gloves for the task", hint: "Fabric or rubber", checks: ["site", "field"], supplyItem: true },
  { code: "ppe_task", area: "ppe", label: "Task PPE", hint: "Mask, goggles, ear plugs, helmet in tight spaces, as the task needs", checks: ["field"], supplyItem: true },
  // Standard 2: Etiquette and customer communication
  { code: "greeting", area: "communication", label: "Greets politely, stays calm", hint: "Never argues; difficult customers go to the supervisor", checks: ["site", "field"] },
  { code: "phone", area: "communication", label: "Phone on silent, no personal calls or photos", hint: "No selfies or photos of customers", checks: ["site", "field"] },
  { code: "behaviour", area: "communication", label: "Behaviour on duty", hint: "Upright, hands out of pockets, no eating, chewing or spitting in client areas", checks: ["field"] },
  { code: "work_tidy", area: "communication", label: "Prepared and tidy on the job", hint: "Knows the request, shoe covers, barrier at height, cleans up before leaving", checks: ["field"] },
];

export const CHECK_TYPES: Record<CheckType, { label: string; short: string; who: string }> = {
  site: { label: "Site check", short: "Site", who: "FM Manager or supervisor checks every staff member on site" },
  camp: { label: "Camp check", short: "Camp", who: "Camp Boss checks grooming, uniform and ID card before staff leave" },
  field: { label: "Random field check", short: "Field", who: "Technicians checked during work, at least 3 per site per week" },
};

export const ACTIONS: { code: string; label: string }[] = [
  { code: "corrected", label: "Corrected on the spot" },
  { code: "sent_to_change", label: "Sent to change" },
  { code: "item_issued", label: "Item issued" },
  { code: "verbal_warning", label: "Verbal warning" },
  { code: "written_warning", label: "Written warning" },
  { code: "referred_hr", label: "Referred to HR" },
];

export function actionLabel(code: string | null | undefined): string {
  return ACTIONS.find((a) => a.code === code)?.label ?? "";
}

export function itemsFor(type: CheckType): Item[] {
  return ITEMS.filter((i) => i.checks.includes(type));
}

export function itemLabel(code: string): string {
  return ITEMS.find((i) => i.code === code)?.label ?? code;
}

/** Policy targets */
export const TARGETS = {
  auditPass: 85,
  findingCloseDays: 7,
  reportDays: 2,
  planDays: 3,
  reauditDays: 14,
  fieldChecksPerWeek: 3,
  supplyWorkingDays: 5,
  warningWindowDays: 90,
  trainingDeadline: "2026-11-25",
};

/** Escalation ladder from the policy's non-compliance table. n = this finding's number in the window. */
export function warningFor(n: number): { level: string; action: string; by: string } {
  if (n <= 1) return { level: "First finding", action: "Correct on the spot; verbal warning recorded", by: "FM Manager or supervisor" };
  if (n === 2) return { level: "Repeat finding", action: "Written warning and refresher session", by: "FM Manager with HR" };
  return { level: "Further repeat", action: "Disciplinary action under HR policy (salary deduction possible)", by: "HR" };
}
