import { permanentRedirect } from "next/navigation";

// Legacy URL. It used to bounce through /trips/top100/1, which itself bounced to
// /trips?top100=1 — a two-hop temporary chain ending on a path robots.txt blocks,
// so crawlers just hit a dead end. Nothing links here anymore; send it straight
// to the rankings in a single permanent hop.
export default function Top100RedirectPage() {
  permanentRedirect("/trips");
}
