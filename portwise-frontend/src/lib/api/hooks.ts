import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { calculate, getCategories, getFx, getHsCodes, getPresets } from "./endpoints";
import type { CalcRequest, Category, Currency, HsCode } from "./schemas";

export const useCategories = () =>
  useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 30_000,
    refetchOnWindowFocus: true, // an admin edit appears when the tab regains focus
  });

export const useHsCodes = () =>
  useQuery({
    queryKey: ["hs-codes"],
    queryFn: getHsCodes,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

export const usePresets = () => useQuery({ queryKey: ["presets"], queryFn: getPresets, staleTime: 5 * 60_000 });

export const useFx = (currency: Currency) =>
  useQuery({
    queryKey: ["fx", currency],
    queryFn: () => getFx(currency as Exclude<Currency, "NGN">),
    enabled: currency !== "NGN",
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

/** Money requests are never retried automatically. */
export const useCalculate = () =>
  useMutation({
    mutationFn: ({ req, signal }: { req: CalcRequest; signal?: AbortSignal }) => calculate(req, signal),
    retry: false,
  });

export interface Catalog {
  hsById: Map<number, HsCode>;
  categoryById: Map<number, Category>;
  groups: { category: Category | undefined; codes: HsCode[] }[];
}

/** Products grouped by category, in category order. */
export function useCatalog(): Catalog & { isLoading: boolean; isError: boolean; refetch: () => void } {
  const hs = useHsCodes();
  const cats = useCategories();
  const catalog = useMemo<Catalog>(() => {
    const hsById = new Map((hs.data ?? []).map((h) => [h.id, h]));
    const categoryById = new Map((cats.data ?? []).map((c) => [c.id, c]));
    const byCat = new Map<number, HsCode[]>();
    for (const h of hs.data ?? []) {
      const list = byCat.get(h.category_id) ?? [];
      list.push(h);
      byCat.set(h.category_id, list);
    }
    const order = [...categoryById.keys(), ...[...byCat.keys()].filter((k) => !categoryById.has(k))];
    const groups = order
      .filter((id) => byCat.has(id))
      .map((id) => ({ category: categoryById.get(id), codes: byCat.get(id)! }));
    return { hsById, categoryById, groups };
  }, [hs.data, cats.data]);

  return {
    ...catalog,
    isLoading: hs.isLoading || cats.isLoading,
    isError: hs.isError,
    refetch: () => {
      void hs.refetch();
      void cats.refetch();
    },
  };
}
