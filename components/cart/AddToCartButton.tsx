"use client";

import { getQuantity } from "@/lib/cart";
import { cartActions } from "@/lib/cart-store";
import { MAX_QUANTITY_PER_PRODUCT } from "@/lib/validation";
import QuantityStepper from "../QuantityStepper";
import { useCartLines } from "./useCart";

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
      <button type="button" className="btn btn-secondary" disabled style={{ width: "100%" }}>
        אזל מהמלאי<span className="visually-hidden">: {productName}</span>
      </button>
    );
  }

  if (quantity === 0) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        style={{ width: "100%" }}
        onClick={() => cartActions.add(productId, max)}
      >
        הוספה לעגלה<span className="visually-hidden">: {productName}</span>
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
