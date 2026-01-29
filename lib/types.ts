// lib/types.ts

export type StayType = "on_property" | "off_property" | "mixed";
export type CourseStatus = "" | "must_play" | "should_play" | "want_more";

export type GolfTrip = {
  id: string;
  slug: string;
  name: string;
  secondaryName?: string;
  subheader?: string;

  overview?: string;
  fullDescription?: string;
  wantMore?: string;
  sampleItinerary?: string;
  sampleItineraryNotes?: string;
  foodAndLodgingOverview?: string;
  dataDump?: string;

  durationMinDays: number;
  durationMaxDays: number;
  driving?: number;
  stayType: StayType;
  leadTime?: string;
  costTier: 1 | 2 | 3 | 4 | 5;

  golfRating: number;
  lodgingRating: number;
  foodRating: number;
  vibeRating: number;
  overallRating: number;

  currentRanking?: number;
  previousRanking?: number;

  thumbnailImageUrl?: string;
  heroImageUrl?: string;
};

export type GolfCourse = {
  id: string;
  slug: string;
  name: string;

  state?: string;
  courseType?: string;
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

export type NewsArticle = {
  id: string;
  slug: string;
  name: string;
  teaser?: string;
  fullText?: string;
  heroImageUrl?: string;
  imageUrl1?: string;
  imageUrl2?: string;
  imageUrl3?: string;
  imageUrl4?: string;
  author?: string;
  publishedOn?: string; // keep as string; format in UI
  status?: string;
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
        | "costTier"
        | "durationMinDays"
        | "durationMaxDays"
        | "overallRating"
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
