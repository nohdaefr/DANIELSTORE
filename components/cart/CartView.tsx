"use client";

import Link from "next/link";
import { calculateTotals, countItems } from "@/lib/cart";
import { cartActions } from "@/lib/cart-store";
import { formatAgorot } from "@/lib/format";
import StatusMessage from "../StatusMessage";
import CartItem, { CartItemSkeleton, UnavailableCartItem } from "./CartItem";
import { useCartLines, useHydrated } from "./useCart";
import { useCartProducts } from "./useCartProducts";
import styles from "./CartView.module.css";

export default function CartView() {
  const hydrated = useHydrated();
  const lines = useCartLines();
  const products = useCartProducts(lines.map((line) => line.productId));

  // 1) localStorage not read yet -> loading (avoids flashing "empty")
  if (!hydrated) return <CartSkeleton rows={2} />;

  // 2) Empty cart
  if (lines.length === 0) {
    return (
      <StatusMessage
        title="העגלה ריקה"
        action={
          <Link href="/" className="btn btn-primary">
            למעבר למוצרים
          </Link>
        }
      >
        <p>מוצרים שתוסיפו יופיעו כאן, וישמרו גם אם תסגרו את הדפדפן.</p>
      </StatusMessage>
    );
  }

  // 3) Loading current prices from the server
  if (products.status === "loading" || products.status === "idle") {
    return <CartSkeleton rows={lines.length} />;
  }

  // 4) Server/network error
  if (products.status === "error") {
    return (
      <StatusMessage
        title="לא הצלחנו לטעון את המחירים"
        tone="error"
        action={
          <button type="button" className="btn btn-primary" onClick={products.retry}>
            לנסות שוב
          </button>
        }
      >
        <p>העגלה שלכם שמורה. בדקו את החיבור ונסו שוב.</p>
      </StatusMessage>
    );
  }

  // 5) Ready
  const { productsById } = products;
  const { subtotalAgorot, unavailableIds } = calculateTotals(lines, productsById);
  const availableLines = lines.filter((line) => productsById.has(line.productId));
  const itemCount = countItems(availableLines);

  return (
    <div className={styles.layout}>
      <section aria-label="מוצרים בעגלה" className={styles.items}>
        {unavailableIds.length > 0 && (
          <p className={styles.notice} role="status">
            {unavailableIds.length === 1
              ? "מוצר אחד בעגלה כבר לא זמין ולא ייכלל בהזמנה."
              : `${unavailableIds.length} מוצרים בעגלה כבר לא זמינים ולא ייכללו בהזמנה.`}
          </p>
        )}
        <ul className={styles.list}>
          {lines.map((line) => {
            const product = productsById.get(line.productId);
            return (
              <li key={line.productId}>
                {product ? (
                  <CartItem product={product} quantity={line.quantity} />
                ) : (
                  <UnavailableCartItem productId={line.productId} />
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className={styles.clear} onClick={() => cartActions.clear()}>
          ריקון העגלה
        </button>
      </section>

      <aside className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title" className={styles.summaryTitle}>
          סיכום
        </h2>
        <dl className={styles.totals}>
          <div>
            <dt>פריטים</dt>
            <dd data-testid="item-count">{itemCount}</dd>
          </div>
          <div className={styles.subtotal}>
            <dt>סכום ביניים</dt>
            <dd data-testid="subtotal">{formatAgorot(subtotalAgorot)}</dd>
          </div>
        </dl>
        <p className={styles.fineprint}>
          המחירים מתעדכנים מהמלאי. הסכום הסופי מחושב מחדש בשרת בזמן ביצוע ההזמנה.
        </p>
        <button type="button" className="btn btn-primary" disabled style={{ width: "100%" }}>
          מעבר לתשלום
        </button>
        <p className={styles.fineprint}>התשלום וההתחברות יתווספו בשלב הבא של הפרויקט.</p>
      </aside>
    </div>
  );
}

function CartSkeleton({ rows }: { rows: number }) {
  return (
    <div className={styles.layout} aria-busy="true" aria-label="טוען את העגלה" data-testid="cart-loading">
      <div className={styles.items}>
        <ul className={styles.list}>
          {Array.from({ length: Math.min(rows, 6) }, (_, i) => (
            <li key={i}>
              <CartItemSkeleton />
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.summary}>
        <div className="skeleton" style={{ height: 28, width: "50%" }} />
        <div className="skeleton" style={{ height: 64 }} />
        <div className="skeleton" style={{ height: 44 }} />
      </div>
    </div>
  );
}
