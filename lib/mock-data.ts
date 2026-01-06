import { GolfCourse, GolfTrip, TripCourse, TripWithCourses } from "./types";

const trips: GolfTrip[] = [
  {
    id: "trip_1",
    slug: "bandon-dunes",
    name: "Bandon Dunes",
    secondaryName: "Oregon Coast Links",
    overview:
      "A pure golf trip: walkable links, minimal distractions, and an all-in ecosystem built for 36-hole days.",
    durationMinDays: 3,
    durationMaxDays: 5,
    drivingDistanceMiles: 0,
    stayType: "on_property",
    leadTimeDays: 120,
    costTier: 4,
    golfRating: 9.8,
    lodgingRating: 8.8,
    foodRating: 8.4,
    vibeRating: 9.6,
    overallRating: 9.4,
    currentRanking: 1,
    previousRanking: 1,
    thumbnailImageUrl: "https://placehold.co/600x400",
    heroImageUrl: "https://placehold.co/1600x800",
  },
  {
    id: "trip_2",
    slug: "pebble-beach",
    name: "Pebble Beach",
    secondaryName: "Monterey Peninsula",
    overview:
      "Iconic scenery and bucket-list golf with strong lodging and dining—best when planned tightly to avoid logistical drag.",
    durationMinDays: 2,
    durationMaxDays: 4,
    drivingDistanceMiles: 30,
    stayType: "mixed",
    leadTimeDays: 90,
    costTier: 5,
    golfRating: 9.7,
    lodgingRating: 9.2,
    foodRating: 8.9,
    vibeRating: 9.3,
    overallRating: 9.4,
    currentRanking: 2,
    previousRanking: 3,
    thumbnailImageUrl: "https://placehold.co/600x400",
    heroImageUrl: "https://placehold.co/1600x800",
  },
  {
    id: "trip_3",
    slug: "sand-valley",
    name: "Sand Valley",
    secondaryName: "Wisconsin Sand County",
    overview:
      "Modern minimalist resort golf—fast greens, wide corridors, and a walk-first culture with strong replay value.",
    durationMinDays: 2,
    durationMaxDays: 3,
    drivingDistanceMiles: 10,
    stayType: "on_property",
    leadTimeDays: 60,
    costTier: 3,
    golfRating: 9.1,
    lodgingRating: 8.3,
    foodRating: 8.1,
    vibeRating: 9.0,
    overallRating: 8.8,
    currentRanking: 5,
    previousRanking: 6,
    thumbnailImageUrl: "https://placehold.co/600x400",
    heroImageUrl: "https://placehold.co/1600x800",
  },
];

const courses: GolfCourse[] = [
  { id: "c1", slug: "bandon-dunes-gc", name: "Bandon Dunes", consolidatedRanking: 12, thumbnailImageUrl: "https://placehold.co/400x300" },
  { id: "c2", slug: "pacific-dunes", name: "Pacific Dunes", consolidatedRanking: 8, thumbnailImageUrl: "https://placehold.co/400x300" },
  { id: "c3", slug: "sheep-ranch", name: "Sheep Ranch", consolidatedRanking: 20, thumbnailImageUrl: "https://placehold.co/400x300" },
  { id: "c4", slug: "pebble-beach-gc", name: "Pebble Beach Golf Links", consolidatedRanking: 5, thumbnailImageUrl: "https://placehold.co/400x300" },
  { id: "c5", slug: "spyglass-hill", name: "Spyglass Hill", consolidatedRanking: 25, thumbnailImageUrl: "https://placehold.co/400x300" },
  { id: "c6", slug: "sand-valley-gc", name: "Sand Valley", consolidatedRanking: 30, thumbnailImageUrl: "https://placehold.co/400x300" },
  { id: "c7", slug: "mammoth-dunes", name: "Mammoth Dunes", consolidatedRanking: 18, thumbnailImageUrl: "https://placehold.co/400x300" },
];

const tripCourses: TripCourse[] = [
  { golfTripId: "trip_1", golfCourseId: "c2", tripCourseRank: 1, status: "must_play" },
  { golfTripId: "trip_1", golfCourseId: "c1", tripCourseRank: 2, status: "must_play" },
  { golfTripId: "trip_1", golfCourseId: "c3", tripCourseRank: 3, status: "should_play" },

  { golfTripId: "trip_2", golfCourseId: "c4", tripCourseRank: 1, status: "must_play" },
  { golfTripId: "trip_2", golfCourseId: "c5", tripCourseRank: 2, status: "should_play" },

  { golfTripId: "trip_3", golfCourseId: "c7", tripCourseRank: 1, status: "must_play" },
  { golfTripId: "trip_3", golfCourseId: "c6", tripCourseRank: 2, status: "must_play" },
];

export function getTripsMock(): GolfTrip[] {
  return [...trips].sort((a, b) => (a.currentRanking ?? 999) - (b.currentRanking ?? 999));
}

export function getTripBySlugMock(slug: string): TripWithCourses | null {
  const trip = trips.find((t) => t.slug === slug);
  if (!trip) return null;

  const relations = tripCourses
    .filter((tc) => tc.golfTripId === trip.id)
    .sort((a, b) => a.tripCourseRank - b.tripCourseRank);

  const joined = relations
    .map((tc) => {
      const course = courses.find((c) => c.id === tc.golfCourseId);
      if (!course) return null;
      return {
        course,
        tripCourseRank: tc.tripCourseRank,
        status: tc.status,
        roundsPlanned: tc.roundsPlanned,
        notes: tc.notes,
      };
    })
    .filter(Boolean) as TripWithCourses["courses"];

  return { ...trip, courses: joined };
}
