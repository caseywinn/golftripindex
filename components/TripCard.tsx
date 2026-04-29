import Link from "next/link";
import styles from "../styles/tripCard.module.css";

type TripCardProps = {
  /** Used for scroll anchoring (e.g., id="trip-21") */
  id?: string;

  href: string;
  slug: string;

  currentRanking: number;
  previousRanking?: number | null;

  name: string;
  secondaryName?: string | null;

  durationMinDays?: number | null;
  durationMaxDays?: number | null;
  driving?: number | null;
  stayType?: string | null;
  leadTime?: string | null;
  costTier?: number | null;

  overview?: string | null;
  thumbnailImageUrl?: string | null;

  golfRating?: number | null;
  lodgingRating?: number | null;
  foodRating?: number | null;
  vibeRating?: number | null;
  overallRating?: number | null;

  variant?: "tile";
};

function dollars(n?: number | null) {
  const x = Number(n ?? 0);
  if (!x || x < 1) return "—";
  return "$".repeat(Math.min(5, Math.max(1, x)));
}

function intScore(n?: number | null) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return String(Math.round(Number(n)));
}

function overallScore(n?: number | null) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(2);
}

function daysRange(min?: number | null, max?: number | null) {
  const a = min ?? null;
  const b = max ?? null;
  if (a && b && a !== b) return `${a}-${b} Days`;
  if (a && b && a === b) return `${a} Days`;
  if (a && !b) return `${a}+ Days`;
  if (!a && b) return `${b} Days`;
  return "—";
}

function miles(n?: number | null) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `${Math.round(Number(n))} miles`;
}

export default function TripCard(props: TripCardProps) {
  const {
    id,
    href,
    slug,
    currentRanking,
    previousRanking,
    name,
    secondaryName,
    durationMinDays,
    durationMaxDays,
    driving,
    stayType,
    leadTime,
    costTier,
    overview,
    golfRating,
    lodgingRating,
    foodRating,
    vibeRating,
    overallRating,
  } = props;

  const thumb = `/images/trips/${slug}.jpg`;

  return (
    <article id={id} className={`${styles.tile} whiteRoundedBox`}>
      {/* Thumbnail is a link */}
      <Link
        href={href}
        className={styles.mediaLink}
        aria-label={`View trip: ${name}`}
      >
        <div
          className={styles.media}
          style={{ backgroundImage: `url(${thumb})` }}
          aria-hidden="true"
        >
          <div className={styles.rank}>#{currentRanking}</div>

          <div className={styles.cornerDots} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </Link>

      <div className={styles.body}>
        <div className={styles.top}>
          {/* Title is a link */}
          <div className={styles.title}>
            <Link href={href} className={styles.titleLink}>
              {name}
              {secondaryName ? (
                <span className={styles.secondary}> + {secondaryName}</span>
              ) : null}
            </Link>
          </div>

          <div className={styles.meta}>
            <div>
              <span className={styles.metaLabel}>Duration:</span>{" "}
              {daysRange(durationMinDays, durationMaxDays)}
            </div>
            <div>
              <span className={styles.metaLabel}>Driving:</span> {miles(driving)}
            </div>
            <div>
              <span className={styles.metaLabel}>Stay Type:</span>{" "}
              {stayType ?? "—"}
            </div>
            <div>
              <span className={styles.metaLabel}>Lead Time:</span>{" "}
              {leadTime ?? "—"}
            </div>
            <div>
              <span className={styles.metaLabel}>Cost:</span> {dollars(costTier)}
            </div>
          </div>

          {overview ? <p className={styles.overview}>{overview}</p> : null}
        </div>

        <div className={styles.bottom}>
          <div className={styles.prev}>
            <span className={styles.prevLabel}>Previous:</span>{" "}
            <span className={styles.prevValue}>
              {previousRanking ? `#${previousRanking}` : "—"}
            </span>
          </div>

          <div className={styles.scores}>
            <div className={styles.score}>
              <div className={styles.scoreNum}>{intScore(golfRating)}</div>
              <div className={styles.scoreLabel}>Golf</div>
            </div>
            <div className={styles.score}>
              <div className={styles.scoreNum}>{intScore(lodgingRating)}</div>
              <div className={styles.scoreLabel}>Lodging</div>
            </div>
            <div className={styles.score}>
              <div className={styles.scoreNum}>{intScore(foodRating)}</div>
              <div className={styles.scoreLabel}>Food</div>
            </div>
            <div className={styles.score}>
              <div className={styles.scoreNum}>{intScore(vibeRating)}</div>
              <div className={styles.scoreLabel}>Vibe</div>
            </div>

            <div className={styles.overall}>
              <div className={styles.overallNum}>{overallScore(overallRating)}</div>
              <div className={styles.overallLabel}>Overall</div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}