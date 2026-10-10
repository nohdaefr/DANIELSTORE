import Link from "next/link";
import { Suspense } from "react";
import CategoryNav from "@/components/CategoryNav";
import ProductGrid, { ProductGridSkeleton } from "@/components/ProductGrid";
import ShelfHero from "@/components/ShelfHero";
import StatusMessage from "@/components/StatusMessage";
import RetryButton from "@/components/RetryButton";
import MiniCart from "@/components/cart/MiniCart";
import { logServerError, newRequestId } from "@/lib/api";
import { CatalogError, getCatalog } from "@/lib/catalog";
import { SupabaseConfigError } from "@/lib/supabase";
import { parseCatalogFilters } from "@/lib/validation";
import styles from "./page.module.css";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className={styles.layout}>
      <div className={styles.catalog}>
        {/* searchParams and the database are request-time data, so they
            stream in behind a skeleton (required with Cache Components). */}
        <Suspense fallback={<StorefrontSkeleton />}>
          <Storefront searchParams={searchParams} />
        </Suspense>
      </div>
      <aside className={styles.sidebar} aria-label="העגלה שלי">
        <MiniCart />
      </aside>
    </div>
  );
}

async function Storefront({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const filters = parseCatalogFilters(await searchParams);

  let catalog;
  try {
    catalog = await getCatalog(filters);
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return (
        <>
          <ShelfHero />
          <SetupNotice />
        </>
      );
    }
    if (error instanceof CatalogError) {
      logServerError(newRequestId(), "storefront: catalog unavailable", error.cause ?? error); // server log only, redacted
      return (
        <>
          <ShelfHero />
          <CatalogUnavailable />
        </>
      );
    }
    throw error; // anything unexpected -> app/error.tsx
  }

  const { categories, activeCategory, products } = catalog;
  const browsing = !filters.query && !activeCategory && !filters.categorySlug;
  const heading = filters.query ? `תוצאות חיפוש: ${filters.query}` : (activeCategory?.name ?? "כל המוצרים");
  const Heading = browsing ? "h2" : "h1";

  return (
    <>
      {browsing && <ShelfHero />}
      <CategoryNav categories={categories} activeSlug={activeCategory?.slug ?? null} query={filters.query} />

      <section aria-labelledby="results-title" className={styles.results}>
        <div className={styles.resultsHeader}>
          <Heading id="results-title" className={styles.resultsTitle}>
            {heading}
          </Heading>
          <p className={styles.count} aria-live="polite">
            {filters.query && activeCategory ? `במחלקת ${activeCategory.name}, ` : ""}
            {products.length === 1 ? "מוצר אחד" : `${products.length} מוצרים`}
          </p>
        </div>

        {products.length > 0 ? (
          <ProductGrid products={products} headingLevel={browsing ? 3 : 2} />
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
    </>
  );
}

function StorefrontSkeleton() {
  return (
    <div aria-busy="true" aria-label="טוען מוצרים" className={styles.skeleton}>
      <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
      <div className="skeleton" style={{ height: 56, borderRadius: 16 }} />
      <div className="skeleton" style={{ height: 32, width: 180 }} />
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
