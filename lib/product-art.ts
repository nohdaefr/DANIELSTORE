// Which packaging illustration to draw for a product.
// Products without their own photo get a drawing of their packaging or of the
// produce itself, so the shelf looks like a shelf and not a row of icons.
// New products fall back to a drawing for their department.

export type ArtKind =
  | "carton"
  | "tub"
  | "slices"
  | "eggs"
  | "loaf"
  | "challah"
  | "pita"
  | "tomatoes"
  | "cucumbers"
  | "onion"
  | "potatoes"
  | "apple"
  | "bananas"
  | "pouch"
  | "jar"
  | "oil"
  | "water"
  | "soda";

export interface ArtSpec {
  kind: ArtKind;
  /** Short word printed on the package label (decorative). */
  label?: string;
  /** Main package/label color. */
  color?: string;
}

const BY_SKU: Record<string, ArtSpec> = {
  "DAIRY-001": { kind: "carton", label: "חלב 3%", color: "#2f6db5" },
  "DAIRY-002": { kind: "tub", label: "גבינה 5%", color: "#5aa0d8" },
  "DAIRY-003": { kind: "tub", label: "קוטג׳", color: "#1d4f91" },
  "DAIRY-004": { kind: "slices" },
  "DAIRY-005": { kind: "eggs" },
  "DAIRY-006": { kind: "tub", label: "יוגורט", color: "#3c8f6b" },
  "BAKE-001": { kind: "loaf", label: "לחם", color: "#c2412d" },
  "BAKE-002": { kind: "challah" },
  "BAKE-003": { kind: "pita" },
  "BAKE-004": { kind: "loaf", label: "מחמצת", color: "#6b4a2b" },
  "VEG-001": { kind: "tomatoes" },
  "VEG-002": { kind: "cucumbers" },
  "VEG-003": { kind: "onion" },
  "VEG-004": { kind: "potatoes" },
  "FRT-001": { kind: "apple" },
  "FRT-002": { kind: "bananas" },
  "PANT-001": { kind: "pouch", label: "אורז", color: "#2f6db5" },
  "PANT-002": { kind: "pouch", label: "פתיתים", color: "#d9822b" },
  "PANT-003": { kind: "jar", label: "טחינה", color: "#9b6b33" },
  "PANT-004": { kind: "tub", label: "חומוס", color: "#a8792f" },
  "PANT-005": { kind: "oil", label: "שמן זית" },
  "PANT-006": { kind: "pouch", label: "בוטנים", color: "#e0662a" },
  "DRNK-001": { kind: "water", label: "מים" },
  "DRNK-002": { kind: "carton", label: "תפוזים", color: "#ef8a17" },
  "DRNK-003": { kind: "soda", label: "סודה" },
};

const BY_CATEGORY: Record<string, ArtSpec> = {
  "dairy-eggs": { kind: "carton", color: "#2f6db5" },
  bakery: { kind: "loaf", color: "#c2412d" },
  "fruits-vegetables": { kind: "apple" },
  pantry: { kind: "jar", color: "#9b6b33" },
  drinks: { kind: "water" },
};

export function artFor(product: { sku?: string; name: string; category: { slug: string } }): ArtSpec {
  const known = product.sku ? BY_SKU[product.sku] : undefined;
  if (known) return known;
  const fallback = BY_CATEGORY[product.category.slug] ?? { kind: "pouch", color: "#1f5f3f" };
  // Generic package: print the first word of the product name on it
  const label = fallback.kind === "apple" || fallback.kind === "water" ? fallback.label : product.name.split(/\s+/)[0];
  return { ...fallback, label };
}
