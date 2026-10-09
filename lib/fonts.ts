import localFont from "next/font/local";

// Fonts are bundled from npm (@fontsource, OFL license), so the build
// never depends on reaching Google Fonts. Each script is its own family
// and they are stacked in CSS, so Hebrew and Latin/digits both render.

export const assistantHebrew = localFont({
  src: "../node_modules/@fontsource-variable/assistant/files/assistant-hebrew-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-body-he",
  display: "swap",
});

export const assistantLatin = localFont({
  src: "../node_modules/@fontsource-variable/assistant/files/assistant-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-body-latin",
  display: "swap",
});

export const karantinaHebrew = localFont({
  src: "../node_modules/@fontsource/karantina/files/karantina-hebrew-700-normal.woff2",
  weight: "700",
  variable: "--font-display-he",
  display: "swap",
});

export const karantinaLatin = localFont({
  src: "../node_modules/@fontsource/karantina/files/karantina-latin-700-normal.woff2",
  weight: "700",
  variable: "--font-display-latin",
  display: "swap",
});

export const fontVariables = [assistantHebrew, assistantLatin, karantinaHebrew, karantinaLatin]
  .map((font) => font.variable)
  .join(" ");
