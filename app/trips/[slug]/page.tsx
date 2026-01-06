type TripPageProps = {
  params: { slug: string };
};

export default function TripPage({ params }: TripPageProps) {
  return (
    <main>
      <h1 className="text-3xl font-bold">Trip</h1>
      <p className="mt-2 text-gray-600">
        Slug: <span className="font-mono">{params.slug}</span>
      </p>
    </main>
  );
}
