import { createElement } from "react";
import { Car, Cog, Footprints, Package, Shirt, Smartphone, Sparkles, type LucideIcon } from "lucide-react";
import type { Category } from "@/lib/api/schemas";

const ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  shirt: Shirt,
  sparkles: Sparkles,
  cog: Cog,
  footprints: Footprints,
  car: Car,
};

// Fallback by slug keyword, so a category added in the admin still gets a sensible icon.
const BY_SLUG: [RegExp, LucideIcon][] = [
  [/phone|electr/, Smartphone],
  [/textile|fabric|cloth|garment/, Shirt],
  [/cosmetic|beauty/, Sparkles],
  [/machine|part|engine/, Cog],
  [/foot|shoe/, Footprints],
  [/auto|vehicle|car/, Car],
];

export function categoryIcon(cat: Category | undefined): LucideIcon {
  if (!cat) return Package;
  if (cat.icon && ICONS[cat.icon]) return ICONS[cat.icon];
  return BY_SLUG.find(([re]) => re.test(cat.slug))?.[1] ?? Package;
}

/** Renders the icon for a category without creating components during render. */
export function CategoryIcon({
  category,
  className,
  strokeWidth = 1.75,
}: {
  category: Category | undefined;
  className?: string;
  strokeWidth?: number;
}) {
  return createElement(categoryIcon(category), { className, strokeWidth, "aria-hidden": true });
}
