"use client";
export function PrintButton({ label = "Print" }: { label?: string }) {
  return <button className="btn small ghost" type="button" onClick={() => window.print()}>{label}</button>;
}
