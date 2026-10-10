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

const UNIT_PATTERN = /^\s*(\d+(?:\.\d+)?)?\s*(גרם|ק["״]ג|ליטר|מ["״]ל|יחידות|יחידה)\s*$/;

/**
 * Comparison price, as printed on Israeli shelf labels:
 * "1 ליטר" at 6.90 -> "0.69 ₪ ל־100 מ״ל". Null when it adds nothing
 * (sold by the kilo, or a single item) or the unit isn't recognized.
 */
export function unitPriceLabel(price: number, unit: string): string | null {
  const match = UNIT_PATTERN.exec(unit);
  if (!match || !(price > 0)) return null;
  const amount = match[1] === undefined ? null : Number(match[1]);
  const kind = match[2].replace("״", '"');
  if (amount === null || amount <= 0) return null;

  switch (kind) {
    case "גרם":
      return `${formatPrice((price / amount) * 100)} ל־100 גרם`;
    case 'ק"ג':
      return `${formatPrice((price / (amount * 1000)) * 100)} ל־100 גרם`;
    case "ליטר":
      return `${formatPrice((price / (amount * 1000)) * 100)} ל־100 מ״ל`;
    case 'מ"ל':
      return `${formatPrice((price / amount) * 100)} ל־100 מ״ל`;
    case "יחידות":
      return amount > 1 ? `${formatPrice(price / amount)} ליחידה` : null;
    default:
      return null;
  }
}
