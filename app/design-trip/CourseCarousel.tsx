"use client";
import { useState } from "react";
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

  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(courses.length - 1, i + 1));

  return (
    <div className={dt.courseCarousel}>
      <div className={dt.courseNavStrip}>
        {courses.map((c, i) => (
          <button
            key={c.id}
            className={`${dt.courseNavTab} ${i === index ? dt.courseNavTabActive : ""}`}
            onClick={() => setIndex(i)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className={dt.courseCarouselOuter}>
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
                <div className={dt.courseCarouselFooter}>
                  <div className={dt.courseCarouselName}>{c.name}</div>
                  <div className={dt.courseCarouselRanks}>
                    <div className={dt.courseCarouselRankCell}>
                      <div className={dt.courseCarouselRankNum}>
                        {c.golfDigestRanking ? `#${c.golfDigestRanking}` : "NR"}
                      </div>
                      <div className={dt.courseCarouselRankLabel}>Golf Digest</div>
                    </div>
                    <div className={dt.courseCarouselRankCell}>
                      <div className={dt.courseCarouselRankNum}>
                        {c.golfDotComRanking ? `#${c.golfDotComRanking}` : "NR"}
                      </div>
                      <div className={dt.courseCarouselRankLabel}>Golf.com</div>
                    </div>
                    <div className={dt.courseCarouselRankCell}>
                      <div className={dt.courseCarouselRankNum}>
                        {c.golfweekRanking ? `#${c.golfweekRanking}` : "NR"}
                      </div>
                      <div className={dt.courseCarouselRankLabel}>Golfweek</div>
                    </div>
                    <div className={dt.courseCarouselRankCell}>
                      <div className={dt.courseCarouselRankNumOverall}>
                        {c.consolidatedRanking ? `#${c.consolidatedRanking}` : "NR"}
                      </div>
                      <div className={dt.courseCarouselRankLabel}>Overall</div>
                    </div>
                  </div>
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
    </div>
  );
}
