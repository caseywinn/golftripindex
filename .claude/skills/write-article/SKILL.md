---
name: write-article
description: Use when the user wants to write a new article for Golf Trip Index. Triggers on "write an article", "new article", "write article about", or any request to create editorial content for the site.
metadata:
  version: 1.0.0
---

# Write Article Skill

You are writing a new editorial article for Golf Trip Index. The user provides the topic and angle; you research, draft, and save it to Airtable. Always present content for review before saving anything.

## Airtable constants

- Base ID: `apptoCOaJ1ve0VRpL`
- Articles table name: `Articles`

---

## Head to Head (vs) articles

If the topic is a head-to-head comparison between two trips (e.g. "Bandon vs Pinehurst", "H2H: Streamsong vs Arcadia Bluffs"), skip the tone question and follow the H2H format below instead of the standard flow.

### H2H Step 1 — Fetch both trips' scores from Airtable

Look up both trips in the `GolfTrips` table by slug or name. Pull these fields for each:

- `Name`, `Slug`
- `Golf Rating`, `Lodging Rating`, `Food Rating`, `Beyond Golf Rating`, `Logistics Rating`, `Value Rating`, `Vibe Rating`, `Overall Rating`

```bash
source <(grep AIRTABLE_API_KEY /workspaces/golftripindex/.env.local | sed 's/^/export /') && \
curl -s "https://api.airtable.com/v0/apptoCOaJ1ve0VRpL/GolfTrips?filterByFormula=OR(%7BSlug%7D%3D%22SLUG-A%22,%7BSlug%7D%3D%22SLUG-B%22)&fields[]=Name&fields[]=Slug&fields[]=Golf+Rating&fields[]=Lodging+Rating&fields[]=Food+Rating&fields[]=Beyond+Golf+Rating&fields[]=Logistics+Rating&fields[]=Value+Rating&fields[]=Vibe+Rating&fields[]=Overall+Rating" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY"
```

These scores are the ground truth. The declared winner of each section must match whichever trip has the higher rating for that category. If scores are tied, the winner is a judgment call based on the trip data.

### H2H Step 2 — Draft Name and Teaser

- **Name format:** `Head to Head Series: [Trip A] vs [Trip B]`
- **Teaser:** 2 sentences. First sentence establishes what the two trips share. Second sentence says what the comparison actually examines and what it aims to determine.

Present and get approval before drafting the body.

### H2H Step 3 — Draft the article body

Use exactly this section structure (same order, same categories):

1. **Opening intro section** — thematic h2 header (not "Introduction"). 2–3 paragraphs. Establish what both trips have in common, then what makes this comparison interesting. End with a transition like "Here's how the full trip stacks up."
2. `##Image 1##`
3. `##The Golf##` — declare winner based on `Golf Rating`
4. `##The Lodging##` — declare winner based on `Lodging Rating`
5. `##Image 2##`
6. `##The Food and Drinks##` — declare winner based on `Food Rating`
7. `##Beyond Golf##` — declare winner based on `Beyond Golf Rating`
8. `##Logistics and Travel##` — declare winner based on `Logistics Rating`
9. `##Image 3##`
10. `##Value##` — declare winner based on `Value Rating`
11. `##Vibe##` — declare winner based on `Vibe Rating`
12. `##Image 4##`
13. `##Overall Verdict##` — declare winner based on `Overall Rating`. Tally the section wins and frame the final call.

**Winner line format:** End every category section (not the intro, not the verdict image) with a bolded winner declaration on its own line:
- Clear win: `**Winner: [Trip Name]**`
- Narrow win: `**Winner: [Trip Name] (barely)**`

**Tone rules specific to H2H:**
- Extremely opinionated. Every section takes a clear stance and argues it.
- Acknowledge what the losing trip does well, but don't soften the verdict.
- Be specific: name courses, architects, room types, food venues, travel logistics, prices.
- The Overall Verdict should reference which trip won more categories and why the final call still comes down to a single differentiating factor.
- No hedging, no "it depends on the golfer." These articles pick winners.

### H2H Step 4 — Save to Airtable

Slug format: `h2h-[trip-a-slug]-[trip-b-slug]` (e.g. `h2h-bandon-dunes-sand-valley`).

Then follow the standard Step 5 (Save to Airtable) and Step 6 (Confirm and hand off) below.

---

## Step 1 — Identify topic and length

If the user provided a topic as an argument (e.g. `/write-article best walking courses in the southeast`), use it. Otherwise ask what the article should be about.

Then ask:
> How long should this be?
> - **Short** (300–450 words)
> - **Medium** (500–700 words)
> - **Long** (800–1,100 words)
> - **Extra Long** (1,000–1,500 words)

Articles are opinionated by default — a clear argument, a strong point of view, a declared stance. If the user wants a different tone (celebratory, travel narrative, news/announcement, analytical), they can say so; otherwise write with conviction.

---

## Step 2 — Research

