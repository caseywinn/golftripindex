type CoursePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function CoursePage({ params }: CoursePageProps) {
  const { slug } = await params;

  return (
    <main>
      <h1 className="text-3xl font-bold">Course</h1>
      <p className="mt-2 text-gray-600">
        Slug: <span className="font-mono">{slug}</span>
      </p>
    </main>
  );
}
