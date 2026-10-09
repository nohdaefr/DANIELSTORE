import { formatPrice, splitPrice } from "@/lib/format";
import styles from "./PriceTag.module.css";

/** Shelf-tag style price: big shekels, small raised agorot. */
export default function PriceTag({ price, unit }: { price: number; unit?: string }) {
  const { shekels, agorot } = splitPrice(price);
  return (
    <div className={styles.tag}>
      {/* Screen readers get the normal formatted price */}
      <span className="visually-hidden">{formatPrice(price)}</span>
      <span className={styles.amount} aria-hidden="true" dir="ltr">
        <span className={styles.currency}>₪</span>
        <span className={styles.shekels}>{shekels}</span>
        <span className={styles.agorot}>{agorot}</span>
      </span>
      {unit && <span className={styles.unit}>ל־{unit}</span>}
    </div>
  );
}
