import type { Metadata } from "next";
import Image from "next/image";
import styles from "@/styles/event.module.css";
import { SITE_URL } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import ApplyForm from "./ApplyForm";

/**
 * Working name — Casey to confirm before this is treated as final branding.
 * Change it here and it changes the H1, the metadata, and the value written to
 * the Airtable "Event" column.
 */
const EVENT_NAME = "GTI Father-Son Invitational";
const EVENT_PATH = "/events/father-son-invitational";

/**
 * No venue is confirmed. Three resorts have been contacted and none has
 * replied, so nothing on this page may name or picture a specific property —
 * naming one we haven't got a yes from could complicate the conversation.
 * The page is built to survive that: when a host confirms, this becomes an
 * additive edit, not a rewrite.
 */

export const metadata: Metadata = {
  title: EVENT_NAME,
  description:
    "A three-day father-son golf trip for dads whose kids can swing a club but haven't played much golf yet. Dads play a full round each day; kids get a lesson, a practice round, and a low-key competition. Applications open — location and dates to be announced.",
  alternates: { canonical: `${SITE_URL}${EVENT_PATH}` },
  openGraph: {
    title: `${EVENT_NAME} | Golf Trip Index`,
    description:
      "Three days of golf for dads and kids who can swing a club but haven't played much golf yet. Applications open; location and dates to be announced.",
    url: `${SITE_URL}${EVENT_PATH}`,
    type: "website",
  },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Where is it, and when?",
    a: "Not announced yet. We're in conversation with a short list of resorts and we're not going to name one before it's signed. Applying now puts you first in line to hear, and commits you to nothing.",
  },
  {
    q: "What will it cost?",
    a: "We don't have a number yet, because we don't have a venue yet. What we can tell you is the shape of it: this is a paid trip. Nothing here is comped and nobody is being hosted for free, so the price will look like a real golf trip for two. You'll see the full cost, itemised, before we ask you for anything.",
  },
  {
    q: "How good does my kid have to be?",
    a: "They need to be able to swing a club and make contact reasonably often. A season of range trips, or a few holes with you on a summer evening, is exactly the level this is built around. What they don't need is rounds of golf behind them — day two exists precisely so that day three isn't their first time on a course. At the other end: if your kid is already playing junior tournaments and chasing a scoring average, they'll be bored here.",
  },
  {
    q: "Does my kid need their own clubs?",
    a: "Bring them if you have them. If you don't, say so in the form. Sorting out a cut-down set for a week is a normal thing to arrange with a host resort, and we'd rather know the count up front than have you buy a set you'll outgrow in a season. We'll confirm what's available once the venue is set.",
  },
  {
    q: "Can I bring more than one kid?",
    a: "Most likely, yes. Fill the form in for one of them and tell us about the others in the last box. The number of kids is the thing that decides how the lessons get staffed, so it genuinely changes the planning — we need the real count, not the tidy one.",
  },
  {
    q: "Am I playing with my kid all three days?",
    a: "No, and that's the point. Dads play their own golf; kids have their own track with a pro. You're together at the start and end of each day, and on the course together on day three.",
  },
];

