import { getAllTripsWithCoursesForCaddie } from "@/lib/airtable";
import type { CaddieTrip } from "@/lib/airtable";

// Shared, cached catalog for the plan surfaces. Both the Caddie route (LLM
// intent → filter_trips) and the /plan intake route (questionnaire → filter)
// read the same pool, so a page-gating intake submit doesn't hit Airtable —
// Airtable content is updated ~monthly, so a 1-hour TTL is plenty.

let _cache: CaddieTrip[] | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function getCaddieData(): Promise<CaddieTrip[]> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;
  _cache = await getAllTripsWithCoursesForCaddie();
  _cacheTime = Date.now();
  return _cache;
}
