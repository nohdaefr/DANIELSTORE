import type { NextConfig } from "next";
import { assertNoPublicSecrets } from "./lib/env-guard";

// Fail the build/dev server if a secret key was put in a NEXT_PUBLIC_ variable
// (those are inlined into the JavaScript every visitor downloads).
assertNoPublicSecrets(process.env);

// Allow next/image to load product photos from this project's Supabase Storage.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const storagePattern = supabaseUrl && URL.canParse(supabaseUrl) ? new URL(supabaseUrl) : null;

// Security headers for every response
const securityHeaders = [
  // Nobody may show this site inside a frame (clickjacking protection)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()" },
  // Only takes effect over HTTPS (browsers ignore it on http://localhost)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false, // don't advertise the framework/version

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  images: {
    remotePatterns: storagePattern
      ? [
          {
            protocol: storagePattern.protocol === "http:" ? "http" : "https",
            hostname: storagePattern.hostname,
            port: storagePattern.port,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },

  // The catalog now lives on the homepage; keep old /products links working.
  async redirects() {
    return [{ source: "/products", destination: "/", permanent: false }];
  },
};

export default nextConfig;
