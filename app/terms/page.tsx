import styles from "../../styles/terms.module.css";
import type { Metadata } from "next";
import { SITE_URL } from "../../lib/seo";

export const metadata: Metadata = {
  title: "Terms & Conditions | GolfTripIndex",
  alternates: { canonical: `${SITE_URL}/terms` },
};

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>Terms &amp; Conditions</h1>
        <p className={styles.updated}>
          Last updated: <span className={styles.updatedDate}>January 6, 2026</span>
        </p>
        <p className={styles.lead}>
          These Terms &amp; Conditions (“Terms”) govern your access to and use of GolfTripIndex.com (the “Site”) and any related services, features, or content offered through the Site (“Services”). By accessing or using the Site, you agree to these Terms. If you do not agree, do not use the Site.
        </p>
      </header>

      <section className={styles.card}>
        <div className={styles.section}>
          <h2 className={styles.h2}>1) Changes to these Terms</h2>
          <p className={styles.p}>
            We may update these Terms from time to time. The “Last updated” date will reflect the
            latest revision. Your continued use of the Site after changes are posted constitutes
            acceptance of the updated Terms.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>2) Intellectual Property and permitted use</h2>
          <p className={styles.p}>
            Unless otherwise stated, the Site and its content—including rankings, ratings, written
            reviews, editorial copy, design, graphics, layout, code, and other materials—are owned
            by GolfTripIndex (“GTI”) or licensed to GTI and protected by intellectual property laws.
          </p>

          <div className={styles.columns}>
            <div className={styles.col}>
              <h3 className={styles.h3}>You may</h3>
              <ul className={styles.ul}>
                <li>View and use the Site for personal, non-commercial use.</li>
                <li>Print or download reasonable excerpts for personal reference.</li>
              </ul>
            </div>

            <div className={styles.col}>
              <h3 className={styles.h3}>You may not (without permission)</h3>
              <ul className={styles.ul}>
                <li>Copy, republish, distribute, publicly display, or commercially exploit GTI content.</li>
                <li>Scrape, harvest, or systematically extract data from the Site.</li>
                <li>Rehost GTI content (including rankings) on another website or service.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>3) User content (submissions)</h2>
          <p className={styles.p}>
            Certain features may allow you to submit content (e.g., trip notes, course reviews,
            photos, comments, or other materials) (“User Content”). You retain ownership of your
            User Content, but by submitting it you grant GTI a royalty-free, perpetual, worldwide,
            non-exclusive license to use, reproduce, modify, adapt, publish, translate, distribute,
            display, and create derivative works from your User Content in connection with operating
            and promoting the Site and Services.
          </p>
          <p className={styles.p}>
            You represent and warrant that you have the rights necessary to submit the User Content,
            and that it does not infringe any third-party rights or violate applicable law.
          </p>
          <p className={styles.p}>
            GTI may (but is not obligated to) moderate, remove, or restrict User Content at its
            discretion.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>4) Acceptable use</h2>
          <p className={styles.p}>
            You agree to use the Site lawfully and in a manner consistent with these Terms. You may
            not:
          </p>
          <ul className={styles.ul}>
            <li>Post unlawful, abusive, harassing, defamatory, obscene, or invasive content.</li>
            <li>Post content you do not have the right to share, or that infringes others’ rights.</li>
            <li>Upload malware, viruses, or code designed to disrupt the Site.</li>
            <li>Send spam, bulk solicitations, or unauthorized advertising.</li>
            <li>Interfere with others’ use of the Site or attempt unauthorized access to systems.</li>
          </ul>
          <p className={styles.p}>
            GTI may suspend or terminate access to the Site (or portions of it) at any time if we
            believe you have violated these Terms.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>5) Rankings, ratings, and editorial content</h2>
          <p className={styles.p}>
            GTI rankings and ratings reflect GTI’s methodology and inputs at the time of publication.
            Rankings are inherently subjective and may change over time as criteria, availability,
            pricing, course conditions, and other variables evolve.
          </p>
          <p className={styles.p}>
            GTI does not guarantee that any trip, course, lodging, or experience will meet your
            expectations, be available, or remain unchanged. You are responsible for verifying
            details directly with relevant providers before booking or traveling.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>6) Links to third-party sites</h2>
          <p className={styles.p}>
            The Site may include links to third-party websites or services for convenience. GTI does
            not control those third parties and is not responsible for their content, policies, or
            practices. The inclusion of a link does not imply endorsement.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>7) Disclaimers</h2>
          <p className={styles.p}>
            The Site and Services are provided on an “as is” and “as available” basis. To the fullest
            extent permitted by law, GTI disclaims all warranties, express or implied, including
            implied warranties of merchantability, fitness for a particular purpose, and
            non-infringement.
          </p>
          <p className={styles.p}>
            GTI does not warrant that the Site will be uninterrupted, secure, or error-free, or that
            content will be accurate, complete, or current.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>8) Limitation of liability</h2>
          <p className={styles.p}>
            To the fullest extent permitted by law, GTI will not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or any loss of profits, data,
            goodwill, or business opportunity arising out of or related to your use of (or inability
            to use) the Site.
          </p>
          <p className={styles.p}>
            Nothing in these Terms limits liability that cannot be excluded under applicable law.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>9) Indemnification</h2>
          <p className={styles.p}>
            You agree to defend, indemnify, and hold harmless GTI from and against any claims,
            liabilities, damages, losses, and expenses (including reasonable legal fees) arising out
            of or related to your use of the Site, your User Content, your violation of these Terms,
            or your infringement of any third-party rights.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>10) Termination</h2>
          <p className={styles.p}>
            We may suspend or terminate your access to the Site at any time if we reasonably believe
            you have violated these Terms, created risk for GTI or other users, or engaged in conduct
            that is unlawful or harmful. Sections that by their nature should survive termination
            will survive.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>11) Severability and waiver</h2>
          <p className={styles.p}>
            If any provision of these Terms is found invalid or unenforceable, the remaining
            provisions will remain in effect. GTI’s failure to enforce any provision is not a waiver
            of our right to do so later.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>12) Promotions (if offered)</h2>
          <p className={styles.p}>
            If GTI runs a competition, giveaway, or promotion (“Promotion”), the specific rules for
            that Promotion will be posted on the applicable Promotion page and will form part of
            these Terms. In the event of a conflict between Promotion-specific rules and these
            Terms, the Promotion-specific rules will govern.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>13) Governing law and jurisdiction</h2>
          <p className={styles.p}>
            These Terms are governed by the laws of the jurisdiction where GTI is established,
            unless otherwise required by applicable law. If you access the Site from outside that
            jurisdiction, you are responsible for compliance with local laws.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.h2}>14) Contact</h2>
          <p className={styles.p}>
            Questions about these Terms can be sent to:
          </p>

          <div className={styles.contact}>
            <div>
              <div className={styles.contactLabel}>Email</div>
              <div className={styles.contactValue}>caddie@golftripindex.com</div>
            </div>
            <div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
