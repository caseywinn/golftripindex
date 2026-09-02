// lib/types.ts

export type StayType = "on_property" | "off_property" | "mixed";
export type CourseStatus = "" | "must_play" | "should_play" | "want_more";

export type GolfTrip = {
  id: string;
  slug: string;
  name: string;
  secondaryName?: string;
  subheader?: string;
  /** Airtable record creation time (ISO string) — not bumped by edits, but real and stable, unlike a build-time "now". */
  createdTime?: string;

  pullQuote?: string;
  overview?: string;
  verdict?: string;
  fullDescription?: string;
  wantMore?: string;
  sampleItinerary?: string;
  sampleItineraryNotes?: string;
  foodAndLodgingOverview?: string;
  seoDescription?: string;
  dataDump?: string;

  vibe?: string[];

  fitYes?: string;
  fitNo?: string;
  teeTimeRules?: string;
  commonMistakes?: string;
  packBring?: string;
  packLeave?: string;
  lodging?: string;
  dining?: string;

  durationMinDays: number;
  durationMaxDays: number;
  driving?: string;
  stayType: StayType;
  leadTime?: string;
  costTier: 1 | 2 | 3 | 4 | 5;

  golfRating: number;
  lodgingRating: number;
  foodRating: number;
  vibeRating: number;
  overallRating: number;
  beyondGolfRating?: number;
  valueRating?: number;
  logisticsRating?: number;

  currentRanking?: number;
  previousRanking?: number;

  state?: string;
  region?: string;
  seasons?: string[];
  peakMonths?: string[];
  peakNotes?: string;
  peakSeasonName?: string;
  peakVerdict?: string;
  shoulderMonths?: string[];
  shoulderNotes?: string;
  shoulderSeasonName?: string;
  shoulderVerdict?: string;
  closedMonths?: string[];
  badMonths?: string[];
  offSeasonName?: string;
  offSeasonNotes?: string;
  offSeasonVerdict?: string;
  costNote?: string;
  top100Count?: number;

  thumbnailImageUrl?: string;
  heroImageUrl?: string;
};

export type TripCostRow = {
  id: string;
  line: string;
  shoulder: string;
  peak: string;
  offSeason: string;
  optional: boolean;
  sortOrder?: number;
};

export type TripSideTrip = {
  id: string;
  slug: string;
  name: string;
  text: string;
  isGolf: boolean;
  consolidatedRanking?: number | null;
  sortOrder?: number;
};

export type TripItineraryDay = {
  id: string;
  day: string;
  schedule: string;
  note: string;
  sortOrder?: number;
};

export type GolfCourse = {
  id: string;
  slug: string;
  name: string;

  state?: string;
  city?: string;
  courseType?: string;
  accessType?: string;
  courseStyle?: string[];
  architect?: string;
  yearOpened?: number;

  greenFeePeak?: number;
  greenFeeShoulder?: number;
  greenFeeOffSeason?: number;
  walkFriendly?: boolean;
  closedOffSeason?: boolean;

  dataDump?: string;

  golfDigestRanking?: number;
  golfweekRanking?: number;
  golfDotComRanking?: number;
  consolidatedRanking?: number;
};

export type TripCourse = {
  golfTripId: string;
  golfCourseId: string;
  tripCourseRank: number;
  status: CourseStatus;
  roundsPlanned?: number;
  notes?: string;
};

export type TripWithCourses = GolfTrip & {
  courses: Array<{
    course: GolfCourse;
    tripCourseRank: number;
    status: CourseStatus;
    roundsPlanned?: number;
    notes?: string;
  }>;
};

export type TripFull = TripWithCourses & {
  costRows: TripCostRow[];
  sideTrips: TripSideTrip[];
  itinerary: {
    min: TripItineraryDay[];
    max: TripItineraryDay[];
  };
};

export type Article = {
  id: string;
  slug: string;
  name: string;
  teaser?: string | null;
  fullText?: string | null;
  author?: string | null;
  publishedOn?: string | null; // keep as string; format in UI
  status?: string | null;

  imageUrls?: Record<number, string>;
};

export type GTISearchHit =
  | {
      type: "trip";
      trip: Pick<
        GolfTrip,
        | "id"
        | "slug"
        | "name"
        | "secondaryName"
        | "subheader"
        | "overview"
        | "fullDescription"
        | "wantMore"
        | "sampleItinerary"
        | "foodAndLodgingOverview"
        | "vibe"
        | "pullQuote"
        | "verdict"
        | "fitYes"
        | "fitNo"
        | "state"
        | "region"
        | "overallRating"
        | "beyondGolfRating"
        | "valueRating"
        | "logisticsRating"
        | "costTier"
        | "durationMinDays"
        | "durationMaxDays"
        | "dataDump"
      >;
      match?: { field?: string; score?: number };
    }
  | {
      type: "course";
      course: Pick<
        GolfCourse,
        "id" | "slug" | "name" | "state" | "courseType" | "consolidatedRanking" | "dataDump"
      >;
      match?: { field?: string; score?: number };
    };

/* =========================
   Chat / Caddie types (new)
   ========================= */

export type ChatRole = "user" | "assistant";

/**
 * Option buttons rendered in the chat UI.
 * - id: stable identifier for UI keying
 * - label: what the user sees
 * - value: what gets sent back if clicked (defaults to label if omitted)
 */
export type Option = {
  id: string;
  label: string;
  value?: string;
};

