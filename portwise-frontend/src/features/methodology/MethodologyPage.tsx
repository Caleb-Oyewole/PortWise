import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { calculate } from "@/lib/api/endpoints";
import { useCatalog, usePresets } from "@/lib/api/hooks";
import { formatNgn } from "@/lib/format";
import { encodeItems } from "@/lib/url-state";
import { Skeleton } from "@/components/ui/primitives";
import { usePageTitle } from "@/components/usePageTitle";
import { ShowMath } from "@/features/results/ShowMath";
import { CategoryIcon } from "@/features/calculator/categoryIcons";
import { dutyHint } from "@/features/calculator/ProductCombobox";
import { levyBasis, levyName } from "@/features/results/labels";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Convert the goods to naira",
    body: "Price per unit × quantity, at the latest exchange rate for your invoice currency. This is the goods value (FOB).",
  },
  {
    title: "Add shipping and insurance",
    body: "If you enter them, they are converted the same way and added. The result is the customs value (CIF), which most charges are based on.",
  },
  {
    title: "Apply import duty",
    body: "A percentage of the customs value, set by the product's HS code. A few products are charged per kilogram instead.",
  },
  {
    title: "Add the levies",
    body: "Customs surcharge on the duty, the ECOWAS trade levy (ETLS) on the customs value, and the import supervision levy (CISS) on the goods value.",
  },
  {
    title: "Add VAT",
    body: "VAT is charged on the customs value plus duty plus levies. Adding it gives the landed cost.",
  },
];

export function MethodologyPage() {
  usePageTitle("How it works");
  const presets = usePresets();
  const catalog = useCatalog();
  const example = presets.data?.[0];
  const worked = useQuery({
    queryKey: ["worked-example", example?.id],
    queryFn: ({ signal }) => calculate({ items: example!.items }, signal),
    enabled: !!example,
    staleTime: 60_000,
  });
  const levies = worked.data?.items[0].levies ?? [];

  return (
    <div>
      <div className="bg-pw-navy">
        <div className="mx-auto max-w-[1120px] px-4 pb-12 pt-10 sm:px-6 sm:pt-14 lg:px-8">
          <h1 className="max-w-[20ch] font-display text-display-sm font-bold tracking-[-0.02em] text-white sm:text-display">
            How the estimate is worked out
          </h1>
          <p className="mt-4 max-w-[58ch] text-[17px] leading-7 text-pw-on-navy">
            Every naira in your total comes from five steps. Nothing is hidden: the calculator shows each rate and the amount it was
            applied to.
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1120px] gap-12 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:px-8">
        <section aria-labelledby="steps-title" className="lg:col-span-6">
          <h2 id="steps-title" className="text-2xl/8 font-semibold text-pw-navy">
            The calculation
          </h2>
          <ol className="mt-6 space-y-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.25rem_1fr] gap-x-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 items-center justify-center rounded-full bg-pw-navy text-sm font-semibold text-white num"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold text-pw-text">{s.title}</h3>
                  <p className="mt-1 max-w-[56ch] leading-7 text-pw-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          {levies.length > 0 && (
            <div className="mt-10">
              <h3 className="text-[17px] font-semibold text-pw-text">Current levy and VAT rates</h3>
              <table className="mt-3 w-full border-collapse text-[15px]">
                <caption className="sr-only">Levy and VAT rates applied by the calculator</caption>
                <tbody>
                  {levies.map((l) => (
                    <tr key={l.code} className="border-b border-pw-border">
                      <th scope="row" className="py-2.5 pr-4 text-left font-medium">{levyName(l)}</th>
                      <td className="py-2.5 text-right text-pw-muted num">{levyBasis(l)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="py-2.5 pr-4 text-left font-medium">VAT</th>
                    <td className="py-2.5 text-right text-pw-muted num">
                      {worked.data!.items[0].vat.pct}% of customs value, duty and levies
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="example-title" className="lg:col-span-6">
          <div className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
            <h2 id="example-title" className="text-lg/[26px] font-semibold text-pw-navy">
              A worked example{example ? `: ${example.label}` : ""}
            </h2>
            {example?.description && <p className="mt-1 text-sm text-pw-muted">{example.description}</p>}
            <div className="mt-5">
              {worked.isLoading || presets.isLoading ? (
                <div className="space-y-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : worked.data && example ? (
                <>
                  <ShowMath res={worked.data} reqItems={example.items} />
                  <p className="mt-6 border-t-2 border-pw-navy pt-4 text-base font-semibold text-pw-green">
                    Landed cost <span className="float-right num">{formatNgn(worked.data.totals.total)}</span>
                  </p>
                  <Link
                    to={`/?${encodeItems(example.items)}`}
                    className="mt-6 inline-flex min-h-11 items-center font-semibold text-pw-blue hover:underline"
                  >
                    Open this example in the calculator
                  </Link>
                </>
              ) : (
                <p className="text-pw-muted">The worked example could not be loaded. The steps on this page still apply.</p>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="sources-title" className="lg:col-span-6">
          <h2 id="sources-title" className="text-2xl/8 font-semibold text-pw-navy">
            Where the numbers come from
          </h2>
          <dl className="mt-5 space-y-5 leading-7">
            <div>
              <dt className="font-semibold text-pw-text">Duty rates</dt>
              <dd className="text-pw-muted">
                Curated by hand from the Nigeria Customs Service published tariff schedule, for a focused set of products importers ask
                about most. Each rate is kept with its source reference.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-pw-text">Exchange rates</dt>
              <dd className="text-pw-muted">
                Fetched from an exchange-rate provider several times a day. The rate used, and when it was fetched, is always shown next
                to your total. If the provider is down, the last known rate is used and clearly marked.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-pw-text">Levies and VAT</dt>
              <dd className="text-pw-muted">Set as configurable rates, so a change in policy is one edit, not a code change.</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="limits-title" className="lg:col-span-6">
          <h2 id="limits-title" className="text-2xl/8 font-semibold text-pw-navy">
            What this is not
          </h2>
          <ul className="mt-5 list-disc space-y-2 pl-5 leading-7 text-pw-muted marker:text-pw-input">
            <li>Not an official customs assessment. Final charges are set by the Nigeria Customs Service at clearing.</li>
            <li>Not a freight quote. Shipping and insurance are only included if you enter them.</li>
            <li>No accounts and nothing stored. Your goods stay in your browser and in the links you share.</li>
          </ul>
        </section>

        <section aria-labelledby="covered-title" className="lg:col-span-12">
          <h2 id="covered-title" className="text-2xl/8 font-semibold text-pw-navy">
            Products covered
          </h2>
          <p className="mt-2 max-w-[60ch] leading-7 text-pw-muted">
            This list comes straight from the tariff database, so new products appear here as soon as they are added.
          </p>
          {catalog.isLoading ? (
            <Skeleton className="mt-6 h-40 w-full" />
          ) : (
            <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.groups.map((g) => {
                return (
                  <div key={g.category?.id ?? "other"}>
                    <h3 className="flex items-center gap-2 font-semibold text-pw-text">
                      <CategoryIcon category={g.category} className="size-5 text-pw-navy" />
                      {g.category?.name ?? "Other products"}
                    </h3>
                    <ul className="mt-2 text-sm">
                      {g.codes.map((h) => (
                        <li key={h.id} className="flex justify-between gap-4 border-b border-pw-border py-2">
                          <span className="text-pw-text">
                            {h.description} <span className="font-mono text-xs text-pw-muted">{h.code}</span>
                          </span>
                          <span className="shrink-0 text-pw-muted num">{dutyHint(h)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
