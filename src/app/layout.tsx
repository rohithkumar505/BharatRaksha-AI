import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

const display = Sora({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BharatRaksha AI — The AI Shield for Every Disaster",
  description:
    "AI-powered Disaster Response Intelligence Platform for India. Predict, respond, rescue, and recover with one multilingual AI assistant.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full`}>
      <body className="min-h-full antialiased">
        <SiteHeader />
        <main className="pb-16 pt-6">{children}</main>
      </body>
    </html>
  );
}
