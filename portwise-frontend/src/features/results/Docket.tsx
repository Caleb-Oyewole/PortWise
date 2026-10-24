import { forwardRef, useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, Copy, Info, Printer, TriangleAlert } from "lucide-react";
import { REGIME_NAME, type CalcRequest, type CalcResponse, type Regime, type Scenario } from "@/lib/api/schemas";
import { cn } from "@/lib/cn";
import { formatDate, formatInt, formatNgn, formatPct, splitNgn } from "@/lib/format";
import { shareUrl } from "@/lib/url-state";
import { Skeleton } from "@/components/ui/primitives";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { ContainerBar, PART_COLORS, type Part } from "./ContainerBar";
import { chargeBasis, chargeColor, chargeLabel, chargePart, levyNames, vatBasis } from "./labels";
import { ShowMath } from "./ShowMath";
import { copyText, summaryText, whatsappHref } from "./share";
import { useCountUp } from "./useCountUp";

export type DocketState =
  | { kind: "idle"; error?: { title: string; body?: string } }
  | { kind: "loading"; slow: boolean }
  | { kind: "result"; res: CalcResponse; req: CalcRequest; updating: boolean; slow: boolean };

interface Props {
  state: DocketState;
  revealKey: number;
  onCopied: (msg: string) => void;
}

export const Docket = forwardRef<HTMLHeadingElement, Props>(function Docket({ state, revealKey, onCopied }, headingRef) {
  return (
    <section
      data-docket
      aria-labelledby="docket-title"
      className="relative overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)]"
    >
      <div className="print-only hidden border-b border-pw-border px-6 py-4">
        <p className="font-display text-lg font-semibold text-pw-navy">PortWise landed-cost estimate</p>
        <p className="text-sm text-pw-muted">Prepared {formatDate(new Date())}</p>
      </div>
      {state.kind === "result" ? (
        <ResultView key={revealKey} state={state} revealKey={revealKey} onCopied={onCopied} headingRef={headingRef} />
      ) : (
        <EmptyView
          key={state.kind}
          loading={state.kind === "loading"}
          slow={state.kind === "loading" && state.slow}
          error={state.kind === "idle" ? state.error : undefined}
          headingRef={headingRef}
        />
      )}
    </section>
  );
});

// ---------- Before the first result: the docket explains itself ----------

