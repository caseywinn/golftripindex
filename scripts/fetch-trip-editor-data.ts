/**
 * Fetches all trip data needed for the trip editor skill.
 * Usage: npx dotenv-cli -e .env.local -- npx tsx scripts/fetch-trip-editor-data.ts <slug>
 *
 * Outputs structured JSON with the trip record, all linked records,
 * and a completeness report for each section.
 */
export {};

const API_KEY = process.env.AIRTABLE_API_KEY!;
const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const BASE = `https://api.airtable.com/v0/${BASE_ID}`;

const TABLES = {
  trips:      "tblrGoUOTP5VnoM2F",
  courses:    "tblNI7uox5fs0RhQU",
  tripCourses:"tblTWo6qL0AOWqOCT",
  costRows:   "tblUFRi02u1Y52YXq",
  sideTrips:  "tblvOkUIeTSCuqNzt",
  itinerary:  "tbl5BReb1P5Fy6XhQ",
};

function h() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function get(table: string, formula: string) {
  const url = `${BASE}/${table}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=200`;
  const res = await fetch(url, { headers: h() });
  const data = (await res.json()) as any;
  return data.records ?? [];
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function fieldStatus(fields: Record<string, unknown>, name: string) {
  return isEmpty(fields[name]) ? "empty" : "filled";
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: fetch-trip-editor-data.ts <slug>");
    process.exit(1);
  }

  if (!API_KEY || !BASE_ID) {
    console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
    process.exit(1);
  }

  // ── Trip record ───────────────────────────────────────────────────────────
  const tripRecords = await get(TABLES.trips, `AND({Status}!="archived",{Slug}="${slug}")`);
  if (!tripRecords.length) {
    console.error(`No trip found with slug: ${slug}`);
    process.exit(1);
  }
  const trip = tripRecords[0];
  const f = trip.fields as Record<string, unknown>;
  const tripId = trip.id as string;

  // ── Linked records ────────────────────────────────────────────────────────
  const [costRows, sideTrips, itineraryRows, tripCourseRows] = await Promise.all([
    get(TABLES.costRows,   `FIND("${tripId}", ARRAYJOIN({Golf Trip}))`),
    get(TABLES.sideTrips,  `FIND("${tripId}", ARRAYJOIN({Golf Trip}))`),
    get(TABLES.itinerary,  `FIND("${tripId}", ARRAYJOIN({Golf Trip}))`),
    get(TABLES.tripCourses,`FIND("${tripId}", ARRAYJOIN({Golf Trip}))`),
  ]);

  const sortBy = (rows: any[], key: string) =>
    [...rows].sort((a, b) => (a.fields[key] ?? 0) - (b.fields[key] ?? 0));

  // ── Resolve Golf Course rankings for side trips ───────────────────────────
  const sideTripsWithGolfCourseIds = sideTrips.filter(
    (r: any) => Array.isArray(r.fields["Golf Course"]) && r.fields["Golf Course"].length > 0
  );
  const golfCourseIdSet = new Set<string>(
    sideTripsWithGolfCourseIds.flatMap((r: any) => r.fields["Golf Course"] as string[])
  );
  const courseRankMap = new Map<string, number | null>();

  if (golfCourseIdSet.size > 0) {
    const ids = Array.from(golfCourseIdSet);
    const formula = `OR(${ids.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const courseRecords = await get(TABLES.courses, formula);
    for (const r of courseRecords) {
      courseRankMap.set(r.id, r.fields["Consolidated Ranking"] ?? null);
    }
  }

  // ── want_more courses eligible for side trip migration ───────────────────
  const wantMoreRows = tripCourseRows.filter(
    (r: any) => r.fields["Status"] === "want_more"
  );
  const wantMoreCourseIds = wantMoreRows
    .flatMap((r: any) => (r.fields["Golf Course"] as string[] | undefined) ?? [])
    .filter(Boolean);

  const wantMoreCourseMap = new Map<string, any>();
  if (wantMoreCourseIds.length > 0) {
    const formula = `OR(${wantMoreCourseIds.map((id: string) => `RECORD_ID()="${id}"`).join(",")})`;
    const wantMoreCourses = await get(TABLES.courses, formula);
    for (const r of wantMoreCourses) {
      wantMoreCourseMap.set(r.id, r);
    }
  }

  // ── Completeness report ───────────────────────────────────────────────────
  const sections = {
    core: {
      label: "Core info",
      fields: {
        Name:           fieldStatus(f, "Name"),
        Subheader:      fieldStatus(f, "Subheader"),
        Verdict:        fieldStatus(f, "Verdict"),
      },
    },
    experience: {
      label: "The Experience",
      fields: {
        "Full Description": fieldStatus(f, "Full Description"),
        "Pull Quote":       fieldStatus(f, "Pull Quote"),
        "Want More":        fieldStatus(f, "Want More"),
      },
    },
    sideTrips: {
      label: "Side Trips",
      linkedRecords: sideTrips.length,
    },
    fit: {
      label: "Right for You",
      fields: {
        "Fit Yes": fieldStatus(f, "Fit Yes"),
        "Fit No":  fieldStatus(f, "Fit No"),
      },
    },
    cost: {
      label: "Cost",
      fields: {
        "Cost Tier": fieldStatus(f, "Cost Tier"),
        "Cost Note": fieldStatus(f, "Cost Note"),
      },
      linkedRecords: costRows.length,
    },
    when: {
      label: "When to Go",
      fields: {
        "Best Seasons":       fieldStatus(f, "Best Seasons"),
        "Peak Months":        fieldStatus(f, "Peak Months"),
        "Peak Season Name":   fieldStatus(f, "Peak Season Name"),
        "Peak Notes":         fieldStatus(f, "Peak Notes"),
        "Peak Verdict":       fieldStatus(f, "Peak Verdict"),
        "Shoulder Months":    fieldStatus(f, "Shoulder Months"),
        "Shoulder Season Name": fieldStatus(f, "Shoulder Season Name"),
        "Shoulder Notes":     fieldStatus(f, "Shoulder Notes"),
        "Shoulder Verdict":   fieldStatus(f, "Shoulder Verdict"),
      },
    },
    teeTimes: {
      label: "Tee Times",
      fields: {
        "Tee Time Rules": fieldStatus(f, "Tee Time Rules"),
        "Lead Time":      fieldStatus(f, "Lead Time"),
      },
    },
    mistakes: {
      label: "Common Mistakes",
      fields: {
        "Common Mistakes": fieldStatus(f, "Common Mistakes"),
      },
    },
    pack: {
      label: "Pack List",
      fields: {
        "Pack Bring": fieldStatus(f, "Pack Bring"),
        "Pack Leave": fieldStatus(f, "Pack Leave"),
      },
    },
    itinerary: {
      label: "Itinerary",
      fields: {
        "Sample Itinerary Notes": fieldStatus(f, "Sample Itinerary Notes"),
      },
      linkedRecords: itineraryRows.length,
      minDays: f["Duration Min Days"],
      maxDays: f["Duration Max Days"],
    },
    stay: {
      label: "Stay & Eat",
      fields: {
        Lodging: fieldStatus(f, "Lodging"),
        Dining:  fieldStatus(f, "Dining"),
      },
    },
    seo: {
      label: "SEO",
      fields: {
        "SEO Description": fieldStatus(f, "SEO Description"),
      },
    },
  };

  const allSectionStatuses = Object.values(sections).map((s: any) => {
    const fieldStatuses = Object.values(s.fields ?? {}) as string[];
    const allFieldsFilled = fieldStatuses.every((v) => v === "filled");
    const hasLinked = "linkedRecords" in s;
    const linkedFilled = !hasLinked || s.linkedRecords > 0;
    return allFieldsFilled && linkedFilled;
  });
  const totalSections = allSectionStatuses.length;
  const filledSections = allSectionStatuses.filter(Boolean).length;

  const output = {
    tripId,
    slug: f["Slug"],
    name: f["Name"],
    status: f["Status"],
    completeness: {
      filled: filledSections,
      total: totalSections,
      allFilled: filledSections === totalSections,
    },
    sections,
    currentValues: {
      // Core
      Name:              f["Name"],
      Subheader:         f["Subheader"],
      Verdict:           f["Verdict"],
      // Experience
      "Full Description":    f["Full Description"],
      "Pull Quote":          f["Pull Quote"],
      "Want More":           f["Want More"],
      // Fit
      "Fit Yes":             f["Fit Yes"],
      "Fit No":              f["Fit No"],
      // Cost
      "Cost Tier":           f["Cost Tier"],
      // When
      "Best Seasons":        f["Best Seasons"],
      "Peak Months":         f["Peak Months"],
      "Peak Season Name":    f["Peak Season Name"],
      "Peak Notes":          f["Peak Notes"],
      "Peak Verdict":        f["Peak Verdict"],
      "Shoulder Months":     f["Shoulder Months"],
      "Shoulder Season Name": f["Shoulder Season Name"],
      "Shoulder Notes":      f["Shoulder Notes"],
      "Shoulder Verdict":    f["Shoulder Verdict"],
      // Tee Times
      "Tee Time Rules":      f["Tee Time Rules"],
      "Lead Time":           f["Lead Time"],
      // Mistakes
      "Common Mistakes":     f["Common Mistakes"],
      // Pack
      "Pack Bring":          f["Pack Bring"],
      "Pack Leave":          f["Pack Leave"],
      // Itinerary
      "Duration Min Days":   f["Duration Min Days"],
      "Duration Max Days":   f["Duration Max Days"],
      "Sample Itinerary Notes": f["Sample Itinerary Notes"],
      // Cost
      "Cost Note":           f["Cost Note"],
      // Stay
      Lodging:               f["Lodging"],
      Dining:                f["Dining"],
      // SEO
      "SEO Description":     f["SEO Description"],
      // Reference
      "Data Dump":           f["Data Dump"],
      Overview:              f["Overview"],
    },
    linkedRecords: {
      costRows: sortBy(costRows, "Sort Order").map((r: any) => ({
        id: r.id,
        line:     r.fields["Line"],
        shoulder: r.fields["Shoulder"],
        peak:     r.fields["Peak"],
        optional: r.fields["Optional"] ?? false,
        sortOrder: r.fields["Sort Order"],
      })),
      sideTrips: sortBy(sideTrips, "Sort Order").map((r: any) => {
        const linkedCourseIds = (r.fields["Golf Course"] as string[] | undefined) ?? [];
        const courseId = linkedCourseIds[0] ?? null;
        const isGolf = courseId !== null;
        const consolidatedRanking = isGolf ? (courseRankMap.get(courseId) ?? null) : null;
        return {
          id:      r.id,
          name:    r.fields["Name"],
          slug:    r.fields["Slug"],
          text:    r.fields["Text"],
          isGolf,
          courseId,
          consolidatedRanking,
          sortOrder: r.fields["Sort Order"],
        };
      }),
      itinerary: {
        min: sortBy(itineraryRows.filter((r: any) => r.fields["Length"] === "min"), "Sort Order")
          .map((r: any) => ({
            id: r.id,
            day:      r.fields["Day"],
            schedule: r.fields["Schedule"],
            note:     r.fields["Note"],
            sortOrder: r.fields["Sort Order"],
          })),
        max: sortBy(itineraryRows.filter((r: any) => r.fields["Length"] === "max"), "Sort Order")
          .map((r: any) => ({
            id: r.id,
            day:      r.fields["Day"],
            schedule: r.fields["Schedule"],
            note:     r.fields["Note"],
            sortOrder: r.fields["Sort Order"],
          })),
      },
    },
    wantMoreCourses: wantMoreRows.map((tcRow: any) => {
      const courseId = ((tcRow.fields["Golf Course"] as string[] | undefined) ?? [])[0];
      const course = courseId ? wantMoreCourseMap.get(courseId) : null;
      return {
        tripCourseId: tcRow.id,
        courseId:     courseId ?? null,
        name:         course?.fields["Name"] ?? null,
        slug:         course?.fields["Slug"] ?? null,
        consolidatedRanking: course?.fields["Consolidated Ranking"] ?? null,
        alreadyInSideTrips: sideTrips.some(
          (st: any) => ((st.fields["Golf Course"] as string[] | undefined) ?? []).includes(courseId)
        ),
      };
    }),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
