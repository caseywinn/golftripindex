import CompareClient from "../CompareClient";

function parseFromParams(matchup?: string[]): { A: string; B: string } | null {
  if (!matchup || matchup.length === 0) return null;

  // /compare/A/B
  if (matchup.length >= 2) {
    const A = decodeURIComponent(matchup[0] ?? "").trim();
    const B = decodeURIComponent(matchup[1] ?? "").trim();
    if (!A || !B || A === B) return null;
    return { A, B };
  }

  // /compare/A-vs-B
  const raw = matchup[0];
  if (!raw) return null;

  const parts = raw.split("-vs-");
  if (parts.length !== 2) return null;

  const A = decodeURIComponent(parts[0] ?? "").trim();
  const B = decodeURIComponent(parts[1] ?? "").trim();
  if (!A || !B || A === B) return null;

  return { A, B };
}

export default function ComparePage({
  params,
}: {
  params: { matchup?: string[] };
}) {
  const parsed = parseFromParams(params?.matchup);

  return (
    <CompareClient
      initialA={parsed?.A ?? ""}
      initialB={parsed?.B ?? ""}
    />
  );
}