/**
 * Citations for transparency (Airtable-first, web fallback).
 * Keep URLs optional; Airtable citations usually won't have public URLs.
 */
export type Citation = {
  source: "airtable" | "web";
  title: string;
  url?: string;
  notes?: string;
};

/**
 * Structured payloads that the UI can render (buttons, recommendation cards, etc.)
 * The `content` string is still stored/displayed for all assistant messages.
 */
export type AssistantPayload =
  | {
      kind: "question";
      step: string; // e.g. "entry" | "planning.vibe" | "trip_details.pick"
      text: string; // usually same as assistant content, but can differ
      allowFreeText: boolean; // per your spec: true, always
      options: Option[];
      freeTextHint?: string;
      citations?: Citation[];
    }
  | {
      kind: "recommendations";
      step: "recommend";
      text: string;
      shortlist: Array<{
        tripSlug: string;
        tripName: string;
        whyItFits: string[];
        tradeoffs?: string[];
        // optional deepening hooks
        nearbyCourseSlugs?: string[];
      }>;
      followUp?: {
        text: string;
        options: Option[];
      };
      citations?: Citation[];
    }
  | {
      kind: "info";
      step?: string;
      citations?: Citation[];
    }
  | {
      kind: "error";
      text: string;
    }
  | {
      // Escape hatch: if you add new payload kinds later, UI can still handle generically
      kind: string;
      [k: string]: any;
    };

/**
 * Stored message record shape returned by /messages and /chat.
 * Align this with your DB schema, but keep these fields stable for UI.
 */
export type ChatMessage = {
  id: string;
  room_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  payload?: AssistantPayload | null;
};

// ================================
//  Journey (Long Trip) types
// ================================

export type MapStop = {
  order: number;
  name: string;
  lat: number;
  lng: number;
  overnight: boolean;
};

export type CourseImportance = "must_play" | "should_play" | "want_more";

export type LongTrip = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  fullDescription?: string;
  heroImageUrl?: string;
  durationMinDays: number;
  durationMaxDays: number;
  costTier?: 1 | 2 | 3 | 4 | 5;
  status: string;
  /** Airtable record creation time (ISO string) — not bumped by edits, but real and stable, unlike a build-time "now". */
  createdTime?: string;
};

export type JourneyStop = {
  id: string;
  tripId: string;
  stopOrder: number;
  locationName: string;
  overnight: boolean;
  hotels?: string;
  restaurants?: string;
  bookingAdvice?: string;
  notes?: string;
};

export type JourneyStopCourse = {
  stopId: string;
  course: GolfCourse;
  importance: CourseImportance;
  notes?: string;
};

export type JourneyStopWithCourses = JourneyStop & {
  courses: JourneyStopCourse[];
};

export type JourneyWithStops = LongTrip & {
  stops: JourneyStopWithCourses[];
};

export type ComparisonPack = {
  generated_at: string;      // ISO
  data_version: string;      // deterministic, for caching
  tripA: TripPack;
  tripB: TripPack;
};

export type TripPack = {
  name: string;
  slug: string;
  secondary_name?: string | null;
  subheader?: string | null;

  // Editorial text: the model’s “voice fuel”
  overview?: string | null;
  full_description?: string | null;
  food_and_lodging_overview?: string | null;
  travel_notes?: string | null;
  vibe_summary?: string | null;
  driving?: string | null;          // you have a "Driving" field
  data_dump?: string | null;        // optional; can be noisy

  // Logistics + planning
  duration_min_days?: number | null;
  duration_max_days?: number | null;
  stay_type?: string | null;
  cost_tier?: number | null;
  lead_time?: string | null;
  nearest_airports?: string[];      // Airtable multi-select or array
  peak_months?: string[];
  shoulder_months?: string[];

  // Ratings (these are key for “Winner:” calls)
  ratings?: {
    golf?: number | null;
    lodging?: number | null;
    food?: number | null;
    vibe?: number | null;
    beyond_golf?: number | null;
    logistics?: number | null;
    value?: number | null;
    overall?: number | null;
  };

  // Courses in trip order
  courses: Array<{
    name: string;
    slug: string;
    trip_course_rank?: number | null;
    architect?: string | null;
    year_opened?: number | null;
    state?: string | null;
    course_type?: string | null;
    stay_play_required?: boolean | string | null;

    rankings?: {
      consolidated?: number | null;
      golf_digest?: number | null;
      golfdotcom?: number | null;
      golfweek?: number | null;
      trend?: string | null;
    };
  }>;
};

export type HeadToHeadOutput = {
  teaser: string;
  article_markdown: string;

  // Optional but recommended: makes users trust it
  facts_sidebar: string[];

  // For internal validation/debug; you can omit from client response
  outline: {
    thesis: string;
    sections: Array<{
      key:
        | "golf"
        | "lodging"
        | "food"
        | "logistics"
        | "value"
        | "vibe"
        | "verdict";
      heading: string;
      tripA_points: string[];
      tripB_points: string[];
      winner: "A" | "B" | "TIE";
      rationale: string;
    }>;
    overall_verdict: {
      winner: "A" | "B" | "TIE";
      rationale: string;
      who_should_pick_A: string[];
      who_should_pick_B: string[];
    };
  };

  // Every specific claim points back to pack fields
  claim_ledger: Array<{
    claim: string;
    sources: Array<{
      trip: "A" | "B";
      path: string; // e.g. "ratings.golf" or "courses[2].architect"
    }>;
  }>;
};

