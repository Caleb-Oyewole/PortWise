import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, PackageCheck } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatPct } from "@/lib/format";
import { Alert, Button } from "@/components/ui/primitives";
import { adminApi, CSV_TEMPLATE, type ImportReport } from "./api";
import { PageHeader, Panel, Pill } from "./ui";

const STATUS = {
  new_code: { label: "New code", tone: "ok" },
  new_rate: { label: "New rate", tone: "scheduled" },
  unchanged: { label: "Unchanged", tone: "retired" },
  error: { label: "Error", tone: "error" },
} as const;

type Source = { kind: "catalog" } | { kind: "csv"; text: string; name: string };

export function ImportPage() {
  const qc = useQueryClient();
  const [source, setSource] = useState<Source | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const run = useMutation({
    mutationFn: ({ src, dry }: { src: Source; dry: boolean }) =>
      src.kind === "catalog" ? adminApi.loadCatalog(dry) : adminApi.importCsv(src.text, dry),
    onSuccess: (r) => {
      setReport(r);
      if (!r.dry_run) {
        void qc.invalidateQueries({ queryKey: ["admin"] });
        void qc.invalidateQueries({ queryKey: ["hs-codes"] });
      }
    },
  });

  const preview = (src: Source) => {
    setSource(src);
    setReport(null);
    run.mutate({ src, dry: true });
  };

  const toAdd = report ? (report.counts.new_code ?? 0) + (report.counts.new_rate ?? 0) : 0;
  const error = run.error instanceof ApiError || run.error instanceof Error ? run.error.message : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import tariffs"
        description="Every import is previewed first. Invalid rows are skipped and listed; rows identical to the rate in force are left alone."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-5">
          <PackageCheck className="size-6 text-pw-navy" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-pw-navy">The 2026 tariff catalog</h2>
          <p className="mt-1 text-sm leading-6 text-pw-muted">
            32 product lines in six categories, each duty rate read from the ECOWAS CET 2022–2027 at the 10-digit line and checked against
            Nigeria's 2026 Fiscal Policy Measures. Shipped with the API.
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => preview({ kind: "catalog" })} loading={run.isPending && source?.kind === "catalog"}>
            Preview the catalog
          </Button>
        </Panel>

        <Panel className="p-5">
          <FileUp className="size-6 text-pw-navy" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-pw-navy">Your own CSV</h2>
          <p className="mt-1 text-sm leading-6 text-pw-muted">
            Columns: code, description, duty_rate_pct (required), plus category, keywords, iat_rate_pct, prohibited, source_ref,
            effective_from.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-button)] border border-pw-input bg-white px-4 text-sm font-semibold text-pw-navy hover:border-pw-navy focus-within:outline focus-within:outline-2 focus-within:outline-pw-blue">
              Choose a CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) preview({ kind: "csv", text: await file.text(), name: file.name });
                  e.target.value = "";
                }}
              />
            </label>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
              download="portwise-tariffs-template.csv"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-pw-blue hover:underline"
            >
              <Download className="size-4" aria-hidden="true" /> Template
            </a>
          </div>
        </Panel>
      </div>

      {error && <Alert tone="error" title={error} />}

      {report && source && (
        <Panel>
          <div className="flex flex-col gap-3 border-b border-pw-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-pw-navy">
                {report.dry_run ? "Preview" : "Imported"}: {source.kind === "catalog" ? "2026 tariff catalog" : source.name}
              </h2>
              <p className="mt-0.5 flex flex-wrap gap-2 text-sm">
                {Object.entries(report.counts).map(([k, n]) => (
                  <Pill key={k} tone={STATUS[k as keyof typeof STATUS]?.tone ?? "retired"}>
                    {n} {STATUS[k as keyof typeof STATUS]?.label.toLowerCase() ?? k}
                  </Pill>
                ))}
              </p>
            </div>
            {report.dry_run ? (
              <Button onClick={() => run.mutate({ src: source, dry: false })} disabled={toAdd === 0} loading={run.isPending}>
                {toAdd === 0 ? "Nothing to import" : `Import ${toAdd} line${toAdd === 1 ? "" : "s"}`}
              </Button>
            ) : (
              <Alert tone="success" title={`${toAdd} tariff line${toAdd === 1 ? "" : "s"} added.`} className="sm:max-w-sm" />
            )}
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Rows in the file</caption>
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-pw-border text-left text-[13px] text-pw-muted">
                  <th scope="col" className="px-5 py-2.5 font-medium">Row</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">HS code</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Result</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.row} className={cn("border-b border-pw-border last:border-0", r.status === "error" && "bg-pw-coral-50/50")}>
                    <td className="px-5 py-2 text-pw-muted num">{r.row}</td>
                    <td className="px-5 py-2 font-mono text-[13px]">{r.code || "—"}</td>
                    <td className="px-5 py-2">
                      <Pill tone={STATUS[r.status as keyof typeof STATUS]?.tone ?? "retired"}>
                        {STATUS[r.status as keyof typeof STATUS]?.label ?? r.status}
                      </Pill>
                    </td>
                    <td className="px-5 py-2 text-pw-muted">
                      {r.message ?? (r.duty_rate_pct != null ? `${formatPct(r.duty_rate_pct)} duty` : "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
