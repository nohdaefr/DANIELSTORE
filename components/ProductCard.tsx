import type { Product } from "@/types";
import AddToCartButton from "./cart/AddToCartButton";
import PriceTag from "./PriceTag";
import ProductImage from "./ProductImage";
import styles from "./ProductCard.module.css";

const LOW_STOCK = 10;

export default function ProductCard({ product }: { product: Product }) {
  const lowStock = product.stockQuantity > 0 && product.stockQuantity <= LOW_STOCK;

  return (
    <article className={styles.card} aria-labelledby={`product-${product.id}`} data-testid="product-card">
      <ProductImage product={product} />
      <div className={styles.body}>
        <h3 id={`product-${product.id}`} className={styles.name}>
          {product.name}
        </h3>
        {product.description && <p className={styles.description}>{product.description}</p>}
        <PriceTag price={product.price} unit={product.unit} />
        {lowStock && <p className={styles.stock}>נשארו {product.stockQuantity} במלאי</p>}
      </div>
      <AddToCartButton
        productId={product.id}
        productName={product.name}
        stockQuantity={product.stockQuantity}
      />
    </article>
  );
}
