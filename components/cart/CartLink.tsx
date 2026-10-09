"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { countItems } from "@/lib/cart";
import { useCartLines } from "./useCart";
import styles from "./CartLink.module.css";

export default function CartLink() {
  const count = countItems(useCartLines());
  const isActive = usePathname() === "/cart";
  return (
    <Link href="/cart" className={styles.link} aria-current={isActive ? "page" : undefined}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" />
        <circle cx="17" cy="19.5" r="1.4" fill="currentColor" />
      </svg>
      <span className={styles.text}>עגלה</span>
      {count > 0 && (
        <span className={styles.badge} data-testid="cart-count" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
      <span className="visually-hidden">{count === 0 ? ", ריקה" : `, ${count} פריטים`}</span>
    </Link>
  );
}
