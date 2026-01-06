export default function Footer() {
  return (
    <footer className="border-t mt-16">
      <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-gray-600">
        <div className="flex flex-col gap-2">
          <p>© {new Date().getFullYear()} GolfTripIndex</p>
          <p>
            Independent rankings. Not affiliated with Golf Digest, Golfweek, or any resort.
          </p>
        </div>
      </div>
    </footer>
  );
}
