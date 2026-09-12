import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SNAKE / 97 — Pocket Arcade",
  description: "Play the pocket classic with three difficulties and saved scores.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

