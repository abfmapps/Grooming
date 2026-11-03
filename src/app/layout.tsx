import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ABFM Grooming Control",
  description: "Al Bonian FM grooming, etiquette and work efficiency: daily checklist and management review",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#333447" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
