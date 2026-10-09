"use client"; // Replaces the root layout when it fails, so it needs its own <html> and <body>

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: "Arial, sans-serif", padding: "2rem", textAlign: "center" }}>
        <h1>משהו השתבש</h1>
        <p>האתר נתקל בשגיאה. נסו לרענן את העמוד.</p>
        <button type="button" onClick={() => retry()} style={{ padding: "0.6rem 1.2rem", fontSize: "1rem" }}>
          לנסות שוב
        </button>
      </body>
    </html>
  );
}
