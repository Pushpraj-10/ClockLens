import "./globals.css";

export const metadata = {
  title: "ClockLens",
  description: "Interactive Lamport and vector clock visualizer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
