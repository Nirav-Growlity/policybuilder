import type { Metadata } from "next";
import { DOCUMENT_FONT_FACE_CSS_ALL } from "@/lib/document-fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "PolicyCraft — Sustainability Policy Builder",
  description:
    "Author production-grade environmental, labour and human-rights, and living-wage policies in minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <head>
        {/* Self-hosted OFL document fonts. Injected as <style> so the CSS
            pipeline never has to parse the generated @font-face rules. */}
        <style dangerouslySetInnerHTML={{ __html: DOCUMENT_FONT_FACE_CSS_ALL }} />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--color-cream)] text-[var(--color-ink)]">
        {children}
      </body>
    </html>
  );
}
