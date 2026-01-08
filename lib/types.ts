export type StayType = "on_property" | "off_property" | "mixed";
export type CourseStatus = "must_play" | "should_play" | "want_more";

export type GolfTrip = {
  id: string;
  slug: string;
  name: string;
  secondaryName?: string;

  overview?: string;
  fullDescription?: string;
  sampleItinerary?: string;
  sampleItineraryNotes?: string;
  foodAndLodgingOverview?: string;

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
