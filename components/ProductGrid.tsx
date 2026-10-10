import type { Product } from "@/types";
import ProductCard from "./ProductCard";
import styles from "./ProductGrid.module.css";

export default function ProductGrid({ products, headingLevel = 3 }: { products: Product[]; headingLevel?: 2 | 3 }) {
  return (
    <div className={styles.grid} data-testid="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} headingLevel={headingLevel} />
      ))}
    </div>
  );
}

/** Placeholder grid shown while products load. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={styles.grid} aria-hidden="true" data-testid="product-grid-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className="skeleton" style={{ aspectRatio: "5 / 4", borderRadius: 0 }} />
          <div className="skeleton" style={{ height: "2.6rem", width: "45%", marginInline: "0.75rem" }} />
          <div className="skeleton" style={{ height: "1.1rem", width: "70%", marginInline: "0.75rem" }} />
          <div className="skeleton" style={{ height: "44px", marginInline: "0.75rem" }} />
        </div>
      ))}
    </div>
  );
}
