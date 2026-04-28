import { redirect } from "next/navigation";

export default function Top100RedirectPage() {
  redirect("/trips/top100/1");
}
