"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import TripCard from "./TripCard";
import styles from "../styles/trips.module.css";
import { formatStayType } from "../lib/formatters";

type Trip = {
  id: string;
  slug: string;
  name: string;
  secondaryName?: string | null;

  currentRanking?: number | null;
  previousRanking?: number | null;

  durationMinDays?: number | null;
  durationMaxDays?: number | null;

  driving?: string | null;
  stayType?: any;
  leadTime?: any;
  costTier?: any;

  overview?: string | null;

  firstCourse?: { slug?: string | null } | null;

  golfRating?: number | null;
  lodgingRating?: number | null;
  foodRating?: number | null;
  vibeRating?: number | null;
  overallRating?: number | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function TripsListClient({
  trips,
  pageSize = 10,
  paramName = "n", // query param to persist visible count
}: {
  trips: Trip[];
  pageSize?: number;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize from URL (?n=50), fallback to pageSize.
  const initialFromUrl = (() => {
    const raw = searchParams.get(paramName);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed)) return pageSize;
    return clamp(parsed, pageSize, trips.length);
  })();

  const [visibleCount, setVisibleCount] = useState<number>(initialFromUrl);

  // If user navigates via Back/Forward and the query param changes,
  // sync state to URL so the list matches history state.
  useEffect(() => {
    const raw = searchParams.get(paramName);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    const next = Number.isFinite(parsed)
      ? clamp(parsed, pageSize, trips.length)
      : pageSize;

    setVisibleCount(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, paramName, pageSize, trips.length]);

  const visibleTrips = useMemo(
    () => trips.slice(0, visibleCount),
    [trips, visibleCount]
  );

  const canLoadMore = visibleCount < trips.length;

  function persistCount(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, String(next));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function scrollToIndex(oneBasedIndex: number) {
    // Scroll so the card is at the top of the viewport
    const el = document.getElementById(`trip-${oneBasedIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function onLoadMore() {
    const prev = visibleCount;
    const next = clamp(prev + pageSize, pageSize, trips.length);

    // The first newly revealed item is prev+1 (1-based).
    const firstNewOneBased = prev + 1;

    setVisibleCount(next);
    persistCount(next);

    // Wait for DOM to paint the newly-revealed cards, then scroll.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToIndex(firstNewOneBased);
      });
    });
  }

  return (
    <>
      <div className={styles.list}>
        {visibleTrips.map((t, idx) => {
          const oneBased = idx + 1;
          return (
            <TripCard
              key={t.id}
              id={`trip-${oneBased}`}
              href={`/trips/${t.slug.toLowerCase()}`}
              slug={t.slug.toLowerCase()}
              currentRanking={t.currentRanking ?? 999}
              previousRanking={t.previousRanking}
              name={t.name}
              secondaryName={t.secondaryName}
              durationMinDays={t.durationMinDays ?? 1}
              durationMaxDays={t.durationMaxDays ?? 999}
              driving={t.driving}
              stayType={formatStayType(t.stayType)}
              leadTime={t.leadTime}
              costTier={t.costTier}
              overview={t.overview}
              thumbnailImageUrl={
                t.firstCourse?.slug
                  ? `/images/courses/${t.firstCourse.slug.toLowerCase()}.jpg`
                  : `/images/trips/${t.slug.toLowerCase()}.jpg`
              }
              golfRating={t.golfRating}
              lodgingRating={t.lodgingRating}
              foodRating={t.foodRating}
              vibeRating={t.vibeRating}
              overallRating={t.overallRating}
            />
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
        {canLoadMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            style={{
              padding: "12px 18px",
              borderRadius: 999,
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Load More ({Math.min(visibleCount + pageSize, trips.length)}/
            {trips.length})
          </button>
        ) : (
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            All trips loaded ({trips.length})
          </div>
        )}
      </div>
    </>
  );
}