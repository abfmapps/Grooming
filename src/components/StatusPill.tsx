import type { Check } from "@/lib/queries";

export function StatusPill({ c }: { c?: Check & { gapCount?: number } }) {
  if (!c) return <span className="pill grey">To check</span>;
  switch (c.status) {
    case "pass": return <span className="pill green">✓ Pass</span>;
    case "gaps": return <span className="pill red">{c.gapCount ? `${c.gapCount} gap${c.gapCount > 1 ? "s" : ""}` : "Gaps"}</span>;
    case "supply": return <span className="pill blue">Supply gap</span>;
    case "absent": return <span className="pill amber">Absent</span>;
    case "leave": return <span className="pill grey">On leave</span>;
  }
}
