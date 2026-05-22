import "./globals.css";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import { Inter, Inter_Tight } from "next/font/google";
import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import CaddieWidget from "@/components/CaddieWidget";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-nav",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-primary",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Ranking USA's Best Golf Trips`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Golf Trip Index ranks America's best golf trips on courses, lodging, food, cost, and vibe — the only guide built for group trip planning.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const siteSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/logo-gti.png`,
        },
        sameAs: ["https://www.instagram.com/golftripindex"],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/trips?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <body>
        <GoogleAnalytics />
        <JsonLd data={siteSchema} />
        <SessionProviderWrapper>
          <SiteHeader />
          {children}
<SiteFooter />
          <CaddieWidget />
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
