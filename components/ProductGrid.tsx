import type { Product } from "@/types";
import ProductCard from "./ProductCard";
import styles from "./ProductGrid.module.css";

export default function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className={styles.grid} data-testid="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
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
          <div className="skeleton" style={{ aspectRatio: "1 / 1" }} />
          <div className="skeleton" style={{ height: "1.1rem", width: "75%" }} />
          <div className="skeleton" style={{ height: "2.6rem", width: "45%" }} />
          <div className="skeleton" style={{ height: "44px" }} />
        </div>
      ))}
    </div>
  );
}
