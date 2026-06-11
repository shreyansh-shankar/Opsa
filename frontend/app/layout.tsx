import type { Metadata } from "next";
import { Source_Serif_4, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const serifFont = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
});

const sansFont = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Opsa | MissionOS",
  description: "A declarative, command-driven operational runtime for human responsibilities and commitments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${serifFont.variable} ${sansFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
