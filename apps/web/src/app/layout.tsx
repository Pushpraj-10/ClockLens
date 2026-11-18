import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "../lib/themeCore";

export const metadata = {
  title: "ClockLens",
  description: "Interactive Lamport and vector clock visualizer",
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efeff1" },
    { media: "(prefers-color-scheme: dark)", color: "#09080b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script sets data-theme on <html> before React loads
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only z-20 rounded-full bg-primary px-4 py-2 text-primary-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
