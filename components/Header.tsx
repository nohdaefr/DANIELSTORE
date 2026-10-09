import Link from "next/link";
import CartLink from "./cart/CartLink";
import styles from "./Header.module.css";

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">
            ס
          </span>
          <span className={styles.logoText}>סופר שכונתי</span>
        </Link>

        <nav aria-label="ניווט ראשי">
          <CartLink />
        </nav>
      </div>
    </header>
  );
}
