"use client";

import { cartActions } from "@/lib/cart-store";
import { formatAgorot, formatPrice, toAgorot } from "@/lib/format";
import { MAX_QUANTITY_PER_PRODUCT } from "@/lib/validation";
import type { Product } from "@/types";
import ProductImage from "../ProductImage";
import QuantityStepper from "../QuantityStepper";
import styles from "./CartItem.module.css";

export default function CartItem({ product, quantity }: { product: Product; quantity: number }) {
  const max = Math.min(product.stockQuantity, MAX_QUANTITY_PER_PRODUCT);
  const overStock = quantity > max;
  const lineTotal = toAgorot(product.price) * quantity;

  return (
    <article className={styles.item} data-testid="cart-item" aria-labelledby={`cart-item-${product.id}`}>
      <ProductImage product={product} size="thumb" />

      <div className={styles.info}>
        <h3 id={`cart-item-${product.id}`} className={styles.name}>
          {product.name}
        </h3>
        <p className={styles.meta}>
          {formatPrice(product.price)} ל־{product.unit}
        </p>
        {overStock && (
          <p className={styles.warning} role="status">
            {max === 0 ? "אזל מהמלאי" : `נשארו רק ${max} במלאי`}
          </p>
        )}
      </div>

      <div className={styles.controls}>
        <QuantityStepper
          quantity={quantity}
          max={max}
          productName={product.name}
          onChange={(next) => cartActions.setQuantity(product.id, next)}
        />
        <button
          type="button"
          className={styles.remove}
          onClick={() => cartActions.remove(product.id)}
        >
          הסרה<span className="visually-hidden"> של {product.name} מהעגלה</span>
        </button>
      </div>

      <p className={styles.lineTotal} data-testid="line-total">
        {formatAgorot(lineTotal)}
      </p>
    </article>
  );
}

/** A product that was in the cart but is no longer sold. */
export function UnavailableCartItem({ productId }: { productId: number }) {
  return (
    <article className={`${styles.item} ${styles.unavailable}`} data-testid="cart-item-unavailable">
      <div className={styles.info}>
        <h3 className={styles.name}>מוצר שאינו זמין עוד</h3>
        <p className={styles.meta}>המוצר הוסר מהמלאי או שאינו נמכר כרגע.</p>
      </div>
      <div className={styles.controls}>
        <button type="button" className="btn btn-secondary" onClick={() => cartActions.remove(productId)}>
          הסרה מהעגלה
        </button>
      </div>
    </article>
  );
}

export function CartItemSkeleton() {
  return (
    <div className={styles.item} aria-hidden="true">
      <div className="skeleton" style={{ width: 72, height: 72 }} />
      <div className={styles.info}>
        <div className="skeleton" style={{ height: 18, width: "60%" }} />
        <div className="skeleton" style={{ height: 14, width: "35%", marginTop: 8 }} />
      </div>
      <div className="skeleton" style={{ width: 132, height: 44 }} />
    </div>
  );
}
