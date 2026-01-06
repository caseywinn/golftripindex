import Airtable from "airtable";

export const revalidate = 0;

export default async function AirtableDebugPage() {
  const baseId = process.env.AIRTABLE_BASE_ID!;
  const apiKey = process.env.AIRTABLE_API_KEY!;
  Airtable.configure({ apiKey });
  const base = Airtable.base(baseId);

  const records = await base("GolfTrips")
    .select({ maxRecords: 20 })
    .all();

  const rows = records.map((r) => ({
    id: r.id,
    name: r.get("Name"),
    slug: r.get("Slug"),
    status: r.get("Status"),
  }));

  return (
    <main>
      <h1 className="text-2xl font-bold">Airtable Debug</h1>
      <pre className="mt-6 text-xs overflow-auto border p-4 rounded">
        {JSON.stringify(rows, null, 2)}
      </pre>
    </main>
  );
}
