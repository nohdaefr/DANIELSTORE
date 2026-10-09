"use client";

import styles from "./QuantityStepper.module.css";

interface QuantityStepperProps {
  quantity: number;
  max: number;
  productName: string;
  onChange: (quantity: number) => void;
  size?: "md" | "lg";
}

/** − qty + control. Going below 1 removes the item (onChange(0)). */
export default function QuantityStepper({ quantity, max, productName, onChange, size = "md" }: QuantityStepperProps) {
  return (
    <div className={`${styles.stepper} ${size === "lg" ? styles.lg : ""}`} role="group" aria-label={`כמות של ${productName}`}>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= max}
        aria-label={`הוספת יחידה של ${productName}`}
      >
        +
      </button>
      <output className={styles.value} aria-live="polite" data-testid="qty">
        {quantity}
      </output>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(quantity - 1)}
        aria-label={quantity === 1 ? `הסרת ${productName} מהעגלה` : `הפחתת יחידה של ${productName}`}
      >
        −
      </button>
    </div>
  );
}
