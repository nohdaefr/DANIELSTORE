"use client";

import Link from "next/link";
import { formatAgorot, formatPrice } from "@/lib/format";
import ProductImage from "../ProductImage";
import { useCartSummary } from "./useCartSummary";
import styles from "./MiniCart.module.css";

/** Always-visible cart next to the catalog (wide screens only). */
export default function MiniCart() {
  const { hydrated, lines, products, count, subtotalAgorot } = useCartSummary();
  const productsById = products.status === "ready" ? products.productsById : null;

  return (
    <div className={styles.box} data-testid="mini-cart">
      <div className={styles.head}>
        <h2 className={styles.title}>העגלה שלי</h2>
        {hydrated && count > 0 && <span className={styles.count}>{count === 1 ? "פריט אחד" : `${count} פריטים`}</span>}
      </div>

      {!hydrated ? (
        <div className={styles.loading}>
          <div className="skeleton" style={{ height: 48 }} />
          <div className="skeleton" style={{ height: 48 }} />
        </div>
      ) : products.status === "error" ? (
        <div className={styles.empty}>
          <p>לא הצלחנו לטעון את המחירים. העגלה שמורה.</p>
          <button type="button" className="btn btn-secondary" onClick={products.retry}>
            טעינה מחדש
          </button>
        </div>
      ) : lines.length === 0 ? (
        <div className={styles.empty}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="9.5" cy="19.5" r="1.2" fill="currentColor" />
            <circle cx="17" cy="19.5" r="1.2" fill="currentColor" />
          </svg>
          <p>העגלה ריקה. מוצרים שתוסיפו מהמדף יופיעו כאן.</p>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {lines.map((line) => {
              const product = productsById?.get(line.productId);
              return (
                <li key={line.productId} className={styles.line}>
                  {product ? (
                    <>
                      <ProductImage product={product} size="mini" />
                      <div className={styles.info}>
                        <span className={styles.name}>{product.name}</span>
                        <span className={styles.qty}>
                          {line.quantity} × {formatPrice(product.price)}
                        </span>
                      </div>
                    </>
                  ) : productsById ? (
                    <span className={styles.gone}>מוצר שאינו זמין עוד</span>
                  ) : (
                    <div className="skeleton" style={{ height: 48, flex: 1 }} />
                  )}
                </li>
              );
            })}
          </ul>
          <div className={styles.total}>
            <span>סכום ביניים</span>
            <strong data-testid="mini-subtotal">{subtotalAgorot === null ? "…" : formatAgorot(subtotalAgorot)}</strong>
          </div>
          <Link href="/cart" className={`btn btn-primary ${styles.checkout}`}>
            מעבר לעגלה ולהזמנה
          </Link>
        </>
      )}
    </div>
  );
}
