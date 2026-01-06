import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1 className="text-4xl font-bold">GolfTripIndex</h1>
      <p className="mt-4 text-lg text-gray-600 max-w-2xl">
        Rankings and reviews of the world’s best golf trips—built for golfers who care about the full experience:
        golf, lodging, food, logistics, and vibe.
      </p>

      <div className="mt-8">
        <Link
          href="/trips"
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Browse Trips
        </Link>
      </div>
    </main>
  );
}