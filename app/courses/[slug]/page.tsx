type CoursePageProps = {
  params: { slug: string };
};

export default function CoursePage({ params }: CoursePageProps) {
  return (
    <main>
      <h1 className="text-3xl font-bold">Course</h1>
      <p className="mt-2 text-gray-600">
        Slug: <span className="font-mono">{params.slug}</span>
      </p>
    </main>
  );
}