import { unitPriceLabel } from "@/lib/format";
import type { Product } from "@/types";
import AddToCartButton from "./cart/AddToCartButton";
import PriceTag from "./PriceTag";
import ProductImage from "./ProductImage";
import styles from "./ProductCard.module.css";

const LOW_STOCK = 10;

export default function ProductCard({ product, headingLevel = 3 }: { product: Product; headingLevel?: 2 | 3 }) {
  const Name = headingLevel === 2 ? "h2" : "h3";
  const lowStock = product.stockQuantity > 0 && product.stockQuantity <= LOW_STOCK;
  const comparison = unitPriceLabel(product.price, product.unit);

  return (
    <article className={styles.card} aria-labelledby={`product-${product.id}`} data-testid="product-card">
      <div className={styles.shelf}>
        <ProductImage product={product} />
        {lowStock && <p className={styles.stock}>נשארו {product.stockQuantity} במלאי</p>}
      </div>
      <div className={styles.lip} aria-hidden="true" />
      <div className={styles.tag}>
        <PriceTag price={product.price} unit={product.unit} />
      </div>
      <div className={styles.body}>
        <Name id={`product-${product.id}`} className={styles.name} title={product.description ?? undefined}>
          {product.name}
        </Name>
        {comparison && <p className={styles.comparison}>{comparison}</p>}
        <div className={styles.action}>
          <AddToCartButton productId={product.id} productName={product.name} stockQuantity={product.stockQuantity} />
        </div>
      </div>
    </article>
  );
}
