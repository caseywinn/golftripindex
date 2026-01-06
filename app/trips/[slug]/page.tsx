import { notFound } from "next/navigation";
import { getTripBySlugMock } from "@/lib/mock-data";

function dollars(costTier: number) {
  return "$".repeat(costTier);
}

export default function TripPage({ params }: { params: { slug: string } }) {
  const trip = getTripBySlugMock(params.slug);
  if (!trip) return notFound();

  return (
    <main>
      <div className="flex flex-col gap-2">
        <div className="text-sm text-gray-500">
          Rank {trip.currentRanking ?? "—"} · {dollars(trip.costTier)} · {trip.durationMinDays}–{trip.durationMaxDays} days · {trip.stayType.replace("_", " ")}
        </div>
        <h1 className="text-4xl font-bold">{trip.name}</h1>
        {trip.secondaryName && (
          <p className="text-lg text-gray-600">{trip.secondaryName}</p>
        )}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Overall", trip.overallRating],
          ["Golf", trip.golfRating],
          ["Lodging", trip.lodgingRating],
          ["Food", trip.foodRating],
          ["Vibe", trip.vibeRating],
        ].map(([label, val]) => (
          <div key={label as string} className="rounded-lg border p-4">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{Number(val).toFixed(1)}</div>
          </div>
        ))}
      </div>

      {trip.overview && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Overview</h2>
          <p className="mt-2 text-gray-700">{trip.overview}</p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Course Stack</h2>
        <div className="mt-4 grid gap-3">
          {trip.courses.map((c) => (
            <div key={c.course.id} className="rounded-lg border p-4 flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">#{c.tripCourseRank} · {c.status.replace("_", " ")}</div>
                <div className="text-lg font-semibold">{c.course.name}</div>
                {c.course.consolidatedRanking != null && (
                  <div className="text-sm text-gray-600">
                    Consolidated ranking: {c.course.consolidatedRanking}
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-600">
                {c.roundsPlanned ? `${c.roundsPlanned} rounds` : ""}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
