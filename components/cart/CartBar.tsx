"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatAgorot } from "@/lib/format";
import { useCartSummary } from "./useCartSummary";
import styles from "./CartBar.module.css";

/**
 * Phones and tablets: the cart total stays one tap away at the bottom of the
 * screen. Hidden on the cart page itself and when the cart is empty.
 */
export default function CartBar() {
  const pathname = usePathname();
  const { hydrated, count, subtotalAgorot } = useCartSummary();
  if (!hydrated || count === 0 || pathname === "/cart") return null;

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <aside className={styles.bar} aria-label="סיכום העגלה">
        <Link href="/cart" className={styles.link} data-testid="cart-bar">
          <span className={styles.count} aria-hidden="true">
            {count > 99 ? "99+" : count}
          </span>
          <span className={styles.label}>לצפייה בעגלה</span>
          <span className="visually-hidden">, {count} פריטים</span>
          <span className={styles.total}>{subtotalAgorot === null ? "" : formatAgorot(subtotalAgorot)}</span>
        </Link>
      </aside>
    </>
  );
}
