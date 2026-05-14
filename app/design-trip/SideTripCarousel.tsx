"use client";
import { useEffect, useRef, useState } from "react";
import dt from "../../styles/designTrip.module.css";

type SideTrip = {
  id: string;
  slug: string;
  name: string;
  text: string;
  isGolf?: boolean;
  consolidatedRanking?: number | null;
};

export default function SideTripCarousel({ items }: { items: SideTrip[] }) {
  const [index, setIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchStartX = useRef(0);
  const current = items[index];

  // Scroll active card into view (desktop grid)
  useEffect(() => {
    const card = cardRefs.current[index];
    if (card && viewportRef.current) {
      viewportRef.current.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
    }
  }, [index]);

  // Scroll active tab into view (nav strip)
  useEffect(() => {
    tabRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [index]);

  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(items.length - 1, i + 1));

  function imgUrl(item: SideTrip) {
    return item.isGolf
      ? `url("/images/courses/${item.slug}.jpg")`
      : `url("/images/side-trips/${item.slug}.jpg")`;
  }

  function Footer({ counter }: { counter: boolean }) {
    return (
      <div className={dt.stCarouselFooter}>
        <div className={dt.stCarouselNameRow}>
          <div className={dt.stCarouselName}>{current.name}</div>
          {counter && (
            <div className={dt.courseCarouselCounter}>{index + 1} of {items.length}</div>
          )}
        </div>
        {current.isGolf && current.consolidatedRanking && (
          <div className={dt.stCarouselGolfRank}>Ranked #{current.consolidatedRanking} overall</div>
        )}
        <div className={dt.stCarouselText}>{current.text}</div>
      </div>
    );
  }

  return (
    <div className={dt.stCarousel}>
      {/* Tab nav — desktop only */}
      <div className={dt.courseNavStrip}>
        {items.map((item, i) => (
          <button
            key={item.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            className={`${dt.courseNavTab} ${i === index ? dt.courseNavTabActive : ""}`}
            onClick={() => setIndex(i)}
          >
            {item.name}
          </button>
        ))}
      </div>

      {/* ── DESKTOP carousel: scroll-based 2-up grid ── */}
      <div className={`${dt.stCarouselOuter} ${dt.stCarouselDesktop}`}>
        <div className={dt.stCarouselImgOuter}>
          <div className={dt.stCarouselViewport} ref={viewportRef}>
            {items.map((item, i) => (
              <div
                key={item.id}
                className={`${dt.stCarouselSlide} ${i !== index ? dt.stCarouselSlideInactive : ""}`}
                ref={(el) => { cardRefs.current[i] = el; }}
              >
                <div className={dt.stCarouselImg} style={{ backgroundImage: imgUrl(item) }} />
              </div>
            ))}
          </div>
          <button
            className={`${dt.courseCarouselArrow} ${dt.courseCarouselArrowLeft}`}
            onClick={prev}
            disabled={index === 0}
            aria-label="Previous"
          >&#8592;</button>
          <button
            className={`${dt.courseCarouselArrow} ${dt.courseCarouselArrowRight}`}
            onClick={next}
            disabled={index === items.length - 1}
            aria-label="Next"
          >&#8594;</button>
        </div>
        <Footer counter={false} />
      </div>

      {/* ── MOBILE carousel: translateX-based, matches CourseCarousel ── */}
      <div className={`${dt.stCarouselOuter} ${dt.stCarouselMobile}`}>
        <div
          className={dt.stCarouselImgOuter}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const delta = touchStartX.current - e.changedTouches[0].clientX;
            if (delta > 50) next();
            else if (delta < -50) prev();
          }}
        >
          <div className={dt.stCarouselMobileViewport}>
            <div
              className={dt.stCarouselMobileTrack}
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {items.map((item, i) => (
                <div key={item.id} className={`${dt.stCarouselMobileSlide} ${i !== index ? dt.stCarouselSlideInactive : ""}`}>
                  <div className={dt.stCarouselImg} style={{ backgroundImage: imgUrl(item) }} />
                </div>
              ))}
            </div>
          </div>
          <button
            className={`${dt.courseCarouselArrow} ${dt.courseCarouselArrowLeft}`}
            onClick={prev}
            disabled={index === 0}
            aria-label="Previous"
          >&#8592;</button>
          <button
            className={`${dt.courseCarouselArrow} ${dt.courseCarouselArrowRight}`}
            onClick={next}
            disabled={index === items.length - 1}
            aria-label="Next"
          >&#8594;</button>
        </div>
        <Footer counter={true} />
      </div>
    </div>
  );
}
