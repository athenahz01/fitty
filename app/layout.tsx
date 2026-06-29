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
    default: "Admira | Fit and Honest Chance",
    template: "%s | Admira",
  },
  description:
    "Honest college admissions odds rendered as public-data prior ranges, levers, and uncertainty disclosures.",
  applicationName: "Admira",
  openGraph: {
    title: "Admira | Fit and Honest Chance",
    description:
      "College admissions planning ranges grounded in public data, with clear limits on what cannot be known.",
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
