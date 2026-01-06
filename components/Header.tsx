import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg">
          GolfTripIndex
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          <Link href="/trips" className="hover:underline">
            Trips
          </Link>
          {/* Add Courses later if/when you build it */}
          {/* <Link href="/courses" className="hover:underline">Courses</Link> */}
        </nav>
      </div>
    </header>
  );
}
