"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatPrice } from "@/lib/format";
import type { OrderConfirmation } from "@/types";
import styles from "./OrderSuccess.module.css";

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });

/** Shown after the server created the order. Every number here comes from the database. */
export default function OrderSuccess({ order }: { order: OrderConfirmation }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const created = new Date(order.createdAt);

  return (
    <section className={styles.box} aria-labelledby="order-success-title" data-testid="order-success">
      <div className={styles.check} aria-hidden="true">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 id="order-success-title" ref={headingRef} tabIndex={-1} className={styles.title}>
        ההזמנה התקבלה!
      </h2>
      <p className={styles.lead}>
        מספר הזמנה <strong data-testid="order-id">#{order.orderId}</strong>
        {Number.isNaN(created.getTime()) ? null : <> · {dateFormatter.format(created)}</>}
      </p>

      <table className={styles.table}>
        <caption className="visually-hidden">פירוט ההזמנה</caption>
        <thead>
          <tr>
            <th scope="col">מוצר</th>
            <th scope="col">כמות</th>
            <th scope="col">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.productId}>
              <td>{item.productName}</td>
              <td>
                {item.quantity} × {formatPrice(item.unitPrice)}
              </td>
              <td>{formatPrice(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              לתשלום בעת המסירה
            </th>
            <td data-testid="order-total">{formatPrice(order.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      <p className={styles.note}>שמרו את מספר ההזמנה לכל בירור. הסכומים כאן חושבו בשרת לפי המחירים במלאי.</p>
      <Link href="/" className="btn btn-primary">
        להמשך קניות
      </Link>
    </section>
  );
}
