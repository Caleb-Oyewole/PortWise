import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Pencil, Plus, Search, Archive } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatPct } from "@/lib/format";
import { Alert, Button, Field, inputClass, Select, Skeleton, TextInput } from "@/components/ui/primitives";
import { adminApi, type Tariff, type TariffInput } from "./api";
import { Dialog, formatDay, PageHeader, Panel, Pill } from "./ui";

type Mode = { kind: "add" } | { kind: "edit"; row: Tariff } | { kind: "rate"; row: Tariff } | { kind: "retire"; row: Tariff };

const STATUS_LABEL = { in_force: "In force", scheduled: "Scheduled", retired: "Retired" } as const;

export function TariffsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const deferred = useDeferredValue(q);
  const list = useQuery({ queryKey: ["admin", "tariffs", deferred, status], queryFn: () => adminApi.tariffs(deferred, status) });
  const [mode, setMode] = useState<Mode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const done = (msg: string) => {
    setMode(null);
    setNotice(msg);
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["hs-codes"] }); // the calculator's product list
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tariffs"
        description="Every HS code the calculator knows, with its duty rate and source. A new rate from a date keeps the old one in history."
        actions={
          <Button onClick={() => setMode({ kind: "add" })}>
            <Plus className="size-4" aria-hidden="true" /> Add HS code
          </Button>
        }
      />
      {notice && (
        <Alert tone="success" title={notice}>
          The calculator picks up the change on its next refresh, within about a minute.
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-pw-muted" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search tariffs"
            placeholder="Search by product, category or HS code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={cn(inputClass(), "pl-9")}
          />
        </div>
        <div className="sm:w-48">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="in_force">In force</option>
            <option value="scheduled">Scheduled</option>
            <option value="retired">Retired</option>
          </Select>
        </div>
      </div>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">Tariff lines</caption>
          <thead>
            <tr className="border-b border-pw-border text-left text-[13px] text-pw-muted">
              <th scope="col" className="px-4 py-3 font-medium">HS code</th>
              <th scope="col" className="px-4 py-3 font-medium">Product</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Duty</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">From</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading &&
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-pw-border">
                  <td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
            {list.data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-pw-muted">
                  No tariff lines match. Try another word, or add the HS code.
                </td>
              </tr>
            )}
            {list.data?.items.map((t) => (
              <tr key={t.id} className={cn("border-b border-pw-border align-top last:border-0", t.status === "retired" && "text-pw-muted")}>
                <td className="px-4 py-3 font-mono text-[13px]">{t.code}</td>
                <td className="px-4 py-3">
                  <span className="block font-medium text-pw-text">{t.description}</span>
                  <span className="block text-[13px] text-pw-muted">
                    {t.category ?? "No category"}
                    {t.source_ref ? ` · ${t.source_ref}` : ""}
                  </span>
                  {t.prohibited && <Pill tone="error">On the prohibition list</Pill>}
                </td>
                <td className="px-4 py-3 text-right num whitespace-nowrap">
                  {formatPct(t.duty_rate_pct)}
                  {t.iat_rate_pct > 0 && <span className="block text-[12px] text-pw-muted">+{formatPct(t.iat_rate_pct)} IAT</span>}
                </td>
                <td className="px-4 py-3">
                  <Pill tone={t.status}>{STATUS_LABEL[t.status]}</Pill>
                </td>
                <td className="px-4 py-3 text-[13px] whitespace-nowrap">
                  {formatDay(t.effective_from)}
                  {t.effective_to && <span className="block text-pw-muted">to {formatDay(t.effective_to)}</span>}
                </td>
                <td className="px-2 py-2">
                  {t.status !== "retired" && (
                    <div className="flex justify-end gap-1">
                      <IconButton label={`Edit HS ${t.code}`} onClick={() => setMode({ kind: "edit", row: t })} icon={Pencil} />
                      <IconButton label={`New rate for HS ${t.code}`} onClick={() => setMode({ kind: "rate", row: t })} icon={CalendarPlus} />
                      <IconButton label={`Retire HS ${t.code}`} onClick={() => setMode({ kind: "retire", row: t })} icon={Archive} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Dialog
        open={mode?.kind === "add" || mode?.kind === "rate" || mode?.kind === "edit"}
        onClose={() => setMode(null)}
        wide
        title={mode?.kind === "add" ? "Add an HS code" : mode?.kind === "rate" ? `New rate for HS ${mode.row.code}` : mode?.kind === "edit" ? `Edit HS ${mode.row.code}` : ""}
        description={
          mode?.kind === "rate"
            ? "The current rate ends when this one starts, and stays in history."
            : mode?.kind === "edit"
              ? "Fix a mistake in place. To change a rate from a date, use New rate instead."
              : "It appears in the calculator's product list as soon as it is in force."
        }
      >
        {mode && mode.kind !== "retire" && (
          <TariffForm
            key={mode.kind + ("row" in mode ? mode.row.id : "")}
            mode={mode}
            categories={list.data?.categories ?? []}
            onDone={done}
          />
        )}
      </Dialog>

      <Dialog open={mode?.kind === "retire"} onClose={() => setMode(null)} title={mode?.kind === "retire" ? `Retire HS ${mode.row.code}?` : ""}>
        {mode?.kind === "retire" && <RetireConfirm row={mode.row} onDone={done} onCancel={() => setMode(null)} />}
      </Dialog>
    </div>
  );
}

function IconButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof Pencil }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-md text-pw-muted hover:bg-pw-bg hover:text-pw-navy"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

function TariffForm({
  mode,
  categories,
  onDone,
}: {
  mode: Exclude<Mode, { kind: "retire" }>;
  categories: string[];
  onDone: (msg: string) => void;
}) {
  const row = "row" in mode ? mode.row : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({
    code: row?.code ?? "",
    description: row?.description ?? "",
    category: row?.category ?? "",
    keywords: row?.keywords ?? "",
    duty: row ? String(row.duty_rate_pct) : "",
    iat: row ? String(row.iat_rate_pct) : "0",
    prohibited: row?.prohibited ?? false,
    source: mode.kind === "rate" ? "" : (row?.source_ref ?? ""),
    from: today,
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      const duty = Number(v.duty);
      const iat = Number(v.iat || 0);
      if (!v.code.trim() || !v.description.trim()) throw new Error("Enter the HS code and a product description.");
      if (!Number.isFinite(duty) || duty < 0 || duty > 100) throw new Error("Duty must be a percentage from 0 to 100.");
      if (!Number.isFinite(iat) || iat < 0 || iat > 100) throw new Error("IAT must be a percentage from 0 to 100.");
      const body: TariffInput = {
        code: v.code.trim(),
        description: v.description.trim(),
        category: v.category.trim() || null,
        keywords: v.keywords.trim() || null,
        duty_rate_pct: duty,
        iat_rate_pct: iat,
        prohibited: v.prohibited,
        source_ref: v.source.trim() || null,
      };
      if (mode.kind === "edit") {
        const { code: _code, ...patch } = body;
        void _code;
        return adminApi.editTariff(mode.row.id, patch);
      }
      // A start date of today means "now", so the rate applies immediately.
      const start = v.from && v.from !== today ? `${v.from}T00:00:00` : null;
      return adminApi.addTariff({ ...body, effective_from: start });
    },
    onSuccess: (t) =>
      onDone(
        mode.kind === "edit"
          ? `Saved HS ${t.code}.`
          : mode.kind === "rate"
            ? `New rate for HS ${t.code}: ${formatPct(t.duty_rate_pct)} from ${formatDay(t.effective_from)}.`
            : `Added HS ${t.code}, ${t.description}.`,
      ),
  });
  const error = save.error instanceof ApiError || save.error instanceof Error ? save.error.message : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="grid grid-cols-6 gap-x-3 gap-y-4"
    >
      <Field id="t-code" className="col-span-6 sm:col-span-2" label="HS code">
        <TextInput id="t-code" value={v.code} onChange={set("code")} placeholder="8517.13" disabled={mode.kind !== "add"} required />
      </Field>
      <Field id="t-desc" className="col-span-6 sm:col-span-4" label="Product description">
        <TextInput id="t-desc" value={v.description} onChange={set("description")} placeholder="Smartphones" required />
      </Field>
      <Field id="t-cat" className="col-span-6 sm:col-span-3" label="Category" hint="Groups the product in the calculator's list.">
        <TextInput id="t-cat" list="t-cats" value={v.category} onChange={set("category")} placeholder="Phones and electronics" />
        <datalist id="t-cats">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field id="t-kw" className="col-span-6 sm:col-span-3" label="Search words" optional hint="Words importers use, e.g. iphone android.">
        <TextInput id="t-kw" value={v.keywords} onChange={set("keywords")} />
      </Field>
      <Field id="t-duty" className="col-span-3 sm:col-span-2" label="Import duty (%)">
        <TextInput id="t-duty" inputMode="decimal" value={v.duty} onChange={set("duty")} required />
      </Field>
      <Field id="t-iat" className="col-span-3 sm:col-span-2" label="IAT (%)">
        <TextInput id="t-iat" inputMode="decimal" value={v.iat} onChange={set("iat")} />
      </Field>
      {mode.kind !== "edit" && (
        <Field id="t-from" className="col-span-6 sm:col-span-2" label="In force from">
          <TextInput id="t-from" type="date" value={v.from} onChange={set("from")} />
        </Field>
      )}
      <Field id="t-src" className="col-span-6" label="Source reference" hint="Where the rate comes from, e.g. ECOWAS CET 2022-27, 8517130000.">
        <TextInput id="t-src" value={v.source} onChange={set("source")} />
      </Field>
      <label className="col-span-6 flex min-h-11 items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={v.prohibited}
          onChange={(e) => setV((s) => ({ ...s, prohibited: e.target.checked }))}
          className="size-4 accent-[var(--color-pw-coral)]"
        />
        On the import prohibition list (allowed only from ECOWAS origins)
      </label>
      {error && <Alert tone="error" title={error} className="col-span-6" />}
      <div className="col-span-6 flex justify-end gap-2">
        <Button type="submit" loading={save.isPending} loadingLabel="Saving">
          {mode.kind === "add" ? "Add HS code" : mode.kind === "rate" ? "Add new rate" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function RetireConfirm({ row, onDone, onCancel }: { row: Tariff; onDone: (m: string) => void; onCancel: () => void }) {
  const retire = useMutation({ mutationFn: () => adminApi.retireTariff(row.id), onSuccess: () => onDone(`Retired HS ${row.code}.`) });
  return (
    <div>
      <p className="text-sm leading-6 text-pw-text">
        {row.description} stops being offered in the calculator now. The row stays in history and the change is logged.
      </p>
      {retire.error && <Alert tone="error" title={(retire.error as Error).message} className="mt-3" />}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Keep it</Button>
        <Button onClick={() => retire.mutate()} loading={retire.isPending} className="bg-pw-coral hover:bg-[#a8302a]">
          Retire HS {row.code}
        </Button>
      </div>
    </div>
  );
}
