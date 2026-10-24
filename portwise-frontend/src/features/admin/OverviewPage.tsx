import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { REGIME_NAME } from "@/lib/api/schemas";
import { Skeleton } from "@/components/ui/primitives";
import { adminApi } from "./api";
import { ActivityList } from "./ActivityPage";
import { PageHeader, Panel } from "./ui";
import { useSession } from "./AdminApp";

const regimeLabel = (r: string) => (r === "both" ? "Both regimes compared" : r === "legacy" ? REGIME_NAME.legacy : r === "fob4" ? REGIME_NAME.fob4 : r);

export function OverviewPage() {
  const { admin } = useSession();
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: adminApi.overview });
  const d = q.data;

  const attention: { text: string; to: string; action: string }[] = [];
  if (d) {
    if (d.fx.placeholder.length)
      attention.push({ text: `Placeholder exchange rates for ${d.fx.placeholder.join(", ")}. Users see a warning on every estimate.`, to: "/admin/fx", action: "Refresh rates" });
    if (d.fx.stale.length) attention.push({ text: `Old exchange rates for ${d.fx.stale.join(", ")}.`, to: "/admin/fx", action: "Refresh rates" });
    if (d.tariffs.missing_source) attention.push({ text: `${d.tariffs.missing_source} tariff lines in force have no source reference.`, to: "/admin/tariffs", action: "Review tariffs" });
    if (d.tariffs.in_force < 10) attention.push({ text: `Only ${d.tariffs.in_force} products are covered.`, to: "/admin/import", action: "Load the 2026 catalog" });
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome${admin ? `, ${admin.name.split(" ")[0]}` : ""}`} description="What users can calculate right now, and what needs your attention." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Products covered", value: d?.tariffs.in_force, sub: d ? `${d.tariffs.categories} categories` : "" },
          { label: "Tariff versions on file", value: d?.tariffs.versions, sub: d?.tariffs.scheduled ? `${d.tariffs.scheduled} scheduled` : "Including history" },
          { label: "Exchange rates", value: d?.fx.currencies, sub: d ? (d.fx.placeholder.length || d.fx.stale.length ? "Need attention" : "All current") : "" },
          { label: "Levy regime", value: d ? regimeLabel(d.levy.active_regime) : undefined, sub: d?.levy.config_source === "database" ? "Set by an admin" : "Built-in default" },
        ].map((s) => (
          <Panel key={s.label} className="px-4 py-4">
            <p className="text-[13px] font-medium text-pw-muted">{s.label}</p>
            {s.value === undefined ? (
              <Skeleton className="mt-2 h-7 w-20" />
            ) : (
              <p className="mt-1 font-display text-2xl font-semibold text-pw-navy num">{s.value}</p>
            )}
            <p className="mt-0.5 text-[13px] text-pw-muted">{s.sub}</p>
          </Panel>
        ))}
      </div>

      <Panel>
        <h2 className="border-b border-pw-border px-5 py-3.5 text-[15px] font-semibold text-pw-navy">Needs attention</h2>
        {!d ? (
          <div className="p-5">
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : attention.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-pw-green">
            <CircleCheck className="size-4" aria-hidden="true" /> Nothing needs attention. Rates and tariffs are in order.
          </p>
        ) : (
          <ul className="divide-y divide-pw-border">
            {attention.map((a) => (
              <li key={a.text} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-start gap-2 text-sm text-pw-text">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-pw-amber-edge" aria-hidden="true" />
                  {a.text}
                </span>
                <Link to={a.to} className="shrink-0 text-sm font-semibold text-pw-blue hover:underline">
                  {a.action}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <div className="flex items-center justify-between border-b border-pw-border px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-pw-navy">Recent changes</h2>
          <Link to="/admin/activity" className="text-sm font-semibold text-pw-blue hover:underline">
            All activity
          </Link>
        </div>
        {d ? <ActivityList items={d.recent_changes} /> : <div className="p-5"><Skeleton className="h-16 w-full" /></div>}
      </Panel>
    </div>
  );
}
