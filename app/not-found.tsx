import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-2 text-gray-600">
        The page you’re looking for doesn’t exist.
      </p>
      <div className="mt-6">
        <Link href="/trips" className="hover:underline">
          Browse trips
        </Link>
      </div>
    </main>
  );
}
