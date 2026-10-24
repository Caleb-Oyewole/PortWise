import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, FileUp, Percent, Tags } from "lucide-react";
import { Button, Select, Skeleton } from "@/components/ui/primitives";
import { adminApi, type AuditEntry } from "./api";
import { formatWhen, PageHeader, Panel } from "./ui";

const ICON = { hs_codes: Tags, levy_config: Percent, fx_rates: ArrowLeftRight } as const;
const PAGE = 30;

export function ActivityList({ items }: { items: AuditEntry[] }) {
  if (items.length === 0) return <p className="px-5 py-4 text-sm text-pw-muted">No changes yet. Edits to tariffs, levies and rates appear here.</p>;
  return (
    <ul className="divide-y divide-pw-border">
      {items.map((e) => {
        const Icon = e.action === "import" ? FileUp : (ICON[e.entity as keyof typeof ICON] ?? Tags);
        return (
          <li key={e.id} className="flex gap-3 px-5 py-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-pw-bg text-pw-navy">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-pw-text">{e.summary ?? `${e.action} ${e.entity}`}</p>
              <p className="text-[13px] text-pw-muted">
                {e.admin_email ?? "System"} · {formatWhen(e.created_at)}
              </p>
              {(e.before != null || e.after != null) && (
                <details className="mt-1 text-[12px]">
                  <summary className="cursor-pointer text-pw-blue hover:underline">Before and after</summary>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {[
                      ["Before", e.before],
                      ["After", e.after],
                    ].map(([label, data]) => (
                      <div key={label as string}>
                        <p className="font-semibold text-pw-muted">{label as string}</p>
                        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-pw-bg p-2 text-[11px] leading-4 text-pw-text">
                          {data == null ? "Nothing" : JSON.stringify(data, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityPage() {
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(0);
  const q = useQuery({ queryKey: ["admin", "audit", entity, page], queryFn: () => adminApi.audit(entity, page * PAGE, PAGE) });
  const total = q.data?.total ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity"
        description="Every change to tariffs, levies and exchange rates: who made it, when, and what it was before."
        actions={
          <div className="w-52">
            <Select
              aria-label="Show changes to"
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Everything</option>
              <option value="hs_codes">Tariffs</option>
              <option value="levy_config">Levies and VAT</option>
              <option value="fx_rates">Exchange rates</option>
            </Select>
          </div>
        }
      />
      <Panel>{q.isLoading ? <div className="p-5"><Skeleton className="h-40 w-full" /></div> : <ActivityList items={q.data?.items ?? []} />}</Panel>
      {total > PAGE && (
        <div className="flex items-center justify-between text-sm text-pw-muted">
          <span>
            {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Newer
            </Button>
            <Button variant="secondary" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
              Older
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
