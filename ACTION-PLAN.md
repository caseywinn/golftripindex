# Golf Trip Index — SEO Action Plan
**Generated:** 2026-05-15 | Re-audit v2

---

## CRITICAL — Do First (This Week)

### 1. Deploy the 8 pending SEO fixes
**Effort:** 5 minutes | **Impact:** +15 points overall score

All fixes are implemented, TypeScript-clean, and sitting uncommitted in the working tree. Commit and push to main to trigger Vercel deployment.

Files to commit:
- `app/articles/page.tsx` — Title, H1, meta, alt text
- `app/courses/page.tsx` — ItemList schema
- `app/page.tsx` — Homepage meta description, alt text
- `app/sitemap.ts` — Adds /articles
- `app/trips/[slug]/[filterValue]/page.tsx` — H2 structure, slim payload
- `app/trips/[slug]/page.tsx` — FAQPage schema
- `app/trips/page.tsx` — ItemList schema, slim payload
- `components/TripsWithFilters.tsx` — Accepts slim TripListItem type

Expected results after deployment:
- `/trips` page load: 1.5MB → ~150KB (massive LCP improvement)
- FAQPage rich results eligible on all trip pages
- ItemList rich results eligible on /trips and /courses
- `/articles` H1 and correct title
- All major alt text fixed

---

## HIGH — Link Building (This Month, Ongoing)

This section addresses the root cause of zero rankings. On-page work alone will not produce results without at least 20-50 referring domains.

### 2. Golf course and resort websites
**Effort:** High | **Impact:** Critical

Every trip GTI reviews has a corresponding resort website. Reach out to:
- Bandon Dunes (bandondunesgolf.com) — request a "as seen on" or "featured in" link
- Sand Valley (sandvalley.com) — same approach
- Pinehurst (pinehurst.com) — same
- Streamsong, Kiawah Island, Sea Island, etc.

Approach: "We ranked your property #X in our 2026 Golf Trip Rankings. We'd appreciate a link from your press/media page." Resorts have media/press sections and actively maintain them.

### 3. Golf media outreach
**Effort:** High | **Impact:** Critical

Target publications that already write about golf trip rankings:
- Golf Digest (golfdigest.com) — pitch a "GTI ranks best golf trips" angle
- Golf.com — similar pitch
- GolfPass — they publish "best golf trips" already; could cite GTI's methodology
- No Laying Up (podcast/site) — architecture-forward audience aligns with GTI
- The Fried Egg (friedegg.com) — golf architecture media, overlapping audience
- Links Magazine — print + digital, covers destination golf

Target ask: mention GTI in an article about golf trip planning, or cite a specific ranking. One link from Golf Digest or No Laying Up would be worth more than 50 links from generic sites.

### 4. Golf course architecture forums and communities
**Effort:** Medium | **Impact:** Medium

Communities where architecture-focused golfers congregate:
- GolfClubAtlas.com forums — highly engaged, links from this domain carry weight
- ArchitectureOfGolf subreddit (Reddit)
- Architecture-focused golf Twitter/X accounts

