import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { calculate, getFxRates, getHsCodes, getPresets, getRegimeConfig } from "./endpoints";
import type { CalcRequest, FxRate, HsCode } from "./schemas";

export const useHsCodes = () =>
  useQuery({
    queryKey: ["hs-codes"],
    queryFn: getHsCodes,
    staleTime: 30_000,
    refetchOnWindowFocus: true, // an admin edit appears when the tab regains focus
  });

export const useFxRates = () =>
  useQuery({ queryKey: ["fx"], queryFn: getFxRates, staleTime: 60_000, refetchInterval: 5 * 60_000 });

export const usePresets = () => useQuery({ queryKey: ["presets"], queryFn: getPresets, staleTime: 5 * 60_000 });

export const useRegimeConfig = () =>
  useQuery({ queryKey: ["regime-config"], queryFn: getRegimeConfig, staleTime: 60_000 });

/** Money requests are never retried automatically. */
export const useCalculate = () =>
  useMutation({
    mutationFn: ({ req, signal }: { req: CalcRequest; signal?: AbortSignal }) => calculate(req, signal),
    retry: false,
  });

export interface Catalog {
  byCode: Map<string, HsCode>;
  groups: { category: string; codes: HsCode[] }[];
  tariffUpdatedAt?: string | null;
}

/** Products grouped by category, in the order the API returns them. */
export function useCatalog(): Catalog & { isLoading: boolean; isError: boolean; refetch: () => void } {
  const hs = useHsCodes();
  const catalog = useMemo<Catalog>(() => {
    const items = hs.data?.items ?? [];
    const byCode = new Map(items.map((h) => [h.code, h]));
    const groups: Catalog["groups"] = [];
    for (const h of items) {
      const last = groups[groups.length - 1];
      if (last && last.category === h.category) last.codes.push(h);
      else groups.push({ category: h.category, codes: [h] });
    }
    return { byCode, groups, tariffUpdatedAt: hs.data?.tariff_updated_at };
  }, [hs.data]);

  return {
    ...catalog,
    isLoading: hs.isLoading,
    isError: hs.isError,
    refetch: () => void hs.refetch(),
  };
}

/** Latest rate for one currency, from the shared FX list. */
export function useFxRate(currency: string): { rate?: FxRate; isLoading: boolean; isError: boolean } {
  const fx = useFxRates();
  return {
    rate: fx.data?.rates.find((r) => r.currency === currency),
    isLoading: fx.isLoading,
    isError: fx.isError,
  };
}
