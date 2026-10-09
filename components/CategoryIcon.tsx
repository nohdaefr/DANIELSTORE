// Simple line illustrations per category, used when a product has no photo.
// Keyed by category slug (generic artwork — not product data).

const paths: Record<string, React.ReactNode> = {
  "dairy-eggs": (
    <>
      <path d="M22 14h20l4 10v30a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V24z" />
      <path d="M18 24h28M24 8h16v6H24z" />
      <ellipse cx="32" cy="40" rx="6" ry="8" />
    </>
  ),
  bakery: (
    <>
      <path d="M10 34c0-10 10-16 22-16s22 6 22 16v12a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" />
      <path d="M22 26l-3 8M32 24v9M42 26l3 8" />
    </>
  ),
  "fruits-vegetables": (
    <>
      <path d="M32 22c-4-4-14-4-16 6-2 12 6 26 12 26 2 0 3-1 4-1s2 1 4 1c6 0 14-14 12-26-2-10-12-10-16-6z" />
      <path d="M32 22c0-6 2-10 6-12M33 16c4-2 9-1 10 2-4 2-8 1-10-2z" />
    </>
  ),
  pantry: (
    <>
      <path d="M20 18h24v6l4 6v22a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V30l4-6z" />
      <path d="M18 10h28v8H18zM16 34h32v12H16z" />
    </>
  ),
  drinks: (
    <>
      <path d="M27 6h10v8l5 8v32a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V22l5-8z" />
      <path d="M22 30h20M22 44h20" />
    </>
  ),
};

const basket = (
  <>
    <path d="M8 26h48l-6 26a4 4 0 0 1-4 3H18a4 4 0 0 1-4-3z" />
    <path d="M20 26l8-14M44 26l-8-14M24 36v10M32 36v10M40 36v10" />
  </>
);

export default function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[slug] ?? basket}
    </svg>
  );
}
