import Link from "next/link";
import { Suspense } from "react";
import CategoryNav from "@/components/CategoryNav";
import ProductGrid, { ProductGridSkeleton } from "@/components/ProductGrid";
import SearchBar from "@/components/SearchBar";
import StatusMessage from "@/components/StatusMessage";
import RetryButton from "@/components/RetryButton";
import { logServerError, newRequestId } from "@/lib/api";
import { CatalogError, getCatalog } from "@/lib/catalog";
import { SupabaseConfigError } from "@/lib/supabase";
import { parseCatalogFilters } from "@/lib/validation";
import styles from "./page.module.css";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <section className={styles.intro}>
        <h1 className={styles.title}>הסל השבועי, בלי לעמוד בתור</h1>
        <p className={styles.lead}>חלב, לחם, ירקות ומה שעוד חסר בבית. בוחרים, מוסיפים לעגלה, וזהו.</p>
      </section>

      {/* searchParams and the database are request-time data, so they
          stream in behind a skeleton (required with Cache Components). */}
      <Suspense fallback={<StorefrontSkeleton />}>
        <Storefront searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Storefront({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const filters = parseCatalogFilters(await searchParams);

  let catalog;
  try {
    catalog = await getCatalog(filters);
  } catch (error) {
    if (error instanceof SupabaseConfigError) return <SetupNotice />;
    if (error instanceof CatalogError) {
      logServerError(newRequestId(), "storefront: catalog unavailable", error.cause ?? error); // server log only, redacted
      return <CatalogUnavailable />;
    }
    throw error; // anything unexpected -> app/error.tsx
  }

  const { categories, activeCategory, products } = catalog;
  const heading = activeCategory?.name ?? "כל המוצרים";

  return (
    <div className={styles.store}>
      <div className={styles.controls}>
        <SearchBar query={filters.query} categorySlug={activeCategory?.slug ?? null} />
        <CategoryNav categories={categories} activeSlug={activeCategory?.slug ?? null} query={filters.query} />
      </div>

      <section aria-labelledby="results-title">
        <div className={styles.resultsHeader}>
          <h2 id="results-title" className={styles.resultsTitle}>
            {heading}
          </h2>
          <p className={styles.count} aria-live="polite">
            {filters.query ? `${products.length} תוצאות עבור "${filters.query}"` : `${products.length} מוצרים`}
          </p>
        </div>

        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <StatusMessage
            title="לא מצאנו מוצרים"
            action={
              <Link href="/" className="btn btn-secondary">
                הצגת כל המוצרים
              </Link>
            }
          >
            <p>
              {filters.query
                ? `אין מוצרים שמתאימים ל"${filters.query}"${activeCategory ? ` במחלקת ${activeCategory.name}` : ""}.`
                : "אין כרגע מוצרים זמינים במחלקה הזו."}
            </p>
            <p>נסו מילה אחרת או מחלקה אחרת.</p>
          </StatusMessage>
        )}
      </section>
    </div>
  );
}

function StorefrontSkeleton() {
  return (
    <div className={styles.store} aria-busy="true" aria-label="טוען מוצרים">
      <div className={styles.controls}>
        <div className="skeleton" style={{ height: 52 }} />
        <div className="skeleton" style={{ height: 44, width: "70%" }} />
      </div>
      <div className="skeleton" style={{ height: 32, width: 180, marginBottom: "1rem" }} />
      <ProductGridSkeleton />
    </div>
  );
}

function CatalogUnavailable() {
  return (
    <StatusMessage title="לא הצלחנו לטעון את המוצרים" tone="error" action={<RetryButton />}>
      <p>החיבור למסד הנתונים נכשל. נסו שוב בעוד רגע.</p>
    </StatusMessage>
  );
}

function SetupNotice() {
  return (
    <StatusMessage title="החנות עוד לא מחוברת למסד הנתונים" tone="error">
      <p>
        צרו קובץ <code>.env.local</code> לפי <code>.env.example</code> עם כתובת הפרויקט והמפתח מ-Supabase, ואז הפעילו מחדש
        את <code>npm run dev</code>.
      </p>
    </StatusMessage>
  );
}
