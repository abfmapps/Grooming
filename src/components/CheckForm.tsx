"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { saveCheck } from "@/app/app/actions";
import { ACTIONS, warningFor } from "@/lib/standards";

interface ItemDef { code: string; label: string; hint: string; supplyItem: boolean }
interface Props {
  employeeId: number;
  type: string;
  areas: { code: string; label: string; points: number; items: ItemDef[] }[];
  priorFindings: number;
  openGapItems: string[];
  existing: { status: string; note: string; photo: string | null; items: { code: string; ok: boolean; supply: boolean; action: string }[] } | null;
  today: string;
}
interface ItemState { ok: boolean | null; supply: boolean; action: string; requested: string }

const QUICK_ACTIONS = ACTIONS.filter((a) => ["corrected", "sent_to_change", "item_issued", "verbal_warning"].includes(a.code));

export function CheckForm({ employeeId, type, areas, priorFindings, openGapItems, existing, today }: Props) {
  const all = areas.flatMap((a) => a.items);
  const [mode, setMode] = useState<"checked" | "absent" | "leave">(
    existing?.status === "absent" ? "absent" : existing?.status === "leave" ? "leave" : "checked",
  );
  const [state, setState] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      all.map((i) => {
        const ex = existing?.items.find((x) => x.code === i.code);
        return [i.code, { ok: ex ? ex.ok : null, supply: ex?.supply ?? false, action: ex?.action ?? "", requested: today }];
      }),
    ),
  );
  const set = (code: string, patch: Partial<ItemState>) => setState((s) => ({ ...s, [code]: { ...s[code], ...patch } }));
  const unanswered = all.filter((i) => state[i.code].ok === null).length;
  const failed = all.filter((i) => state[i.code].ok === false && !state[i.code].supply);
  const missingAction = failed.filter((i) => !state[i.code].action).length;
  const isFinding = mode === "checked" && failed.length > 0;
  const w = warningFor(priorFindings + 1);

  return (
    <form action={saveCheck} encType="multipart/form-data">
      <input type="hidden" name="employee" value={employeeId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="status" value={mode} />

      <div className="status-row">
        {(["checked", "absent", "leave"] as const).map((m) => (
          <button type="button" key={m} className={`chip ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>
            {{ checked: "Present", absent: "Absent", leave: "On leave" }[m]}
          </button>
        ))}
      </div>

      {mode === "checked" && (
        <>
          <button type="button" className="btn ghost small mb" onClick={() => setState((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.ok === null ? { ...v, ok: true } : v])))}>
            ✓ Mark remaining items OK
          </button>
          {areas.map((a) => (
            <div className="card sec" key={a.code}>
              <h4><span>{a.label}</span><span className="muted" style={{ letterSpacing: 0 }}>{a.points} pts</span></h4>
              {a.items.map((i) => {
                const st = state[i.code];
                return (
                  <div className="item" key={i.code}>
                    <input type="hidden" name={`item_${i.code}`} value={st.ok === false ? "0" : "1"} />
                    <div className="row">
                      <div className="grow">
                        <div className="lbl">{i.label}</div>
                        {i.hint && <div className="hint">{i.hint}</div>}
                      </div>
                      <div className="yn">
                        <button type="button" aria-label={`${i.label}: OK`} className={`y ${st.ok === true ? "on" : ""}`} onClick={() => set(i.code, { ok: true })}>✓</button>
                        <button type="button" aria-label={`${i.label}: not OK`} className={`n ${st.ok === false ? "on" : ""}`} onClick={() => set(i.code, { ok: false })}>✕</button>
                      </div>
                    </div>
                    {st.ok === false && (
                      <div className="gapbox">
                        {i.supplyItem && (
                          <>
                            <div className="l">IS THIS A SUPPLY GAP?</div>
                            <div className="chips">
                              <button type="button" className={`chip ${!st.supply ? "on" : ""}`} onClick={() => set(i.code, { supply: false })}>No, staff not compliant</button>
                              <button type="button" className={`chip ${st.supply ? "sel-blue" : ""}`} onClick={() => set(i.code, { supply: true })}>Yes, requested, not received</button>
                            </div>
                            {st.supply && (
                              <>
                                <input type="hidden" name={`supply_${i.code}`} value="1" />
                                <label className="field mt-s" style={{ marginBottom: 4 }}>
                                  Date requested
                                  <input type="date" name={`requested_${i.code}`} value={st.requested} max={today} onChange={(e) => set(i.code, { requested: e.target.value })} />
                                </label>
                                <div className="blue small">📦 Not counted against the employee. Sent to Stores.{openGapItems.includes(i.label) ? " Already on the supply list." : ""}</div>
                              </>
                            )}
                          </>
                        )}
                        {!st.supply && (
                          <>
                            <div className="l" style={{ marginTop: i.supplyItem ? 10 : 2 }}>ACTION TAKEN TODAY</div>
                            <input type="hidden" name={`action_${i.code}`} value={st.action} />
                            <div className="chips">
                              {QUICK_ACTIONS.map((ac) => (
                                <button type="button" key={ac.code} className={`chip ${st.action === ac.code ? "sel-green" : ""}`} onClick={() => set(i.code, { action: ac.code })}>{ac.label}</button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {isFinding && (
            <div className="flash warn">
              <b>This is finding no. {priorFindings + 1} in 90 days: {w.level.toLowerCase()}.</b>
              <br />Policy: {w.action} ({w.by}).
            </div>
          )}

          <div className="card sec">
            <h4><span>Note and photo (optional)</span></h4>
            <textarea name="note" placeholder="What was wrong, what was done" defaultValue={existing?.note ?? ""} style={{ width: "100%" }} />
            <label className="field mt-s">
              Photo {existing?.photo ? "(replaces the saved one)" : ""}
              <input type="file" name="photo" accept="image/*" capture="environment" />
            </label>
            {existing?.photo && <img src={`/photo/${existing.photo}`} alt="Saved photo" className="photo-thumb" />}
          </div>
        </>
      )}

      {mode !== "checked" && (
        <div className="card sec">
          <h4><span>Note (optional)</span></h4>
          <textarea name="note" defaultValue={existing?.note ?? ""} style={{ width: "100%" }} />
        </div>
      )}

      <div className="sticky-save">
        {mode === "checked" && unanswered > 0 && <div className="muted small mb" style={{ textAlign: "center" }}>{unanswered} item{unanswered > 1 ? "s" : ""} not answered</div>}
        {mode === "checked" && unanswered === 0 && missingAction > 0 && <div className="red small mb" style={{ textAlign: "center" }}>Choose the action taken for each gap</div>}
        <Save disabled={mode === "checked" && (unanswered > 0 || missingAction > 0)} />
      </div>
    </form>
  );
}

function Save({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn block" type="submit" disabled={disabled || pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}
