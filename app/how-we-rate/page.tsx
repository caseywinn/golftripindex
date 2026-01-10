// app/how-we-rank/page.tsx
// If you're using the Pages Router instead, move this to /pages/how-we-rank.tsx and remove the metadata export.

import type { Metadata } from "next";
import styles from "../../styles/howWeRate.module.css";

export const metadata: Metadata = {
  title: "How We Rate | GolfTripIndex",
  description:
    "Our ranking methodology: trip ratings, consolidated course rankings, and rater credentials.",
};

export default function HowWeRatePage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.h1}>How We Rate</h1>
        </div>
      </header>

      {/* 1) Trip Ranking Methodology */}
      <section className={styles.section} id="methodology">
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>Trip Rating Methodology</h2>
          <p className={styles.lede}>
            Each trip is evaluated across four dimensions. The overall rating is <strong>not</strong> a simple average, it’s weighted toward golf while still reflecting lodging, food, travel, and vibe. We don’t publish exact weights to avoid gaming; the model is tuned to match how golfers remember trips.
          </p>
        </div>

        <div className={styles.grid4}>
          <article className={`${styles.card} whiteRoundedBox`}>
            <div className={styles.cardTop}>
              <h3 className={styles.h3}>Golf</h3>
            </div>
            <p className={styles.p}>
              Focused on the course itself: architecture, routing, bunkering, greens, strategy, and variety. This score excludes lodging, food, and amenities.
            </p>
            <ul className={styles.ul}>
              <li>Architecture & design intent</li>
              <li>Routing & walkability</li>
              <li>Strategic interest & variety</li>
              <li>Bunkering, greens, hazards</li>
            </ul>
          </article>

          <article className={`${styles.card} whiteRoundedBox`}>
            <div className={styles.cardTop}>
              <h3 className={styles.h3}>Lodging</h3>
            </div>
            <p className={styles.p}>
              A review of hotels, lodges, and houses—optimized for groups and value, not just luxury.
            </p>
            <ul className={styles.ul}>
              <li>Group lodging availability & layout</li>
              <li>Quality & comfort</li>
              <li>Proximity & logistics</li>
              <li>Cost relative to alternatives</li>
            </ul>
          </article>

          <article className={`${styles.card} whiteRoundedBox`}>
            <div className={styles.cardTop}>
              <h3 className={styles.h3}>Food</h3>
            </div>
            <p className={styles.p}>
              Evaluates on-property and nearby offerings, including on-course convenience and variety across days.
            </p>
            <ul className={styles.ul}>
              <li>Quality & consistency</li>
              <li>Food at the turn</li>
              <li>Post-round options</li>
              <li>Diversity of offerings</li>
            </ul>
          </article>

          <article className={`${styles.card} whiteRoundedBox`}>
            <div className={styles.cardTop}>
              <h3 className={styles.h3}>Vibe</h3>
            </div>
            <p className={styles.p}>
              The human and logistical experience: pace, caddies, travel complexity, and overall atmosphere.
            </p>
            <ul className={styles.ul}>
              <li>Pace of play</li>
              <li>Caddie program quality</li>
              <li>Staff & culture</li>
              <li>Travel complexity</li>
            </ul>
          </article>
        </div>
      </section>

      {/* 2) Consolidated Course Rankings */}
      <section className={styles.section} id="consolidated">
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>Consolidated Course Rankings</h2>
          <p className={styles.lede}>
            We publish a consolidated view of major publication lists to provide context alongside our original ratings.
          </p>
        </div>

        <div className={styles.split}>
          <article className={`${styles.card} whiteRoundedBox`}>
            <h3 className={styles.h3}>What’s Included</h3>
            <p className={styles.p}>We aggregate placements from major lists, such as:</p>
            <ul className={styles.ul}>
              <li>Golf Digest</li>
              <li>Golf.com</li>
              <li>Golfweek</li>
            </ul>
          </article>

          <article className={`${styles.card} whiteRoundedBox`}>
            <h3 className={styles.h3}>How It’s Calculated</h3>
            <ul className={styles.steps}>
              <li className={styles.stepItem}>
                <span className={styles.stepNum}>1</span>
                <span>Normalize each list onto a common scale.</span>
              </li>
              <li className={styles.stepItem}>
                <span className={styles.stepNum}>2</span>
                <span>
                  If a course isn’t on a list, it is shown as <strong>NR</strong> (Not Ranked), not penalized.
                </span>
              </li>
              <li className={styles.stepItem}>
                <span className={styles.stepNum}>3</span>
                <span>Combine sources to reflect consensus, not any single publication’s authority.</span>
              </li>
              <li className={styles.stepItem}>
                <span className={styles.stepNum}>4</span>
                <span>
                  Output a consolidated rank that is descriptive context—not a replacement for on-the-ground evaluation.
                </span>
              </li>
            </ul>
          </article>
        </div>
      </section>

      {/* 3) Rater Credentials */}
      <section className={styles.section} id="credentials">
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>3) Rater Credentials</h2>
        </div>

        <p className={styles.p}>
          Our ratings are produced by a curated group of contributors with deep, firsthand experience in destination golf.
          The group is intentionally cross-disciplinary, composed of golf course raters, restauranteurs, and travel bloggers
          who collectively evaluate trips from the fairway to the final dinner reservation.
        </p>

        <p className={styles.p}>
          Golf course raters bring an architecture-first lens, with familiarity across classic, modern, and contemporary
          design styles. Their focus is on routing, strategy, walkability, and how a course reveals itself over repeated play.
        </p>

        <p className={styles.p}>
          Restauranteurs contribute perspective on food quality, consistency, service, and the practical realities of dining
          well across multiple days. This ensures food scores reflect not just standout meals, but the full, lived experience
          of eating during a golf trip.
        </p>

        <p className={styles.p}>
          Travel bloggers and destination writers evaluate logistics, flow, and overall experience — including travel
          complexity, pacing, lodging practicality, and how seamlessly a trip comes together for real groups.
        </p>

        <p className={styles.p}>
          To qualify as a rater, contributors must have personally visited at least <strong>five of the Top 50 ranked trips</strong> and submitted detailed, on-site reviews. This requirement ensures ratings are grounded in comparative experience, not reputation or secondhand impressions.
        </p>

        <p className={styles.p}>
          Ratings evolve over time as trips are revisited, conditions change, and new courses, lodging, or dining options
          emerge. Our goal is not to freeze ratings in time, but to keep them accurate, current, and earned.
        </p>
      </section>

      <section className={styles.section} id="apply">
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>Apply to Be a Rater</h2>
          <p className={styles.lede}>
            We are always interested in experienced golfers with firsthand destination
            golf knowledge. If you meet the criteria and would like to contribute, apply below.
          </p>
        </div>

        <form
          className={`${styles.card} ${styles.form} whiteRoundedBox`}
          method="POST"
          action="mailto:caddie@golftripindex.com"
          encType="text/plain"
        >
          <div className={styles.formGrid}>
            <label className={styles.label}>
              Name
              <input
                type="text"
                name="Name"
                required
                className={styles.input}
              />
            </label>

            <label className={styles.label}>
              Email
              <input
                type="email"
                name="Email"
                required
                className={styles.input}
              />
            </label>

            <label className={styles.label}>
              Home Location
              <input
                type="text"
                name="Location"
                placeholder="City, State / Country"
                className={styles.input}
              />
            </label>

            <label className={styles.label}>
              Courses / Trips Visited
              <textarea
                name="Experience"
                rows={4}
                placeholder="List notable trips or courses you’ve personally played"
                className={styles.textarea}
                required
              />
            </label>

            <label className={styles.label}>
              Why You’d Be a Good Rater
              <textarea
                name="Why"
                rows={4}
                className={styles.textarea}
                required
              />
            </label>
          </div>

          <button type="submit" className={styles.button}>
            Submit Application
          </button>

          <p className={styles.formNote}>
            Submitting this form will open your email client to send the application.
          </p>
        </form>
      </section>


      <footer className={styles.footer}>
        <p className={styles.p}>
          Ratings and rankings are subjective, but they should never be arbitrary. Our goal is simple: help you choose the trip that
          fits you best.
        </p>
      </footer>
    </main>
  );
}
