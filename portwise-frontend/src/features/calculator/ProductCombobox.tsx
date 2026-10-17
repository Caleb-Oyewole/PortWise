import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, RefreshCw, Search, X } from "lucide-react";
import type { HsCode } from "@/lib/api/schemas";
import type { Catalog } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { formatNgn, formatPct } from "@/lib/format";
import { inputClass, Skeleton } from "@/components/ui/primitives";
import { CategoryIcon } from "./categoryIcons";
import { highlight, searchProducts } from "./search";

interface Props {
  id: string;
  value: number | null;
  onChange: (id: number | null) => void;
  onBlur?: () => void;
  catalog: Catalog & { isLoading: boolean; isError: boolean; refetch: () => void };
  error?: string;
  describedById?: string;
  inputRef?: (el: HTMLInputElement | null) => void;
}

export const dutyHint = (hs: HsCode) => {
  if (hs.has_rate === false || (hs.duty_pct == null && hs.rate_per_kg == null)) return "No duty rate yet";
  if (hs.rate_type === "per_kg" && hs.rate_per_kg != null) return `${formatNgn(hs.rate_per_kg)} per kg`;
  return `${formatPct(hs.duty_pct ?? 0)} duty`;
};

export function ProductCombobox({ id, value, onChange, onBlur, catalog, error, describedById, inputRef }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const localInput = useRef<HTMLInputElement | null>(null);

  const selected = value === null ? undefined : catalog.hsById.get(value);
  const display = editing ? query : (selected?.description ?? "");

  const groups = useMemo(() => {
    const all = catalog.groups.flatMap((g) => g.codes);
    const matches = searchProducts(editing ? query : "", all, catalog.categoryById);
    const rank = new Map(matches.map((m, i) => [m.hs.id, i]));
    return catalog.groups
      .map((g) => ({
        ...g,
        codes: g.codes.filter((c) => rank.has(c.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!),
      }))
      .filter((g) => g.codes.length > 0)
      .sort((a, b) => (query && editing ? rank.get(a.codes[0].id)! - rank.get(b.codes[0].id)! : 0));
  }, [catalog, query, editing]);

  const flat = useMemo(() => groups.flatMap((g) => g.codes), [groups]);
  const selectable = useMemo(() => flat.filter((h) => h.has_rate !== false), [flat]);

  // Keep the highlighted option valid as the list filters.
  const current =
    active !== null && selectable.some((h) => h.id === active)
      ? active
      : (selectable.find((h) => h.id === value)?.id ?? selectable[0]?.id ?? null);

  useEffect(() => {
    if (!open || current === null) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-option="${current}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [current, open]);

  const choose = (hs: HsCode) => {
    if (hs.has_rate === false) return;
    onChange(hs.id);
    setEditing(false);
    setQuery("");
    setOpen(false);
  };

  const move = (dir: 1 | -1) => {
    if (!selectable.length) return;
    const i = selectable.findIndex((h) => h.id === current);
    const next = i === -1 ? (dir === 1 ? 0 : selectable.length - 1) : (i + dir + selectable.length) % selectable.length;
    setActive(selectable[next].id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        else move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        else move(-1);
        break;
      case "Enter":
        if (open) {
          e.preventDefault();
          const hs = current === null ? undefined : catalog.hsById.get(current);
          if (hs) choose(hs);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setEditing(false);
          setQuery("");
        } else if (editing) {
          setEditing(false);
          setQuery("");
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const activeId = open && current !== null ? `${listId}-opt-${current}` : undefined;
  const category = selected ? catalog.categoryById.get(selected.category_id) : undefined;

  return (
    <div className="relative">
      <div className="relative">
        {selected && !editing ? (
          <CategoryIcon
            category={category}
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-pw-navy"
          />
        ) : (
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-pw-muted"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
        <input
          ref={(el) => {
            localInput.current = el;
            inputRef?.(el);
          }}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          autoComplete="off"
          spellCheck={false}
          placeholder={catalog.isLoading ? "Loading products…" : "Search a product or HS code"}
          className={cn(inputClass(!!error), "pl-10 pr-10 font-medium")}
          value={display}
          onChange={(e) => {
            setEditing(true);
            setQuery(e.target.value);
            setOpen(true);
            setActive(null);
          }}
          onFocus={(e) => {
            // Select the current text so typing replaces it.
            if (selected) e.currentTarget.select();
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
            setEditing(false);
            setQuery("");
            onBlur?.();
          }}
        />
        {selected && !editing ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear product"
            className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-pw-muted hover:bg-pw-bg hover:text-pw-navy"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(null);
              setEditing(true);
              setQuery("");
              setOpen(true);
              localInput.current?.focus();
            }}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown
            className={cn(
              "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-pw-muted transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        )}
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Products"
        tabIndex={-1}
        hidden={!open}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          "absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[min(60vh,380px)] overflow-y-auto overscroll-contain",
          "rounded-[var(--radius-card)] border border-pw-border bg-white py-1.5 shadow-[var(--shadow-pop)]",
        )}
      >
        {catalog.isLoading && (
          <div className="space-y-3 px-3 py-3" aria-label="Loading products">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-6">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        )}

        {catalog.isError && !catalog.isLoading && flat.length === 0 && (
          <div className="px-3.5 py-3 text-sm text-pw-text">
            <p>The product list didn't load.</p>
            <button
              type="button"
              className="mt-2 inline-flex min-h-10 items-center gap-1.5 font-semibold text-pw-blue hover:underline"
              onClick={() => catalog.refetch()}
            >
              <RefreshCw className="size-4" aria-hidden="true" /> Load products again
            </button>
          </div>
        )}

        {!catalog.isLoading && !catalog.isError && flat.length === 0 && (
          <div className="px-3.5 py-3 text-sm">
            <p className="text-pw-text">
              No product matches “{query.trim()}”. Try a broader word or the first digits of an HS code.
            </p>
            <button
              type="button"
              className="mt-2 inline-flex min-h-10 items-center font-semibold text-pw-blue hover:underline"
              onClick={() => {
                setQuery("");
                localInput.current?.focus();
              }}
            >
              Show all products
            </button>
          </div>
        )}

        {groups.map((g) => {
          const headId = `${listId}-g-${g.category?.id ?? "x"}`;
          return (
            <div key={headId} role="group" aria-labelledby={headId} className="pb-1">
              <div
                id={headId}
                role="presentation"
                className="sticky top-[-6px] z-10 flex items-center gap-2 bg-white/95 px-3.5 pb-1 pt-2.5 text-[13px] font-semibold text-pw-muted backdrop-blur"
              >
                <CategoryIcon category={g.category} className="size-4" />
                {g.category?.name ?? "Other products"}
              </div>
              {g.codes.map((hs) => {
                const disabled = hs.has_rate === false;
                const isActive = hs.id === current;
                const isSelected = hs.id === value;
                return (
                  // Keyboard selection happens on the combobox input via aria-activedescendant (ARIA 1.2 pattern).
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <div
                    key={hs.id}
                    id={`${listId}-opt-${hs.id}`}
                    data-option={hs.id}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={disabled || undefined}
                    tabIndex={-1}
                    onMouseMove={() => !disabled && setActive(hs.id)}
                    onClick={() => choose(hs)}
                    className={cn(
                      "mx-1.5 flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg px-2.5 py-2",
                      isActive && "bg-pw-blue-50",
                      disabled && "cursor-not-allowed opacity-55",
                    )}
                  >
                    <span className="min-w-0">
                      <span className={cn("block truncate text-[15px] text-pw-text", isSelected && "font-semibold")}>
                        {highlight(hs.description, editing ? query : "").map((c, i) =>
                          c.hit ? (
                            <mark key={i} className="bg-transparent font-semibold text-pw-navy underline decoration-pw-amber decoration-2 underline-offset-2">
                              {c.text}
                            </mark>
                          ) : (
                            <span key={i}>{c.text}</span>
                          ),
                        )}
                      </span>
                      <span className="block font-mono text-xs text-pw-muted">HS {hs.code}</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-medium text-pw-muted num">{dutyHint(hs)}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
