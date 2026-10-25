import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { REGIME_NAME } from "@/lib/api/schemas";
import { cn } from "@/lib/cn";
import { Alert, Button, inputClass, Skeleton } from "@/components/ui/primitives";
import { adminApi, type LevySetting } from "./api";
import { formatWhen, PageHeader, Panel } from "./ui";

const REGIMES = [
  { value: "both", label: "Compare both", hint: "Show both and lead with the higher. Recommended while the 4% FOB charge is uncertain." },
  { value: "legacy", label: REGIME_NAME.legacy, hint: "1% CISS on the goods value, plus the 7% surcharge on duty." },
  { value: "fob4", label: REGIME_NAME.fob4, hint: "4% of the goods value replaces CISS. The 7% surcharge on duty still applies." },
];

export function LeviesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "levy"], queryFn: adminApi.levyConfig });
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [saved, setSaved] = useState(false);

  const settings = useMemo(() => q.data?.settings ?? [], [q.data]);
  const value = (s: LevySetting) => (s.key in draft ? draft[s.key] : String(s.value));
  const dirty = Object.keys(draft).length > 0;

  const save = useMutation({
    mutationFn: () => adminApi.saveLevyConfig(draft),
    onSuccess: (data) => {
      qc.setQueryData(["admin", "levy"], data);
      void qc.invalidateQueries({ queryKey: ["regime-config"] });
      void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      setDraft({});
      setSaved(true);
    },
  });

  const regime = settings.find((s) => s.key === "active_regime");
  const numbers = settings.filter((s) => s.key !== "active_regime");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Levies and VAT"
        description="The rates the calculator applies on top of duty. Changes apply to new estimates straight away and are logged."
      />
      {saved && !dirty && <Alert tone="success" title="Settings saved. New estimates use them now." />}

      {q.isLoading || !regime ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            save.mutate();
          }}
          className="space-y-5"
        >
          <Panel className="p-5">
            <h2 className="font-semibold text-pw-navy">Levy regime</h2>
            <div role="radiogroup" aria-label="Levy regime" className="mt-3 grid gap-2 md:grid-cols-3">
              {REGIMES.map((r) => {
                const on = value(regime) === r.value;
                return (
                  <label
                    key={r.value}
                    className={cn(
                      "flex cursor-pointer flex-col rounded-[var(--radius-input)] border p-3 text-sm",
                      on ? "border-pw-navy bg-pw-navy text-white" : "border-pw-input hover:border-pw-navy",
                    )}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <input
                        type="radio"
                        name="regime"
                        value={r.value}
                        checked={on}
                        onChange={() => setDraft((d) => ({ ...d, active_regime: r.value }))}
                        className="size-4"
                      />
                      {r.label}
                    </span>
                    <span className={cn("mt-1 text-[13px] leading-5", on ? "text-pw-on-navy" : "text-pw-muted")}>{r.hint}</span>
                  </label>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Levy and VAT rates</caption>
              <thead>
                <tr className="border-b border-pw-border text-left text-[13px] text-pw-muted">
                  <th scope="col" className="px-5 py-3 font-medium">Setting</th>
                  <th scope="col" className="w-36 px-5 py-3 font-medium">Value</th>
                  <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">Default</th>
                  <th scope="col" className="px-2 py-3"><span className="sr-only">Reset</span></th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((s) => {
                  const changed = s.override !== null || s.key in draft;
                  return (
                    <tr key={s.key} className="border-b border-pw-border last:border-0">
                      <th scope="row" className="px-5 py-3 text-left font-normal">
                        <label htmlFor={`lv-${s.key}`} className="font-medium text-pw-text">
                          {s.label}
                        </label>
                        {s.updated_at && <span className="block text-[12px] text-pw-muted">Changed {formatWhen(s.updated_at)}</span>}
                      </th>
                      <td className="px-5 py-2">
                        <input
                          id={`lv-${s.key}`}
                          inputMode="decimal"
                          className={cn(inputClass(), "h-10 text-right")}
                          value={value(s) ?? String(s.default)}
                          onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                        />
                      </td>
                      <td className="hidden px-5 py-3 text-pw-muted num sm:table-cell">{s.default}</td>
                      <td className="px-2 py-2">
                        {changed && (
                          <button
                            type="button"
                            title="Back to the default"
                            aria-label={`Reset ${s.label} to the default`}
                            onClick={() => setDraft((d) => ({ ...d, [s.key]: null }))}
                            className="flex size-10 items-center justify-center rounded-md text-pw-muted hover:bg-pw-bg hover:text-pw-navy"
                          >
                            <RotateCcw className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          {save.error && <Alert tone="error" title={save.error instanceof ApiError ? save.error.message : "The settings were not saved."} />}
          <div className="flex justify-end gap-2">
            {dirty && (
              <Button type="button" variant="secondary" onClick={() => setDraft({})}>
                Discard changes
              </Button>
            )}
            <Button type="submit" disabled={!dirty} loading={save.isPending} loadingLabel="Saving">
              Save settings
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
