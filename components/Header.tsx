import Link from "next/link";
import { Suspense } from "react";
import CartLink from "./cart/CartLink";
import HeaderSearch from "./HeaderSearch";
import SearchBar from "./SearchBar";
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

        <div className={styles.search}>
          {/* The search box reads ?q= from the URL, which is request-time data */}
          <Suspense fallback={<SearchBar query="" categorySlug={null} />}>
            <HeaderSearch />
          </Suspense>
        </div>

        <nav aria-label="ניווט ראשי" className={styles.nav}>
          <CartLink />
        </nav>
      </div>
    </header>
  );
}
