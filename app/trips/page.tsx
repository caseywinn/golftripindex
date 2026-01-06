import Link from "next/link";
import { getPublishedTrips } from "@/lib/airtable";

export const revalidate = 600; // 10 minutes

function dollars(costTier: number) {
  return "$".repeat(costTier);
}

export default async function TripsPage() {
  const trips = await getPublishedTrips();

  return (
    <main>
      <h1 className="text-3xl font-bold">Trips</h1>
      <p className="mt-2 text-gray-600">
        Ranked golf trips based on golf, lodging, food, and overall experience.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((t) => (
          <Link
            key={t.id}
            href={`/trips/${t.slug}`}
            className="rounded-lg border hover:bg-gray-50 transition"
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-gray-500">
                    Rank {t.currentRanking ?? "—"} · {dollars(t.costTier)} · {t.durationMinDays}–{t.durationMaxDays} days
                  </div>
                  <div className="mt-1 text-lg font-semibold">{t.name}</div>
                  {t.secondaryName && (
                    <div className="text-sm text-gray-600">{t.secondaryName}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Overall</div>
                  <div className="text-lg font-semibold">{t.overallRating.toFixed(1)}</div>
                </div>
              </div>

              {t.overview && (
                <p className="mt-3 text-sm text-gray-600 line-clamp-3">
                  {t.overview}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
