import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Caliper Arc Pro — Sound, Precisely Measured",
  description:
    "Premium wireless over-ear headphones with adaptive noise cancellation, 40-hour battery, and Hi-Res Audio certification. Engineered for the discerning ear.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable} h-full`}>
      <body className="min-h-full bg-[#F5F3EE] text-[#111111] antialiased">
        {children}
      </body>
    </html>
  );
}
