import { TARGETS } from "@/lib/standards";

export function stripClass(d: { pct: number | null; sent: boolean }): string {
  if (d.pct === null) return d.sent ? "c-g" : "c-x";
  if (!d.sent) return "c-x";
  if (d.pct >= 100) return "c-g";
  if (d.pct >= 90) return "c-g2";
  if (d.pct >= 80) return "c-a";
  return "c-r";
}

export function StripLegend() {
  return (
    <span className="legend">
      <span><i className="c-g" />100%</span><span><i className="c-g2" />90–99%</span><span><i className="c-a" />80–89%</span><span><i className="c-r" />&lt;80%</span><span><i className="c-x" />Not sent</span>
    </span>
  );
}

export function AuditScore({ total }: { total: number }) {
  const pass = total >= TARGETS.auditPass;
  return (
    <span className="nw">
      <span className="score" style={{ color: pass ? undefined : "var(--red)" }}>{total}</span>{" "}
      <span className={`pill ${pass ? "green" : "red"}`}>{pass ? "Pass" : "Fail"}</span>
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="muted" style={{ padding: "8px 0" }}>{children}</p>;
}

export const pct = (v: number | null, d = 0) => (v === null ? "–" : `${v.toFixed(d)}%`);
