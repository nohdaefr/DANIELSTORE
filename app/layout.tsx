import type { Metadata, Viewport } from "next";
import Header from "@/components/Header";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "סופר שכונתי | קניות אונליין",
  description: "פרויקט לימודי של סופרמרקט אונליין בעברית",
};

export const viewport: Viewport = {
  themeColor: "#1f5f3f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={fontVariables}>
      <body>
        <a href="#main" className="skip-link">
          דילוג לתוכן הראשי
        </a>
        <Header />
        <main id="main" tabIndex={-1} className="container main">
          {children}
        </main>
        <footer className="footer">
          <div className="container">סופר שכונתי — פרויקט לימודי. המחירים להמחשה בלבד.</div>
        </footer>
      </body>
    </html>
  );
}
