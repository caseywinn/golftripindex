import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: {
    default: "GolfTripIndex",
    template: "%s | GolfTripIndex",
  },
  description: "Ranking the best golf trips",
  metadataBase: new URL("https://golftripindex.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900">
        <Header />

        <div className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </div>

        <Footer />
      </body>
    </html>
  );
}
