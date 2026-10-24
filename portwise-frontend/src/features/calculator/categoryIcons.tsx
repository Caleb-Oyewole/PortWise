import { createElement } from "react";
import { Car, Cog, Footprints, Package, Shirt, Smartphone, Sparkles, type LucideIcon } from "lucide-react";

// Matched on the category name, so a category added in the admin still gets a sensible icon.
const BY_NAME: [RegExp, LucideIcon][] = [
  [/phone|electr/i, Smartphone],
  [/textile|fabric|cloth|garment/i, Shirt],
  [/cosmetic|beauty/i, Sparkles],
  [/machine|engine/i, Cog],
  [/foot|shoe/i, Footprints],
  [/vehicle|auto|car\b|spare/i, Car],
];

export function categoryIcon(name: string | undefined | null): LucideIcon {
  if (!name) return Package;
  return BY_NAME.find(([re]) => re.test(name))?.[1] ?? Package;
}

/** Renders the icon for a category without creating components during render. */
export function CategoryIcon({
  category,
  className,
  strokeWidth = 1.75,
}: {
  category: string | undefined | null;
  className?: string;
  strokeWidth?: number;
}) {
  return createElement(categoryIcon(category), { className, strokeWidth, "aria-hidden": true });
}
