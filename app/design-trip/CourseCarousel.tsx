"use client";
import { useEffect, useRef, useState } from "react";
import dt from "../../styles/designTrip.module.css";

type Course = {
  id: string;
  slug: string;
  name: string;
  status: "must_play" | "should_play";
  consolidatedRanking: number | null;
  golfDigestRanking: number | null;
  golfDotComRanking: number | null;
  golfweekRanking: number | null;
  tripCourseRank: number;
};

export default function CourseCarousel({ courses }: { courses: Course[] }) {
  const [index, setIndex] = useState(0);
  const current = courses[index];
  const touchStartX = useRef(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    tabRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [index]);

  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(courses.length - 1, i + 1));

  return (
    <div className={dt.courseCarousel}>
      {/* Tab nav — desktop only */}
      <div className={dt.courseNavStrip}>
        {courses.map((c, i) => (
          <button
            key={c.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            className={`${dt.courseNavTab} ${i === index ? dt.courseNavTabActive : ""}`}
            onClick={() => setIndex(i)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className={dt.courseCarouselOuter}>
        {/* Image-only area — arrows are positioned relative to this */}
        <div
          className={dt.courseCarouselImgOuter}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const delta = touchStartX.current - e.changedTouches[0].clientX;
            if (delta > 50) next();
            else if (delta < -50) prev();
          }}
        >
          <div className={dt.courseCarouselViewport}>
            <div
              className={dt.courseCarouselTrack}
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {courses.map((c) => (
                <div key={c.id} className={dt.courseCarouselSlide}>
                  <div
                    className={dt.courseCarouselImg}
                    style={{ backgroundImage: `url("/images/courses/${c.slug}.jpg")` }}
                  >
                    {c.status === "must_play" && (
                      <span className={dt.courseCardMustBadge}>Must Play</span>
                    )}
                    {c.consolidatedRanking && (
                      <span className={dt.courseCarouselRank}>#{c.consolidatedRanking}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            className={`${dt.courseCarouselArrow} ${dt.courseCarouselArrowLeft}`}
            onClick={prev}
            disabled={index === 0}
            aria-label="Previous course"
          >
            &#8592;
          </button>
          <button
            className={`${dt.courseCarouselArrow} ${dt.courseCarouselArrowRight}`}
            onClick={next}
            disabled={index === courses.length - 1}
            aria-label="Next course"
          >
            &#8594;
          </button>
        </div>

        {/* Footer — shows active course, counter on mobile */}
        <div className={dt.courseCarouselFooter}>
          <div className={dt.courseCarouselNameRow}>
            <div className={dt.courseCarouselName}>{current.name}</div>
            <div className={dt.courseCarouselCounter}>
              {index + 1} of {courses.length}
            </div>
          </div>
          <div className={dt.courseCarouselRanks}>
            <div className={dt.courseCarouselRankCell}>
              <div className={dt.courseCarouselRankNum}>
                {current.golfDigestRanking ? `#${current.golfDigestRanking}` : "NR"}
              </div>
              <div className={dt.courseCarouselRankLabel}>Golf Digest</div>
            </div>
            <div className={dt.courseCarouselRankCell}>
              <div className={dt.courseCarouselRankNum}>
                {current.golfDotComRanking ? `#${current.golfDotComRanking}` : "NR"}
              </div>
              <div className={dt.courseCarouselRankLabel}>Golf.com</div>
            </div>
            <div className={dt.courseCarouselRankCell}>
              <div className={dt.courseCarouselRankNum}>
                {current.golfweekRanking ? `#${current.golfweekRanking}` : "NR"}
              </div>
              <div className={dt.courseCarouselRankLabel}>Golfweek</div>
            </div>
            <div className={dt.courseCarouselRankCell}>
              <div className={dt.courseCarouselRankNumOverall}>
                {current.consolidatedRanking ? `#${current.consolidatedRanking}` : "NR"}
              </div>
              <div className={dt.courseCarouselRankLabel}>Overall</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