export default function FatherSonInvitationalPage() {
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: EVENT_NAME, item: `${SITE_URL}${EVENT_PATH}` },
    ],
  };

  // Deliberately no schema.org/Event: that type wants a startDate and a
  // location, and we have neither. Add it when a host confirms.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <main className={styles.page}>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />

      <header className={styles.hero}>
        <div className={styles.heroMedia}>
          {/*
            next/image rather than a CSS background (which is how /trips does
            it): this page's whole job is to load fast for someone who clicked a
            link in an email. Alt text describes the pair, not the course — the
            copy names no venue and neither should the accessibility layer.
          */}
          <Image
            src="/images/events/father-son.jpg"
            alt="A father and his son standing together on a putting green beside the ocean"
            fill
            priority
            sizes="(max-width: 1000px) 100vw, 58vw"
            className={styles.heroImage}
          />
        </div>
        <div className={styles.heroPanel}>
          <p className={styles.eyebrow}>Applications open · Location and dates to be announced</p>
          <h1 className={styles.h1}>{EVENT_NAME}</h1>
          <p className={styles.heroSub}>
            Three days of golf for dads bringing a kid into the game. You play a full round every
            day. Your kid gets a lesson, a practice round, and a father-son competition to finish.
          </p>
          <a href="#apply" className={styles.heroCta}>
            Apply for the first trip
          </a>
          <p className={styles.heroNote}>
            Takes a minute. Nothing to pay, nothing to commit to.
          </p>
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.section}>
          <h2 className={styles.h2}>The idea</h2>
          <div className={styles.prose}>
            <p>
              Most dads we talk to get stuck in the same place. They want to take their kid on a
              golf trip. They don&apos;t want that kid&apos;s first real round to be five hours of
              holding up the group behind, and they don&apos;t want to give up their own golf to
              make it work. So it stays a someday trip.
            </p>
            <p>
              This is our attempt at the version that actually works, which meant giving the two of
              you separate days that meet in the middle. Dads play real golf — a full round every
              day, on a course worth flying for. Kids get their own track with a teaching pro,
              pitched at a kid who can already swing a club but hasn&apos;t played much golf, and
              paced so that nothing about it feels like being tested. Then everyone eats dinner
              together and lies about how it went.
            </p>
            <p>
              Planning a trip like this is the reason Golf Trip Index exists in the first place.
              Picking a good course is the easy part; the tee time order, the lodging, the drive
              from the airport, and what a nine-year-old does between four and six o&apos;clock are
              the parts that decide whether anyone wants to come back. We do that work for other
              people&apos;s trips. This one we&apos;re running ourselves.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>How the three days work</h2>
          <div className={styles.days}>
            <article className={`${styles.day} whiteRoundedBox`}>
              <p className={styles.dayLabel}>Day one</p>
              <h3 className={styles.dayTitle}>The lesson</h3>
              <p>
                You play your round. Your kid spends the time with a teaching pro — tidying up the
                swing they already have, working through a few clubs, and enough short game to be
                useful tomorrow. Not a first lesson, and not swing theory. No video.
              </p>
            </article>

            <article className={`${styles.day} whiteRoundedBox`}>
              <p className={styles.dayLabel}>Day two</p>
              <h3 className={styles.dayTitle}>The practice round</h3>
              <p>
                The kids go out on a golf course, most of them for the first time. Forward tees, a
                handful of holes, no card and no score. It exists so that day three isn&apos;t
                anyone&apos;s first time walking onto a tee. You play your own round again.
              </p>
            </article>

            <article className={`${styles.day} whiteRoundedBox`}>
              <p className={styles.dayLabel}>Day three</p>
              <h3 className={styles.dayTitle}>The competition</h3>
              <p>
                A short father-son competition, set up so a new golfer can contribute and a bad
                hole can&apos;t sink you. It&apos;s the reason the kids take days one and two seriously.
                It is not the reason to come.
              </p>
            </article>
          </div>
          <p className={styles.caveat}>
            Tee times, the exact competition format, and how long the kids&apos; sessions run all
            depend on the host resort, so we&apos;re not going to pretend to know them yet. The
            shape of the three days doesn&apos;t change.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Who it&apos;s for</h2>
          <div className={styles.fitGrid}>
            <article className={`${styles.fitCard} whiteRoundedBox`}>
              <h3 className={styles.fitTitle}>This is built for you if</h3>
              <ul className={styles.fitList}>
                <li>Your kid is roughly 6 to 14 and can already swing a club — they&apos;ve hit balls, they make contact more often than not.</li>
                <li>They haven&apos;t played much actual golf yet. Range trips and a few holes in the evening is the sweet spot; they don&apos;t need a single full round behind them.</li>
                <li>You want to keep playing proper golf on your own trip, not caddie for three days.</li>
                <li>You&apos;d rather your kid&apos;s first real rounds happened somewhere good, with someone who teaches kids for a living.</li>
                <li>You&apos;re happy paying for a real golf trip for two.</li>
              </ul>
            </article>

            <article className={`${styles.fitCard} whiteRoundedBox`}>
              <h3 className={styles.fitTitle}>Look elsewhere if</h3>
              <ul className={styles.fitList}>
                <li>Your kid has never held a club. Day one is a lesson, not a first lesson, and day two puts them on a golf course — start them at home and come next year.</li>
                <li>Your kid plays junior tournaments and wants a scoring event. This is not that, and they&apos;d be bored.</li>
                <li>You want a full instructional academy week. The kids get taught, but the trip is built around golf and time together, not a curriculum.</li>
                <li>You&apos;re looking for childcare while you play. Days one and two give your kid somewhere to be, but this is a trip you take together.</li>
                <li>You need to know the venue and the dates before you&apos;ll raise your hand. Fair enough — we&apos;ll be in touch when we have them.</li>
              </ul>
            </article>
          </div>
          <p className={styles.caveat}>
            The name says father-son. If your family doesn&apos;t line up with that exactly, apply
            anyway and tell us in the form.
          </p>
        </section>

        <section className={styles.applySection} id="apply">
          <h2 className={styles.h2}>Apply</h2>
          <p className={styles.applyIntro}>
            One cohort is being planned. This is a waitlist, not a booking — there&apos;s nothing to
            pay and no date to choose, because there isn&apos;t one yet. Tell us who&apos;s coming
            and where you&apos;d be flying from, and we&apos;ll come back to you as the details firm
            up.
          </p>
          <ApplyForm event={EVENT_NAME} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Questions we&apos;re already getting</h2>
          <div className={styles.faq}>
            {FAQ.map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary className={styles.faqSummary}>
                  <h3 className={styles.faqQ}>{item.q}</h3>
                  <span className={styles.faqChevron} aria-hidden="true" />
                </summary>
                <p className={styles.faqA}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
