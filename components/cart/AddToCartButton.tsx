"use client";

import { getQuantity } from "@/lib/cart";
import { cartActions } from "@/lib/cart-store";
import { MAX_QUANTITY_PER_PRODUCT } from "@/lib/validation";
import QuantityStepper from "../QuantityStepper";
import { useCartLines } from "./useCart";
import styles from "./AddToCartButton.module.css";

interface AddToCartButtonProps {
  productId: number;
  productName: string;
  stockQuantity: number;
}

export default function AddToCartButton({ productId, productName, stockQuantity }: AddToCartButtonProps) {
  const quantity = getQuantity(useCartLines(), productId);
  const max = Math.min(stockQuantity, MAX_QUANTITY_PER_PRODUCT);

  if (max === 0) {
    return (
      <button type="button" className={styles.soldOut} disabled>
        אזל מהמלאי<span className="visually-hidden">: {productName}</span>
      </button>
    );
  }

  if (quantity === 0) {
    return (
      <button type="button" className={styles.add} onClick={() => cartActions.add(productId, max)}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        הוספה<span className="visually-hidden"> לעגלה: {productName}</span>
      </button>
    );
  }

  return (
    <QuantityStepper
      size="lg"
      quantity={quantity}
      max={max}
      productName={productName}
      onChange={(next) => cartActions.setQuantity(productId, next, max)}
    />
  );
}
