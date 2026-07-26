import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sentinel Studio — AI Code Reliability & Self-Healing",
  description:
    "Multi-agent AI reliability benchmarking and self-healing system built with OpenAI Codex.",
  openGraph: {
    title: "Sentinel Studio — AI Code Reliability & Self-Healing",
    description:
      "Multi-agent AI reliability benchmarking and self-healing system.",
    url: "https://sentinel-studio-sigma.vercel.app/",
    siteName: "Sentinel Studio",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Sentinel Studio — AI Code Reliability & Self-Healing",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sentinel Studio — AI Code Reliability & Self-Healing",
    description:
      "Multi-agent AI reliability benchmarking and self-healing system.",
    images: ["/og-image.png"],
  },
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
