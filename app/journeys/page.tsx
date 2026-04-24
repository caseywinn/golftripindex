import { redirect } from "next/navigation";

export default function JourneysPage() {
  redirect("/trips?days=6-10");
}
