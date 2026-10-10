"use client";

import { useSearchParams } from "next/navigation";
import { sanitizeSearch } from "@/lib/validation";
import SearchBar from "./SearchBar";

/** Search box in the header. Keeps the current aisle when searching inside it. */
export default function HeaderSearch() {
  const params = useSearchParams();
  const category = params.get("category");
  return <SearchBar query={sanitizeSearch(params.get("q") ?? "")} categorySlug={category && /^[a-z0-9-]{1,40}$/.test(category) ? category : null} />;
}
