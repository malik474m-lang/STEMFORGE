import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Manrope, Unbounded } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "STEMFORGE — разделение трека на вокал, инструментал и дорожки",
  description:
    "Студия разделения аудио: вокал, инструментал, бэк-вокал, бас, ударные. Улучшение звука, экспорт в WAV и MP3, история проектов. Работает прямо в браузере на Windows.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.png", apple: "/icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#04050a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable}`}>
      <body className="bg-void font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
