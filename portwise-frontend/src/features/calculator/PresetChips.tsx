import type { Preset } from "@/lib/api/schemas";
import type { Catalog } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/primitives";
import { CategoryIcon } from "./categoryIcons";

/** One click fills the form and calculates. */
export function PresetChips({
  presets,
  loading,
  catalog,
  activeId,
  onPick,
}: {
  presets: Preset[] | undefined;
  loading: boolean;
  catalog: Catalog;
  activeId: string | null;
  onPick: (p: Preset) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {["w-32", "w-40", "w-36"].map((w) => (
          <Skeleton key={w} className={`h-11 rounded-full bg-white/10 ${w}`} />
        ))}
      </div>
    );
  }
  if (!presets?.length) return null;
  return (
    <div role="group" aria-labelledby="presets-label" className="flex flex-wrap items-center gap-2">
      <span id="presets-label" className="mr-1 text-sm text-pw-on-navy">
        Try an example:
      </span>
      {presets.map((p) => {
        const category = catalog.byCode.get(p.items[0].hs_code)?.category;
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            title={p.description}
            aria-pressed={active}
            onClick={() => onPick(p)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-200",
              active
                ? "border-white bg-white text-pw-navy"
                : "border-white/30 text-white hover:border-white/80 hover:bg-white/10",
            )}
          >
            <CategoryIcon category={category} className="size-4" />
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
