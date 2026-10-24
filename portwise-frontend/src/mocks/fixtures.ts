// SAMPLE DATA for the in-browser mock API (dev and ?demo=1 only).
// Duty rates are illustrative ECOWAS CET bands, NOT verified against the
// Nigeria Customs Service schedule. The live API is the source of truth.
import type { Category, Currency, HsCode, LevyBase, Preset } from "@/lib/api/schemas";

export const categories: Category[] = [
  { id: 1, slug: "phones-electronics", name: "Phones and electronics", needs_weight: false, icon: "smartphone" },
  { id: 2, slug: "textiles-fabric", name: "Textiles and fabric", needs_weight: false, icon: "shirt" },
  { id: 3, slug: "cosmetics", name: "Cosmetics and beauty", needs_weight: false, icon: "sparkles" },
  { id: 4, slug: "machine-parts", name: "Machine parts", needs_weight: false, icon: "cog" },
  { id: 5, slug: "footwear", name: "Footwear", needs_weight: false, icon: "footprints" },
  { id: 6, slug: "auto-parts", name: "Vehicle spare parts", needs_weight: false, icon: "car" },
];

type Seed = [id: number, categoryId: number, code: string, description: string, duty: number, keywords: string];

const seed: Seed[] = [
  [12, 1, "8517.13", "Smartphones", 20, "phone mobile iphone android cellphone"],
  [13, 1, "8471.30", "Laptops and tablets", 5, "computer notebook ipad macbook"],
  [14, 1, "8504.40", "Chargers and power adapters", 10, "charger adapter usb"],
  [15, 1, "8518.30", "Headphones and earbuds", 20, "earphones airpods headset"],
  [16, 1, "8528.72", "Televisions", 20, "tv screen smart tv"],
  [17, 1, "8507.60", "Lithium-ion batteries and power banks", 20, "battery powerbank"],
  [21, 2, "5208.52", "Printed cotton fabric (Ankara)", 20, "ankara wax print cloth"],
  [22, 2, "5407.61", "Polyester woven fabric", 20, "synthetic chiffon cloth"],
  [23, 2, "5804.21", "Lace fabric", 20, "lace george aso ebi"],
  [24, 2, "6109.10", "Cotton T-shirts", 20, "tshirt tee shirt clothing"],
  [25, 2, "6204.42", "Women's cotton dresses", 20, "gown clothing ready-made garments"],
  [31, 3, "3304.99", "Skincare creams and lotions", 20, "cream lotion body moisturiser"],
  [32, 3, "3305.10", "Shampoos", 20, "hair wash"],
  [33, 3, "3305.90", "Hair products (relaxers, pomades)", 20, "relaxer hair cream pomade"],
  [34, 3, "3303.00", "Perfumes and fragrances", 20, "perfume cologne scent"],
  [35, 3, "3304.10", "Lip make-up", 20, "lipstick lip gloss makeup"],
  [41, 4, "8503.00", "Generator parts", 5, "generator alternator spare"],
  [42, 4, "8413.70", "Centrifugal water pumps", 5, "pump borehole"],
  [43, 4, "8482.10", "Ball bearings", 5, "bearing"],
  [44, 4, "8409.99", "Diesel engine parts", 5, "engine piston"],
  [45, 4, "8481.80", "Valves and taps", 10, "valve tap plumbing"],
  [51, 5, "6404.11", "Sneakers and sports shoes", 20, "trainers canvas"],
  [52, 5, "6403.99", "Leather shoes", 20, "formal shoes"],
  [53, 5, "6402.20", "Slippers and sandals", 20, "slides flip flops"],
  [54, 5, "6403.91", "Leather boots", 20, "boot"],
  [61, 6, "8708.30", "Brake pads", 10, "brake car"],
  [62, 6, "8708.80", "Shock absorbers", 10, "suspension car"],
  [63, 6, "4011.10", "Car tyres", 10, "tire tyre wheel"],
  [64, 6, "8511.10", "Spark plugs", 10, "plug ignition"],
  [65, 6, "8421.23", "Oil filters", 10, "filter"],
];

export const hsCodes: HsCode[] = seed.map(([id, category_id, code, description, duty_pct, keywords]) => ({
  id,
  category_id,
  code,
  description,
  keywords,
  rate_type: "ad_valorem",
  duty_pct,
  rate_per_kg: null,
  needs_weight: false,
  has_rate: true,
}));

export const levies: { code: string; name: string; pct: number; base: LevyBase }[] = [
  { code: "SURCHARGE", name: "Customs surcharge", pct: 7, base: "duty" },
  { code: "ETLS", name: "ECOWAS trade levy (ETLS)", pct: 0.5, base: "cif" },
  { code: "CISS", name: "Import supervision levy (CISS)", pct: 1, base: "fob" },
];

export const VAT_PCT = 7.5;

export const fxRates: Record<Exclude<Currency, "NGN">, number> = {
  USD: 1500,
  EUR: 1630,
  GBP: 1915,
  CNY: 208,
};

export const presets: Preset[] = [
  {
    id: "phones-dubai",
    label: "Phones from Dubai",
    description: "20 smartphones at $250 each, $250 shipping and insurance",
    items: [{ hs_code_id: 12, unit_value: 250, currency: "USD", quantity: 20, shipping_insurance: 250, weight_kg: null }],
  },
  {
    id: "fabric-china",
    label: "Fabric from China",
    description: "1,500 yards of Ankara at ¥18 a yard",
    items: [{ hs_code_id: 21, unit_value: 18, currency: "CNY", quantity: 1500, shipping_insurance: 4000, weight_kg: null }],
  },
  {
    id: "parts-germany",
    label: "Parts from Germany",
    description: "Bearings and water pumps in one shipment",
    items: [
      { hs_code_id: 43, unit_value: 12, currency: "EUR", quantity: 400, shipping_insurance: 300, weight_kg: null },
      { hs_code_id: 42, unit_value: 180, currency: "EUR", quantity: 6, shipping_insurance: 250, weight_kg: null },
    ],
  },
];
