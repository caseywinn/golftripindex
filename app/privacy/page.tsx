import styles from "../../styles/privacy.module.css";
import type { Metadata } from "next";
import { SITE_URL } from "../../lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy | GolfTripIndex",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.updated}>
          Last updated: <span className={styles.updatedDate}>January 6, 2026</span>
        </p>
        <p className={styles.lead}>
          This Privacy Policy explains how GolfTripIndex (“GTI”, “we”, “us”, “our”) collects, uses,
          and shares information when you visit GolfTripIndex.com (the “Site”) or interact with our
          services. By using the Site, you agree to the practices described below.
        </p>
      </header>

      <section className={styles.card}>
        <div className={styles.section}>
          <h2 className={styles.h2}>1) Who we are</h2>
          <p className={styles.p}>
            GolfTripIndex (“GTI”) operates GolfTripIndex.com. We publish golf trip rankings, trip
            profiles, course references, and related editorial content.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>2) Information we collect</h2>
          <p className={styles.p}>
            We collect information in three primary ways: (a) information you provide, (b)
            information collected automatically when you use the Site, and (c) information from
            service providers (where applicable).
          </p>

          <div className={styles.columns}>
            <div className={styles.col}>
              <h3 className={styles.h3}>Information you provide</h3>
              <ul className={styles.ul}>
                <li>Contact details (e.g., name and email address) if you sign up or contact us.</li>
                <li>Account or program details if you apply to “Become a Rater” (if/when available).</li>
                <li>Content you submit (e.g., ratings, comments, photos, or trip notes).</li>
              </ul>
            </div>

            <div className={styles.col}>
              <h3 className={styles.h3}>Information collected automatically</h3>
              <ul className={styles.ul}>
                <li>Device and browser information (e.g., IP address, browser type, OS).</li>
                <li>Usage data (pages viewed, clicks, referral URLs, approximate location).</li>
                <li>Cookies and similar technologies (see Section 5).</li>
              </ul>
            </div>
          </div>

          <p className={styles.p}>
            We do not intentionally collect sensitive personal information (such as health, precise
            geolocation, or government identifiers). Please do not submit sensitive information to
            GTI.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>3) How we use information</h2>
          <p className={styles.p}>We use information to:</p>
          <ul className={styles.ul}>
            <li>Operate and improve the Site (performance, navigation, and content quality).</li>
            <li>Respond to inquiries and provide support.</li>
            <li>Send updates or newsletters if you opt in (you can unsubscribe at any time).</li>
            <li>Protect the Site, prevent abuse, and enforce our Terms.</li>
            <li>Measure engagement and understand which trips/pages are most useful.</li>
          </ul>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>4) When we share information</h2>
          <p className={styles.p}>
            We do not sell your personal information. We may share limited information in the
            following circumstances:
          </p>

          <ul className={styles.ul}>
            <li>
              <span className={styles.bold}>Service providers:</span> vendors who help us operate
              the Site (e.g., hosting, analytics, email delivery).
            </li>
            <li>
              <span className={styles.bold}>Legal and safety:</span> to comply with law, enforce our
              Terms, or protect GTI, users, and the public.
            </li>
            <li>
              <span className={styles.bold}>Business changes:</span> if GTI is involved in a merger,
              acquisition, financing, or sale of assets (information may be transferred as part of
              that transaction).
            </li>
          </ul>

          <p className={styles.p}>
            When we use service providers, we aim to share only what is necessary for them to
            perform their services.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>5) Cookies and analytics</h2>
          <p className={styles.p}>
            We use cookies and similar technologies to keep the Site functioning, remember basic
            preferences, and understand usage patterns.
          </p>

          <div className={styles.note}>
            <div className={styles.noteTitle}>Cookie categories (typical)</div>
            <ul className={styles.ul}>
              <li>
                <span className={styles.bold}>Necessary:</span> required for core site functionality.
              </li>
              <li>
                <span className={styles.bold}>Performance/analytics:</span> helps us understand what
                content is useful and improve the experience.
              </li>
              <li>
                <span className={styles.bold}>Preferences:</span> remembers choices like display
                settings (if implemented).
              </li>
            </ul>
          </div>

          <p className={styles.p}>
            You can control cookies through your browser settings. Disabling cookies may affect
            certain features.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>6) Email communications</h2>
          <p className={styles.p}>
            If you sign up for GTI emails, we may send you newsletters or product updates from time
            to time. Every email we send includes an unsubscribe link. You may also contact us to
            request removal from our mailing list.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>7) Data retention</h2>
          <p className={styles.p}>
            We retain personal information only as long as reasonably necessary for the purposes
            described in this Policy, including providing the Site, meeting legal obligations,
            resolving disputes, and enforcing agreements. Retention periods may vary depending on the
            nature of the information.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>8) Security</h2>
          <p className={styles.p}>
            We implement reasonable administrative, technical, and organizational safeguards designed
            to protect information. However, no method of transmission or storage is completely
            secure, and we cannot guarantee absolute security.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>9) Your choices and rights</h2>
          <p className={styles.p}>
            Depending on where you live, you may have rights to access, correct, delete, or object
            to certain processing of your personal information.
          </p>

          <ul className={styles.ul}>
            <li>
              <span className={styles.bold}>Unsubscribe:</span> opt out of marketing emails via the
              unsubscribe link.
            </li>
            <li>
              <span className={styles.bold}>Cookies:</span> manage cookies in your browser settings.
            </li>
            <li>
              <span className={styles.bold}>Requests:</span> contact us to request access, updates,
              or deletion (subject to legal and operational constraints).
            </li>
          </ul>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>10) Children’s privacy</h2>
          <p className={styles.p}>
            The Site is not directed to children under 13, and we do not knowingly collect personal
            information from children under 13. If you believe a child has provided us personal
            information, contact us and we will take appropriate steps to delete it.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>11) International visitors</h2>
          <p className={styles.p}>
            If you access the Site from outside the country where GTI operates, your information may
            be processed in jurisdictions with different data protection laws. We take reasonable
            steps to protect information consistent with this Policy.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>12) Changes to this Policy</h2>
          <p className={styles.p}>
            We may update this Privacy Policy from time to time. We will post updates on this page
            and revise the “Last updated” date above.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>13) Contact</h2>
          <p className={styles.p}>
            If you have questions about this Privacy Policy or want to make a request, contact us:
          </p>

          <div className={styles.contact}>
            <div>
              <div className={styles.contactLabel}>Email</div>
              <div className={styles.contactValue}>caddie@golftripindex.com</div>
            </div>
            <div>
            </div>
          </div>

          <p className={styles.pSmall}>
            If you submit a privacy request, we may need to verify your identity before responding.
          </p>
        </div>
      </section>
    </main>
  );
}
