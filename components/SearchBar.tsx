import Form from "next/form";
import { MAX_SEARCH_LENGTH } from "@/lib/validation";
import styles from "./SearchBar.module.css";

interface SearchBarProps {
  query: string;
  categorySlug: string | null;
}

/**
 * GET form: submitting navigates to /?q=...  (works without JavaScript too).
 * The selected category is kept via a hidden field.
 */
export default function SearchBar({ query, categorySlug }: SearchBarProps) {
  return (
    <Form action="/" className={styles.form} role="search" scroll={false}>
      <label htmlFor="search" className="visually-hidden">
        חיפוש מוצרים
      </label>
      <svg className={styles.icon} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        key={query} // reset the field when the URL's query changes
        id="search"
        name="q"
        type="search"
        defaultValue={query}
        maxLength={MAX_SEARCH_LENGTH}
        placeholder="חיפוש מוצר: חלב, פיתות, טחינה…"
        className={styles.input}
        autoComplete="off"
        enterKeyHint="search"
      />
      {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
      <button type="submit" className={styles.submit}>
        חיפוש
      </button>
    </Form>
  );
}