function EmptyView({
  loading,
  slow,
  error,
  headingRef,
}: {
  loading: boolean;
  slow: boolean;
  error?: { title: string; body?: string };
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setShowSkeleton(true), 150); // avoid a flash on fast responses
    return () => clearTimeout(t);
  }, [loading]);
  const sk = loading && showSkeleton;

  const rows: { color: string; label: ReactNode; basis: string }[] = [
    { color: PART_COLORS.cif, label: <GlossaryTerm term="cif">Customs value (CIF)</GlossaryTerm>, basis: "Goods plus freight and insurance, in naira" },
    { color: PART_COLORS.duty, label: <GlossaryTerm term="duty">Import duty</GlossaryTerm>, basis: "A rate set by the product's HS code" },
    { color: PART_COLORS.levies, label: <GlossaryTerm term="levies">Levies and charges</GlossaryTerm>, basis: "Surcharge, CISS or the FOB charge, and ETLS" },
    { color: PART_COLORS.vat, label: <GlossaryTerm term="vat">VAT</GlossaryTerm>, basis: "On the customs value, duty and levies" },
  ];

  return (
    <div className="p-5 sm:p-7" aria-busy={loading || undefined}>
      <h2 id="docket-title" ref={headingRef} tabIndex={-1} className="text-[15px] font-semibold text-pw-muted outline-none">
        {loading ? "Calculating your landed cost…" : "Estimated landed cost"}
      </h2>
      <div className="mt-1 flex h-12 items-center sm:h-[52px]" role="status">
        {sk ? (
          <Skeleton className="h-10 w-64" />
        ) : (
          <p className="flex items-end gap-2 text-total-sm font-bold text-[#b9c6d8] sm:text-total" aria-label="No total yet">
            <span aria-hidden="true">₦</span>
            <span aria-hidden="true" className="mb-2 inline-block h-0 w-48 border-b-[3px] border-dashed border-[#cfd8e4] sm:w-64" />
          </p>
        )}
      </div>
      <p className={cn("mt-1 min-h-6 text-[15px]", error ? "text-[#a3271f]" : "text-pw-muted")}>
        {error
          ? `${error.title} ${error.body ?? ""}`
          : slow
            ? "This is taking longer than usual. You can wait or try again."
            : loading
              ? "Converting at today's rate and applying duty, levies and VAT."
              : "Choose a product and enter its price. The total appears here, broken down line by line."}
      </p>

      <div className="mt-6">{sk ? <Skeleton className="h-14 w-full sm:h-16" /> : <ContainerBar parts={[]} revealKey={0} empty />}</div>

      <table className="mt-6 w-full border-collapse text-[15px]">
        <caption className="sr-only">What your landed cost will include</caption>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-pw-border">
              <th scope="row" className="py-3 pr-4 text-left font-normal">
                <span className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-[7px] size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span>
                    <span className="block font-medium text-pw-text">{r.label}</span>
                    <span className="block text-[13px] text-pw-muted max-sm:-mr-10">{r.basis}</span>
                  </span>
                </span>
              </th>
              <td className="py-3 text-right align-top">
                {sk ? <Skeleton className="ml-auto mt-1 h-4 w-24" /> : <span className="text-pw-muted/70 num">—</span>}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="pt-4 text-left font-semibold text-pw-text">
              Total landed cost
            </th>
            <td className="pt-4 text-right">
              {sk ? <Skeleton className="ml-auto h-5 w-32" /> : <span className="text-pw-muted/70 num">—</span>}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------- The filled docket ----------

function ResultView({
  state,
  revealKey,
  onCopied,
  headingRef,
}: {
  state: Extract<DocketState, { kind: "result" }>;
  revealKey: number;
  onCopied: (m: string) => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const { res, req, updating, slow } = state;
  const [picked, setRegime] = useState<Regime>(res.primary_regime);
  // A newer response may not contain the regime picked earlier; fall back to its headline regime.
  const scenario: Scenario =
    res.scenarios.find((s) => s.regime === picked) ?? res.scenarios.find((s) => s.regime === res.primary_regime) ?? res.scenarios[0];
  const s = scenario.shipment_summary;
  const lines = scenario.line_items;
  const single = lines.length === 1 ? lines[0] : undefined;
  const animated = useCountUp(s.grand_total_landed_cost_ngn);
  const { whole, kobo } = splitNgn(animated);
  const mathId = useId();
  const [mathOpen, setMathOpen] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const parts = s.total_cif_ngn + s.total_duty_ngn + s.total_levies_ngn + s.total_vat_ngn;
    if (Math.abs(parts - s.grand_total_landed_cost_ngn) > 0.05)
      console.error(`[PortWise] Breakdown does not add up: ${parts} vs ${s.grand_total_landed_cost_ngn}`, res);
  }, [res, s]);

  const parts: Part[] = [
    { key: "cif", label: "Customs value", value: s.total_cif_ngn, color: PART_COLORS.cif },
    { key: "duty", label: "Duty", value: s.total_duty_ngn, color: PART_COLORS.duty },
    { key: "levies", label: "Levies", value: s.total_levies_ngn, color: PART_COLORS.levies },
    { key: "vat", label: "VAT", value: s.total_vat_ngn, color: PART_COLORS.vat },
  ];

  const units = lines.reduce((n, l) => n + (l.quantity ?? 0), 0);
  const subtitle = single
    ? `${single.quantity ? `${formatInt(single.quantity)} × ` : ""}${single.description ?? "Goods"}, HS ${single.hs_code}`
    : `${lines.length} products${units ? `, ${formatInt(units)} units` : ""}`;

  const rows: { key: string; color: string; label: ReactNode; basis: string; amount: number }[] = single
    ? [
        ...single.breakdown.charges.map((c) => ({
          key: c.name,
          color: chargeColor(c),
          label: (c.name === "CIF Value" ? (
            <GlossaryTerm term="cif">Customs value (CIF)</GlossaryTerm>
          ) : c.name === "Import Duty" ? (
            <GlossaryTerm term="duty">Import duty</GlossaryTerm>
          ) : (
            chargeLabel(c)
          )) as ReactNode,
          basis: chargeBasis(c, single),
          amount: c.amount_ngn,
          part: chargePart(c),
        })),
        {
          key: "vat",
          color: PART_COLORS.vat,
          label: <GlossaryTerm term="vat">VAT</GlossaryTerm>,
          basis: vatBasis(single.breakdown),
          amount: single.breakdown.vat_amount_ngn,
        },
      ]
    : [
        {
          key: "cif",
          color: PART_COLORS.cif,
          label: <GlossaryTerm term="cif">Customs value (CIF)</GlossaryTerm>,
          basis: `Goods ${formatNgn(s.total_fob_ngn)} plus freight and insurance ${formatNgn(s.total_freight_insurance_ngn)}`,
          amount: s.total_cif_ngn,
        },
        { key: "duty", color: PART_COLORS.duty, label: <GlossaryTerm term="duty">Import duty</GlossaryTerm>, basis: "At each product's own rate", amount: s.total_duty_ngn },
        {
          key: "levies",
          color: PART_COLORS.levies,
          label: <GlossaryTerm term="levies">Levies and charges</GlossaryTerm>,
          basis: levyNames(lines[0].breakdown).join(", "),
          amount: s.total_levies_ngn,
        },
        { key: "vat", color: PART_COLORS.vat, label: <GlossaryTerm term="vat">VAT</GlossaryTerm>, basis: vatBasis(lines[0].breakdown), amount: s.total_vat_ngn },
      ];

  const url = shareUrl(req);
  const summary = summaryText(res, scenario, url);
  const compare = res.scenarios.length > 1;

  return (
    <div className={cn("transition-opacity duration-200", updating && "opacity-70")} aria-busy={updating || undefined}>
      <div className="pw-rise p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <h2 id="docket-title" ref={headingRef} tabIndex={-1} className="text-[15px] font-semibold text-pw-muted outline-none">
            Your estimated landed cost
          </h2>
          {updating && (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-pw-muted" aria-hidden="true">
              <span className="pw-dot" /> Updating
            </span>
          )}
        </div>

        <div role="status" aria-live="polite" className="mt-1">
          <p aria-hidden="true" className="text-total-sm font-bold tracking-[-0.025em] text-pw-navy sm:text-total num">
            {whole}
            <span className="text-[0.55em] font-semibold tracking-normal text-pw-muted">{kobo}</span>
          </p>
          <p className="sr-only">
            Estimated landed cost {formatNgn(s.grand_total_landed_cost_ngn)}, with the {REGIME_NAME[scenario.regime]}
          </p>
        </div>
        <p className="mt-1 text-[15px] text-pw-muted">{subtitle}</p>
        {slow && <p className="mt-1 text-[13px] text-pw-amber-text">This is taking longer than usual. You can wait or try again.</p>}

        <p className="mt-4 max-w-[60ch] text-[15px] leading-6 text-pw-text">
          {single?.per_unit_landed_cost_ngn != null && (single.quantity ?? 0) > 1 && (
            <>
              That's <strong className="font-semibold num">{formatNgn(single.per_unit_landed_cost_ngn)}</strong> per unit landed.{" "}
            </>
          )}
          {s.charges_pct_of_fob != null && (
            <>
              Duty, levies, VAT and freight add <strong className="font-semibold num">{formatPct(s.charges_pct_of_fob)}</strong> on top of
              the goods value.
            </>
          )}
        </p>

        {compare && (
          <RegimeSwitch res={res} selected={scenario.regime} onSelect={setRegime} />
        )}

        <div className="mt-6">
          <ContainerBar parts={parts} revealKey={revealKey} />
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:flex sm:flex-wrap sm:gap-x-5" aria-label="Legend">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2 text-pw-muted">
                <span
                  aria-hidden="true"
                  className={cn("size-2.5 rounded-[3px]", p.key === "duty" && "ring-1 ring-pw-amber-edge")}
                  style={{ backgroundColor: p.color }}
                />
                <span>
                  {p.label}{" "}
                  <span className="font-medium text-pw-text num">
                    {s.grand_total_landed_cost_ngn > 0 ? ((p.value / s.grand_total_landed_cost_ngn) * 100).toFixed(1) : "0"}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="no-print mt-6 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <ActionButton
            onClick={async () => {
              const ok = await copyText(summary);
              onCopied(ok ? "Summary copied" : "Copy failed. Select the text and copy it manually.");
            }}
          >
            <Copy className="size-4" aria-hidden="true" />
            <span>
              Copy<span className="hidden sm:inline"> summary</span>
            </span>
          </ActionButton>
          <a
            href={whatsappHref(summary)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-pw-input bg-white px-2 text-sm font-semibold text-pw-navy hover:border-pw-navy hover:bg-pw-bg sm:px-3.5"
          >
            <WhatsAppIcon /> <span className="sm:hidden">WhatsApp</span>
            <span className="hidden sm:inline">Share on WhatsApp</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <ActionButton onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" />
            <span>
              Print<span className="hidden sm:inline"> or save PDF</span>
            </span>
          </ActionButton>
        </div>

        {res.warnings.length > 0 && (
          <div className="mt-6 rounded-[10px] border border-pw-amber-edge/30 bg-pw-amber-50 px-4 py-3 text-sm text-pw-amber-text" role="note">
            <p className="flex items-center gap-2 font-semibold">
              <TriangleAlert className="size-4" aria-hidden="true" />
              {res.warnings.length === 1 ? "Check this before you rely on the figure" : "Check these before you rely on the figure"}
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-6 leading-5">
              {res.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <table className="mt-7 w-full border-collapse text-sm sm:text-[15px]">
          <caption className="sr-only">Landed cost breakdown with the {REGIME_NAME[scenario.regime]}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Charge</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${revealKey}-${r.key}`} className="pw-row border-b border-pw-border" style={{ animationDelay: `${240 + i * 60}ms` }}>
                <th scope="row" className="py-3 pr-4 text-left font-normal">
                  <span className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={cn("mt-[7px] size-2.5 shrink-0 rounded-full", r.color === PART_COLORS.duty && "ring-1 ring-pw-amber-edge")}
                      style={{ backgroundColor: r.color }}
                    />
                    <span>
                      <span className="block font-medium text-pw-text">{r.label}</span>
                      <span className="block text-[13px] text-pw-muted num max-sm:-mr-28">{r.basis}</span>
                    </span>
                  </span>
                </th>
                <td className="py-3 text-right align-top font-semibold text-pw-text num whitespace-nowrap">{formatNgn(r.amount)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="border-t-2 border-pw-navy pt-4 text-left text-base font-semibold text-pw-green">
                Total landed cost
              </th>
              <td className="border-t-2 border-pw-navy pt-4 text-right text-lg font-bold text-pw-green num whitespace-nowrap">
                {formatNgn(s.grand_total_landed_cost_ngn)}
              </td>
            </tr>
          </tbody>
        </table>

        {!single && (
          <div className="mt-7">
            <h3 className="text-[15px] font-semibold text-pw-navy">By product</h3>
            <table className="mt-2 w-full border-collapse text-sm">
              <caption className="sr-only">Landed cost by product</caption>
              <thead>
                <tr className="text-left text-[13px] text-pw-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Product</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Per unit</th>
                  <th scope="col" className="py-2 text-right font-medium">Landed cost</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.item_id} className="border-t border-pw-border align-top">
                    <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                      <span className="block font-medium text-pw-text">
                        {l.quantity ? `${formatInt(l.quantity)} × ` : ""}
                        {l.description ?? "Goods"}
                      </span>
                      <span className="block text-[13px] text-pw-muted num">
                        HS {l.hs_code}, {formatPct(l.duty_rate_pct ?? 0)} duty
                      </span>
                    </th>
                    <td className="py-2.5 pr-3 text-right text-pw-muted num whitespace-nowrap">
                      {l.per_unit_landed_cost_ngn != null ? formatNgn(l.per_unit_landed_cost_ngn) : "—"}
                    </td>
                    <td className="py-2.5 text-right font-semibold num whitespace-nowrap">{formatNgn(l.breakdown.total_landed_cost_ngn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {res.sensitivity_analysis.length > 1 && <Sensitivity res={res} />}

        <div className="mt-6 rounded-[10px] bg-pw-bg px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-[13px] text-pw-muted">
              {res.fx.filter((f) => f.currency !== "NGN").length === 0 ? (
                <p>All prices were in naira, so no exchange rate was needed.</p>
              ) : (
                res.fx
                  .filter((f) => f.currency !== "NGN")
                  .map((f) => (
                    <p key={f.currency} className={cn("flex items-center gap-1.5", f.stale && "text-pw-amber-text")}>
                      {f.stale && <TriangleAlert className="size-3.5" aria-hidden="true" />}
                      <span>
                        <GlossaryTerm term="fx">Rate used</GlossaryTerm>:{" "}
                        <span className="font-medium text-pw-text num">
                          1 {f.currency} = {formatNgn(f.rate)}
                        </span>
                        {f.as_of_date ? `, ${f.as_of_date}` : ""}
                        {f.source ? ` (${f.source})` : ""}
                      </span>
                    </p>
                  ))
              )}
            </div>
            <button
              type="button"
              aria-expanded={mathOpen}
              aria-controls={mathId}
              onClick={() => setMathOpen((o) => !o)}
              className="no-print inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-md text-sm font-semibold text-pw-blue hover:text-pw-blue-700 sm:self-auto"
            >
              {mathOpen ? "Hide the math" : "Show the math"}
              <ChevronDown className={cn("size-4 transition-transform duration-200", mathOpen && "rotate-180")} aria-hidden="true" />
            </button>
          </div>
          <div id={mathId} hidden={!mathOpen} className="mt-4 border-t border-pw-border pt-4">
            <ShowMath lines={lines} fx={res.fx} />
          </div>
        </div>

        {res.assumptions.length > 0 && (
          <details className="group mt-5 text-[13px] leading-5 text-pw-muted">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-semibold text-pw-text marker:hidden">
              <Info className="size-4 text-pw-muted" aria-hidden="true" />
              What this estimate assumes ({res.assumptions.length})
              <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="mt-1 list-disc space-y-1 pl-6">
              {res.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        )}

        <p className="mt-3 text-[13px] leading-5 text-pw-muted">
          Estimates are for planning only. Final charges are assessed by the Nigeria Customs Service at clearing.
        </p>
        <p className="print-only mt-2 hidden break-all text-[11px] text-pw-muted">{url}</p>
      </div>
    </div>
  );
}

/** Two levy regimes side by side; the headline follows the one selected (the higher one by default). */
function RegimeSwitch({ res, selected, onSelect }: { res: CalcResponse; selected: Regime; onSelect: (r: Regime) => void }) {
  const [a, b] = res.scenarios;
  const diff = Math.abs(a.shipment_summary.grand_total_landed_cost_ngn - b.shipment_summary.grand_total_landed_cost_ngn);
  return (
    <div className="mt-5">
      <div role="radiogroup" aria-label="Levy regime" className="grid grid-cols-2 gap-2">
        {res.scenarios.map((sc) => {
          const on = sc.regime === selected;
          const higher = sc.regime === res.primary_regime;
          return (
            <button
              key={sc.regime}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSelect(sc.regime)}
              className={cn(
                "flex min-h-16 flex-col items-start justify-center rounded-[var(--radius-input)] border px-3 py-2 text-left transition-colors",
                on ? "border-pw-navy bg-pw-navy text-white" : "border-pw-input bg-white text-pw-text hover:border-pw-navy",
              )}
            >
              <span className={cn("text-[13px] font-medium", on ? "text-pw-on-navy" : "text-pw-muted")}>
                With the {REGIME_NAME[sc.regime]}
                {higher ? " (higher)" : ""}
              </span>
              <span className="text-base font-bold num">{formatNgn(sc.shipment_summary.grand_total_landed_cost_ngn)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] leading-5 text-pw-muted">
        Customs has charged levies two ways recently, and the 4% FOB charge was suspended in 2025 pending review. The two differ by{" "}
        <span className="font-medium text-pw-text num">{formatNgn(diff)}</span>; we lead with the higher so you don't under-budget.
      </p>
    </div>
  );
}

/** What happens to the total if the naira moves before the importer pays. */
function Sensitivity({ res }: { res: CalcResponse }) {
  const rows = [...res.sensitivity_analysis].sort((x, y) => x.fx_shift_pct - y.fx_shift_pct);
  const max = Math.max(...rows.map((r) => r.total_landed_cost_ngn));
  const min = Math.min(...rows.map((r) => r.total_landed_cost_ngn));
  return (
    <div className="mt-7">
      <h3 className="text-[15px] font-semibold text-pw-navy">If the naira moves before you pay</h3>
      <p className="mt-0.5 text-[13px] text-pw-muted">
        The same goods at a different exchange rate, with the {REGIME_NAME[res.primary_regime]}.
      </p>
      <table className="mt-3 w-full border-collapse text-sm">
        <caption className="sr-only">Landed cost at different exchange rates</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Naira move</th>
            <th scope="col">Landed cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const width = max === min ? 100 : 55 + ((r.total_landed_cost_ngn - min) / (max - min)) * 45;
            const label =
              r.fx_shift_pct === 0
                ? "Today's rate"
                : r.fx_shift_pct > 0
                  ? `Naira ${r.fx_shift_pct}% weaker`
                  : `Naira ${Math.abs(r.fx_shift_pct)}% stronger`;
            return (
              <tr key={r.fx_shift_pct}>
                <th scope="row" className="w-[38%] py-1.5 pr-3 text-left font-normal text-pw-muted">
                  <span className={cn(r.fx_shift_pct === 0 && "font-semibold text-pw-text")}>{label}</span>
                  {r.exchange_rate != null && <span className="block text-[12px] num">{formatNgn(r.exchange_rate)}</span>}
                </th>
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn("h-2.5 rounded-full", r.fx_shift_pct > 0 ? "bg-pw-coral/70" : r.fx_shift_pct < 0 ? "bg-pw-green/60" : "bg-pw-navy")}
                      style={{ width: `${width * 0.55}%` }}
                    />
                    <span className={cn("whitespace-nowrap num", r.fx_shift_pct === 0 ? "font-semibold text-pw-text" : "text-pw-text")}>
                      {formatNgn(r.total_landed_cost_ngn)}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-pw-input bg-white px-2 text-sm font-semibold text-pw-navy hover:border-pw-navy hover:bg-pw-bg sm:px-3.5"
    >
      {children}
    </button>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}
