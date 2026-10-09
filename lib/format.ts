// Money helpers. Calculations are done in agorot (integers) to avoid
// floating-point errors such as 0.1 + 0.2 = 0.30000000000000004.

export function toAgorot(shekels: number): number {
  return Math.round(shekels * 100);
}

const priceFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 690 -> "‏6.90 ₪" */
export function formatAgorot(agorot: number): string {
  return priceFormatter.format(agorot / 100);
}

export function formatPrice(shekels: number): string {
  return formatAgorot(toAgorot(shekels));
}

/** 6.9 -> { shekels: "6", agorot: "90" } — for the shelf-tag price display. */
export function splitPrice(shekels: number): { shekels: string; agorot: string } {
  const total = toAgorot(shekels);
  return {
    shekels: Math.floor(total / 100).toLocaleString("he-IL"),
    agorot: String(total % 100).padStart(2, "0"),
  };
}
