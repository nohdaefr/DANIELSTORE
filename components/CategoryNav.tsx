import Link from "next/link";
import type { Category } from "@/types";
import CategoryIcon from "./CategoryIcon";
import styles from "./CategoryNav.module.css";

interface CategoryNavProps {
  categories: Category[];
  activeSlug: string | null;
  query: string;
}

function hrefFor(slug: string | null, query: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (slug) params.set("category", slug);
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

/** Aisle chips. Selecting one keeps the current search text. */
export default function CategoryNav({ categories, activeSlug, query }: CategoryNavProps) {
  const items: { slug: string | null; name: string }[] = [
    { slug: null, name: "הכל" },
    ...categories.map((c) => ({ slug: c.slug, name: c.name })),
  ];

  return (
    <nav aria-label="מחלקות" className={styles.nav}>
      <ul className={styles.list}>
        {items.map((item) => {
          const active = item.slug === activeSlug;
          return (
            <li key={item.slug ?? "all"}>
              <Link
                href={hrefFor(item.slug, query)}
                className={styles.chip}
                aria-current={active ? "page" : undefined}
                scroll={false}
              >
                {item.slug && <CategoryIcon slug={item.slug} className={styles.icon} />}
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