Run at least 2 Exa searches to gather current, specific information. Use targeted queries such as:
- `"[topic] [specific angle] [current year]"`
- `"[destination or subject] golf [supporting detail] [year]"`

Cross-reference search results with any Golf Trip Index trip data (Data Dump, Full Description fields) if the article relates to trips already in the system.

---

## Step 3 — Draft Name and Teaser

Draft both together — the Name is the headline, the Teaser is a 1–2 sentence subtitle that doubles as the meta description. Both should be punchy and specific.

Present as:

> **Name:** [Title]
> **Teaser:** [1–2 sentences]

Ask for approval or edits before proceeding. Do not draft the body until Name and Teaser are locked.

---

## Step 4 — Draft Full Text

Write the full article body. Structure guidelines:

- **Length:** Match the target the user chose in Step 1 — Short (300–450), Medium (500–700), Long (800–1,100), or Extra Long (1,000–1,500). Hit the range; don't pad to fill it.
- **Opening header:** The very first line of Full Text must be an h2 heading that titles the introduction section. This is a thematic header for the opening, not a copy of the Name field. Example: `##Beyond the Short List##` as the intro header for an article about underrated trips.
- **Sections:** Use `##Section Header##` for h2 headings (exactly this format — double hash on both sides, no space before or after the text inside)
- **Images:** Place `##Image 1##`, `##Image 2##`, etc. where images should appear inline. Limit to 2–4 images per article.
- **Inline formatting:** `**bold**` for emphasis, `[link text](url)` for links
- **Paragraph breaks:** blank line between paragraphs

### Trip linking

Any time a specific GTI trip is mentioned by name in the article body, link it to its trip page using the format `[Trip Name](/trips/{slug})`. Before drafting, query Airtable to get the slugs for any trips likely to be referenced:

```bash
source <(grep AIRTABLE_API_KEY /workspaces/golftripindex/.env.local | sed 's/^/export /') && \
curl -s "https://api.airtable.com/v0/apptoCOaJ1ve0VRpL/GolfTrips?fields%5B%5D=Name&fields%5B%5D=Slug&filterByFormula=%7BStatus%7D%3D%22published%22" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY" | \
  node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const r=JSON.parse(d).records; r.forEach(x=>console.log(x.fields.Name, '->', x.fields.Slug))"
```

Link every named trip on first mention. Do not repeat the link if the same trip appears again.

---

### Voice and style rules

- **Opinionated by default.** Take a clear stance. Argue it. Don't present "both sides" unless the article type calls for it.
- Say the uncomfortable thing. If one trip is better, say it. If a destination is overrated, say it.
- No em dashes. Use commas, colons, or restructure the sentence.
- No filler language: no "it's worth noting", "importantly", "at the end of the day", "undeniably"
- Named specifics: course names, architects, rankings, years, prices where relevant
- Do not write "Golf Trip Index" in the article body — write in first-person plural ("we") or third-person as needed
- Close with a clear landing: a recommendation, a call to action, or a pointed final observation
- If the user specified a different tone, honor it; otherwise default to conviction

### Image placement guidance

After presenting the full draft, list each image placeholder with:
- What the image should show
- Suggested filename: `{slug}.jpg` for the hero, `{slug}-{n}.jpg` for inline images (e.g. `best-walking-courses-1.jpg`)
- Whether it can be sourced from existing course/trip images in `/images/courses/` or `/images/articles/`

Present the full draft clearly labeled **DRAFT**, then ask:
> Does this look right? Say "save", make edits inline, or ask me to revise specific sections.

Do not save until the user approves.

---

## Step 5 — Save to Airtable

Once approved, save the article as a draft via the Airtable REST API:

```bash
source <(grep AIRTABLE_API_KEY /workspaces/golftripindex/.env.local | sed 's/^/export /') && \
curl -s -X POST "https://api.airtable.com/v0/apptoCOaJ1ve0VRpL/Articles" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "records": [{
      "fields": {
        "Name": "...",
        "Slug": "...",
        "Teaser": "...",
        "Full Text": "...",
        "Status": "draft",
        "Published On": "YYYY-MM-DD"
      }
    }]
  }'
```

**Slug:** derive from Name — lowercase, strip punctuation, replace spaces and special characters with hyphens. Example: "The Best Walking Courses" → `best-walking-courses`.

**Published On:** use today's date in `YYYY-MM-DD` format.

**Author:** leave blank unless the user specifies one.

---

## Step 6 — Confirm and hand off

After saving, confirm the record ID and tell the user:

1. The slug (so they know the URL: `golftripindex.com/articles/{slug}`)
2. What images are needed and what to name them
3. That the article is saved as **draft** — set Status to `published` in Airtable once images are uploaded
4. Hero image goes at `/images/articles/{slug}.jpg` (in the public directory or as an Airtable attachment on `Image 1` field labeled as hero)
5. Inline images go as Airtable attachments on `Image 1`, `Image 2`, etc. — or as files at `/images/articles/{slug}-{n}.jpg`
