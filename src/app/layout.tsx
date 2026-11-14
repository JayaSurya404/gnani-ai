import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoiceNexus AI — Multilingual Voice AI & Intelligent Lead Qualification",
  description:
    "Enterprise AI voice platform connecting inbound web visitors to real carrier telephone conversations in seconds. Powered by Gnani AI multilingual speech models and Gemini intelligence.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF9F5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="min-h-screen bg-[#FAF9F5] text-[#0F172A] antialiased selection:bg-orange-500/20 selection:text-orange-700">
        {children}
        <Toaster
          theme="light"
          position="top-right"
          richColors
          toastOptions={{
            style: {
              background: "rgba(255, 255, 255, 0.95)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              color: "#192238",
              boxShadow: "0 10px 30px -5px rgba(112, 101, 232, 0.08)",
            },
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
