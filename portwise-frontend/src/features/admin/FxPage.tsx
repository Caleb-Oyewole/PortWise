import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { formatNgn } from "@/lib/format";
import { Alert, Button, Field, Skeleton, TextInput } from "@/components/ui/primitives";
import { adminApi, type AdminFx } from "./api";
import { Dialog, PageHeader, Panel, Pill } from "./ui";

type Rate = AdminFx["rates"][number];

export function FxPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "fx"], queryFn: adminApi.fx });
  const [editing, setEditing] = useState<Rate | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (data: AdminFx, msg: string) => {
    qc.setQueryData(["admin", "fx"], data);
    void qc.invalidateQueries({ queryKey: ["fx"] });
    void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    setNotice(msg);
    setEditing(null);
  };

  const refresh = useMutation({
    mutationFn: () => adminApi.refreshFx(false),
    onSuccess: (d) => apply(d, d.updated?.length ? `Updated ${d.updated.join(", ")} from the provider.` : "Rates are already current."),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Exchange rates"
        description={`Naira rates used to convert invoices. They refresh automatically every few hours; a rate older than ${q.data?.stale_after_business_days ?? 3} business days is flagged to users.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing("new")}>
              Add a currency
            </Button>
            <Button onClick={() => refresh.mutate()} loading={refresh.isPending} loadingLabel="Refreshing">
              <RefreshCw className="size-4" aria-hidden="true" /> Refresh from provider
            </Button>
          </>
        }
      />
      {notice && <Alert tone="success" title={notice} />}
      {refresh.error && <Alert tone="error" title={refresh.error instanceof ApiError ? refresh.error.message : "Refresh failed."} />}

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">Exchange rates</caption>
          <thead>
            <tr className="border-b border-pw-border text-left text-[13px] text-pw-muted">
              <th scope="col" className="px-5 py-3 font-medium">Currency</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">1 unit in naira</th>
              <th scope="col" className="px-5 py-3 font-medium">Source</th>
              <th scope="col" className="px-5 py-3 font-medium">Status</th>
              <th scope="col" className="px-2 py-3"><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={5} className="px-5 py-4"><Skeleton className="h-16 w-full" /></td>
              </tr>
            )}
            {q.data?.rates.map((r) => (
              <tr key={r.currency} className="border-b border-pw-border last:border-0">
                <th scope="row" className="px-5 py-3 text-left font-semibold">{r.currency}</th>
                <td className="px-5 py-3 text-right font-medium num">{formatNgn(r.rate)}</td>
                <td className="px-5 py-3 text-pw-muted">
                  {r.source}
                  <span className="block text-[12px]">as of {r.as_of_date}</span>
                </td>
                <td className="px-5 py-3">
                  {r.placeholder ? (
                    <Pill tone="error">Placeholder</Pill>
                  ) : r.stale ? (
                    <Pill tone="warn">{r.age_business_days} business days old</Pill>
                  ) : (
                    <Pill tone="ok">{r.is_manual ? "Set by hand" : "Current"}</Pill>
                  )}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
                    aria-label={`Set the ${r.currency} rate`}
                    title="Set by hand"
                    className="flex size-10 items-center justify-center rounded-md text-pw-muted hover:bg-pw-bg hover:text-pw-navy"
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add a currency" : editing ? `Set the ${editing.currency} rate` : ""}
        description="A rate set by hand is kept when the automatic refresh runs, until you refresh from the provider here."
      >
        {editing !== null && <RateForm rate={editing === "new" ? null : editing} onSaved={apply} />}
      </Dialog>
    </div>
  );
}

function RateForm({ rate, onSaved }: { rate: Rate | null; onSaved: (d: AdminFx, msg: string) => void }) {
  const [currency, setCurrency] = useState(rate?.currency ?? "");
  const [value, setValue] = useState(rate ? String(rate.rate) : "");
  const [source, setSource] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const n = Number(value.replace(/,/g, ""));
      if (!/^[A-Za-z]{3}$/.test(currency.trim())) throw new Error("Use a three-letter currency code, e.g. USD.");
      if (!Number.isFinite(n) || n <= 0) throw new Error("Enter the naira value of one unit, e.g. 1450.");
      return adminApi.setFx(currency.trim().toUpperCase(), n, source.trim() || undefined);
    },
    onSuccess: (d) => onSaved(d, `Saved 1 ${currency.trim().toUpperCase()} = ${formatNgn(Number(value.replace(/,/g, "")))}.`),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="grid grid-cols-2 gap-x-3 gap-y-4"
    >
      <Field id="fx-ccy" label="Currency">
        <TextInput id="fx-ccy" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} disabled={!!rate} placeholder="USD" />
      </Field>
      <Field id="fx-rate" label="1 unit in naira">
        <TextInput id="fx-rate" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required />
      </Field>
      <Field id="fx-src" className="col-span-2" label="Source" optional hint="e.g. CBN NFEM closing rate, 24 Oct">
        <TextInput id="fx-src" value={source} onChange={(e) => setSource(e.target.value)} />
      </Field>
      {save.error && <Alert tone="error" title={(save.error as Error).message} className="col-span-2" />}
      <div className="col-span-2 flex justify-end">
        <Button type="submit" loading={save.isPending} loadingLabel="Saving">
          Save rate
        </Button>
      </div>
    </form>
  );
}
