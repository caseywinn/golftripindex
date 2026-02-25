import type { Metadata } from "next";
import CompareClient from "./CompareClient";

export const metadata: Metadata = {
  title: "Compare Trips",
  robots: { index: false, follow: false },
};

export default function ComparePage() {
  return (
    <main>
      <CompareClient />
    </main>
  );
}
