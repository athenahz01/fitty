import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Plus_Jakarta_Sans,
  Space_Mono,
} from "next/font/google";
import "./globals.css";
import { AdmiraProfileProvider } from "./admira-profile";

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["800"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-data",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Admira | Your College Chances",
    template: "%s | Admira",
  },
  description:
    "See your real admissions chances at every school, find schools that fit, and build a balanced college list — for the US and Canada.",
  applicationName: "Admira",
  openGraph: {
    title: "Admira | Your College Chances",
    description:
      "See your chances at every college, find schools that fit, and plan your applications — grounded in public data.",
    type: "website",
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
      className={`${bricolage.variable} ${plusJakarta.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <AdmiraProfileProvider>{children}</AdmiraProfileProvider>
      </body>
    </html>
  );
}
