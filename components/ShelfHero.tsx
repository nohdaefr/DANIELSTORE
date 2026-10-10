import { artFor } from "@/lib/product-art";
import ProductArt from "./ProductArt";
import styles from "./ShelfHero.module.css";

// A few things from every aisle, standing on one shelf.
const ON_SHELF = ["DAIRY-001", "BAKE-002", "VEG-001", "PANT-005", "FRT-001", "DAIRY-005", "DRNK-003", "PANT-003"];

export default function ShelfHero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.text}>
        <h1 id="hero-title" className={styles.title}>
          הסל השבועי, בלי לעמוד בתור
        </h1>
        <p className={styles.lead}>בוחרים מהמדף, ממלאים כתובת למשלוח, וההזמנה נשלחת. המחירים מגיעים ישר מהמלאי.</p>
      </div>
      <div className={styles.shelf} aria-hidden="true">
        <div className={styles.products}>
          {ON_SHELF.map((sku, i) => (
            <ProductArt
              key={sku}
              spec={artFor({ sku, name: "", category: { slug: "" } })}
              className={`${styles.item} ${i >= 4 ? styles.extra : ""} ${i >= 6 ? styles.wide : ""}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