Approach: share specific rankings or comparisons that would interest architecture fans (GTI's Sand Valley vs. Bandon Dunes head-to-head, for example).

### 5. State tourism boards
**Effort:** Medium | **Impact:** Medium

State golf/tourism sites often maintain "golf destination" resource pages:
- Oregon Tourism (traveloregon.com) — Bandon Dunes content
- Wisconsin Tourism (travelwisconsin.com) — Sand Valley/Kohler content
- North Carolina Tourism — Pinehurst content
- Florida Tourism — Streamsong, Cabot content

These are .gov/.org adjacent domains with meaningful authority. A listing as a "resource" or "rankings" site on a state tourism page is achievable.

### 6. Golf trip planning Facebook groups and Reddit
**Effort:** Low | **Impact:** Low-medium

Organic community participation:
- r/golf, r/golftravel on Reddit — answer trip planning questions with GTI links
- Golf trip planning Facebook groups — same approach
- Does not build backlinks directly but generates referral traffic, which Google measures

---

## HIGH — Content Expansion (This Month)

### 7. Expand region pages from thin to substantive
**Effort:** Medium | **Impact:** High for regional keyword ranking

Current state: region pages at `/trips/region/{slug}` show a heading + trip list. Zero editorial content.

Target state: 300-500 words of regional context per page, covering:
- What makes this region distinctive for golf
- Best time of year to visit
- How to structure a multi-destination trip in the region
- Key airport/travel logistics

Regions to prioritize (by search volume estimate):
1. Southeast (Florida, Georgia, South Carolina) — highest search volume
2. Midwest (Wisconsin, Michigan) — Sand Valley + Arcadia Bluffs
3. West (Oregon, California) — Bandon + Pebble
4. Mid-Atlantic (North Carolina) — Pinehurst

### 8. Create a "Best Golf Trips in [State]" pillar article series
**Effort:** High | **Impact:** High for long-tail ranking

Targets:
- "Best golf trips in Florida" — Streamsong, Cabot Citrus, Sawgrass, Innisbrook
- "Best golf trips in Michigan" — Arcadia Bluffs, Treetops, Bay Harbor, Giants Ridge
- "Best golf trips in Wisconsin" — Sand Valley, Kohler/Whistling Straits, Erin Hills
- "Best golf trips in Oregon" — Bandon Dunes, Silvies Ranch, Gamble Sands
- "Best golf trips in North Carolina" — Pinehurst, RTJ Trail, Tobacco Road

Each should be 1,500-2,000 words, target the exact query as H1, and link to individual trip pages. These are achievable rankings within 3-6 months of deployment + a few backlinks.

### 9. Add named author attribution
**Effort:** Low | **Impact:** Medium (E-E-A-T)

At minimum, the `/how-we-rate` page should name 2-3 raters with brief bios and credentials. Article bylines should show a real name, not "GTI Staff." Google's E-E-A-T scoring heavily weights identifiable human expertise for editorial content about travel and health.

---

## MEDIUM — Structural Improvements (Next 30 Days)

### 10. Fix course images alt text on /courses
**Effort:** Low | **Impact:** Low-medium

`/courses` table uses CSS `backgroundImage` on `<div>` elements, which cannot have alt text. Switch course thumbnails to `<img>` elements with `alt={c.name}`. This affects 100+ images.

### 11. Strengthen /trips page title tag
**Effort:** Low | **Impact:** Medium

Current: "Golf Trip Rankings | Golf Trip Index"  
Target: "Best Golf Trip Rankings 2026 | Golf Trip Index"

Adding "Best" and "2026" to the title matches the exact search queries users type.

### 12. Add ItemList schema to region pages
**Effort:** Low | **Impact:** Medium

Region pages at `/trips/region/{slug}` render a filtered trip list but have no structured data. Add an ItemList schema listing the filtered trips with position, name, and URL. This mirrors what was added to `/trips` and targets region-specific rich results.

### 13. Add Article schema to article pages
**Effort:** Low | **Impact:** Medium (E-E-A-T, rich results)

Article pages should have:
```json
{
  "@type": "Article",
  "headline": "article title",
  "datePublished": "2026-04-21",
  "dateModified": "2026-04-21",
  "author": { "@type": "Organization", "name": "Golf Trip Index" },
  "publisher": { "@type": "Organization", "name": "Golf Trip Index" }
}
```
This enables article rich results and strengthens E-E-A-T signals.

### 14. Add top trip URLs to llms.txt
**Effort:** Very low | **Impact:** Low-medium (AI visibility)

Current `llms.txt` describes content sections but does not enumerate individual trip URLs. AI crawlers that directly ingest `llms.txt` must discover trip pages through crawl. Add a section listing top 10-15 trip slugs to ensure AI systems can directly access the most important pages.

---

## LOW — Future Optimization

### 15. Develop a compare page SEO strategy
The `/compare/{slug-a}-vs-{slug-b}` pages are dynamically generated and contain excellent head-to-head content. They currently lack metadata, schema, and are not in the sitemap. A strategy for making top comparisons (Bandon vs. Sand Valley, Pinehurst vs. Kiawah) statically generated with proper titles and schema would unlock "Bandon Dunes vs Sand Valley" type queries.

### 16. Create a "how to plan a golf trip" pillar
A comprehensive guide targeting "how to plan a golf trip" (moderate competition, high volume) would:
- Target top-of-funnel golfers who aren't yet destination-specific
- Internally link to all destination pages
- Provide a backlink magnet that other sites might reference
- Serve as the entry point for first-time trip planners

### 17. Consider a press / media page
Create `/press` or `/media` with GTI's rankings, methodology description, and a media kit. This makes it easy for journalists writing about golf trips to find and cite GTI. The page itself becomes a linkable asset.

---

## Priority Matrix

| # | Task | Effort | Impact | Do When |
|---|------|--------|--------|---------|
| 1 | Deploy 8 pending fixes | 5 min | Critical | Today |
| 2-6 | Link building (outreach) | High | Critical | This month, ongoing |
| 7 | Expand region pages | Medium | High | This month |
| 8 | State pillar articles | High | High | This month |
| 9 | Named author attribution | Low | Medium | This week |
| 10 | Fix course image alt text | Low | Low | Next sprint |
| 11 | Strengthen /trips title | Low | Medium | Next sprint |
| 12 | ItemList on region pages | Low | Medium | Next sprint |
| 13 | Article schema | Low | Medium | Next sprint |
| 14 | llms.txt trip URLs | Very low | Low | Next sprint |
| 15-17 | Future structure | Medium | Low-Med | Backlog |

---

## 90-Day Ranking Forecast

Given the current zero-backlink state, realistic expectations with consistent execution:

**Days 1-7:** Deploy pending fixes. LCP improves, structured data goes live, articles title fixed. No ranking changes yet.

**Days 7-30:** Begin outreach. If 3-5 resort/media links acquired, Google may start crawling GTI more frequently.

**Days 30-60:** With 10-20 referring domains, expect to start appearing on page 3-5 for long-tail queries: "[destination] golf trip review", "is Bandon Dunes worth it", "best time to visit Sand Valley".

**Days 60-90:** With 20-50 referring domains and state pillar articles published, page 2-3 appearances for mid-tail queries: "best golf trips in [state]", "[destination] golf trip cost".

**Days 90-180:** With 50+ referring domains and continued content investment, page 1 appearances for mid-tail queries. Head terms ("best golf trips usa") remain competitive and require 100+ referring domains.

The path is clear. Content quality is not the constraint.
