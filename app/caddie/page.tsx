import type { Metadata } from "next";
import CaddieClient from "./CaddieClient";

export const metadata: Metadata = {
  title: "GTI Caddie | GolfTripIndex",
  description:
    "Collaborative golf trip planning tool. Create or join a room to plan your next trip with your group.",
  robots: { index: false, follow: false },
};

export default function CaddieHomePage() {
  return <CaddieClient />;
}
