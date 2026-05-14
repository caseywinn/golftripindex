---
name: update-trip
description: Use when the user wants to update, fill in, edit, or review a trip's content in Airtable. Triggers on "update trip", "fill in trip", "edit trip", "add content to trip", or any reference to updating specific trip sections (verdict, experience, cost, itinerary, etc.).
metadata:
  version: 2.0.0
---

# Update Trip Skill

You are helping the user populate or update a golf trip's content in Airtable. You research and draft all sections automatically — no clarifying questions. Just work through the trip, present drafts for review, and save on approval.

**If the user provided extra details in the command** (e.g. `/update-trip bandon-dunes 4 rounds, 5 nights, peak price $800/night`) use them directly when drafting relevant sections. Do not ask for information the user already gave you.

## Airtable constants

- Base ID: `apptoCOaJ1ve0VRpL`
- GolfTrips table: `tblrGoUOTP5VnoM2F`
- TripCostRows table: `tblUFRi02u1Y52YXq`
- TripSideTrips table: `tblvOkUIeTSCuqNzt`
- TripItinerary table: `tbl5BReb1P5Fy6XhQ`

---

## Step 1 — Identify the trip

If the user provided a slug as an argument (e.g. `/update-trip bandon-dunes`), use it. Otherwise ask:
> Which trip do you want to update? Provide the slug (e.g. `bandon-dunes`) or the trip name.

This is the only question you ever ask unprompted.

---

## Step 2 — Load current data

Run both fetches in parallel: the target trip and the Bandon Dunes calibration reference.

```bash
source <(grep AIRTABLE_API_KEY /workspaces/golftripindex/.env.local | sed 's/^/export /') && source <(grep AIRTABLE_BASE_ID /workspaces/golftripindex/.env.local | sed 's/^/export /') && npx tsx /workspaces/golftripindex/scripts/fetch-trip-editor-data.ts <slug>
```

```bash
source <(grep AIRTABLE_API_KEY /workspaces/golftripindex/.env.local | sed 's/^/export /') && source <(grep AIRTABLE_BASE_ID /workspaces/golftripindex/.env.local | sed 's/^/export /') && npx tsx /workspaces/golftripindex/scripts/fetch-trip-editor-data.ts bandon-dunes
```

Hold `tripId`, `completeness`, `currentValues`, and `linkedRecords` in memory. Use `Data Dump` and `Overview` as primary research context throughout.

---

## Step 3 — Want More migration (automatic)

Check `linkedRecords.wantMoreCourses` in the loaded data. If any courses are listed with `alreadyInSideTrips: false`, automatically:

1. Write a description for each (2-4 sentences: what the course is, why it's worth the extra day, one specific detail)
2. Create a TripSideTrips record: Name = course name, Slug = course slug, Golf Course = [courseId], Text = description, Sort Order = next available
3. Do NOT delete or modify the TripCourse record

Show the new Side Trip cards in the draft output without asking for prior approval. The user can edit or remove them in the review pass.

---

## Step 4 — Research all sections

Before drafting, run Exa searches across all major sections in parallel where possible. Use the trip name and current year in every query. At minimum:

- `"[trip name] golf review [year]"` — general editorial context
- `"[destination] golf courses [year]"` — course-level detail for Full Description
- `"[trip name] tee time booking policy [year]"` — tee times
- `"[trip name] tee fees lodging rates [year]"` — cost
- `"[destination] golf best time to visit"` — seasons
- `"[destination] golf tips what to know [year]"` — common mistakes
- `"[destination] golf resort lodging restaurants [year]"` — stay & eat

Synthesize findings with the Airtable Data Dump and Overview. Then draft every section.

---

## Step 5 — Draft all sections

Draft all 12 sections in sequence. For each section:

1. **Show current state** briefly — one line: "Empty", "Partial", or a truncated preview of existing content
2. **Present your draft** — label it **DRAFT** and show the full proposed content
3. Do not ask for input between sections — finish the full pass first

After all sections are drafted, present a summary and say:
> Ready to save. Review each section above — say "save all", call out specific sections to revise, or mark any to skip.

Then save approved sections in sequence, confirming each API response before moving to the next.

---

## Section-specific guidance

---

### 1. Core info
Fields: Name, Subheader, Verdict

- **Name**: confirm it matches the slug — flag if not
- **Subheader**: one sentence, the trip's defining quality
- **Verdict**: 2-4 sentences. Honest editorial take — what makes it genuinely worth doing and who it's for. Not hype.

---

### 2. The Experience
Fields: Full Description, Pull Quote, Want More

**Full Description**: 600-800 words. Flowing paragraphs, no headers. Opinionated and specific. Closes with what to book first.

**Pull quotes — automatic extraction**: Read the Data Dump and Overview. Identify the two strongest, most specific claims in the existing text — sentences that are concrete, surprising, or definitive enough to stand alone. Embed them as blockquotes inline in the Full Description:

```
> "First pull quote sentence."
```
```
> "Second pull quote sentence."
```

The first blockquote goes in the first half of the writeup (after the paragraph that introduces that claim). The second blockquote goes in the second half. Do not ask for pull quote candidates — select the two strongest and embed them.

**Pull Quote field**: Store the first pull quote here as a plain string.

**Want More**: 3 paragraphs by default, 4 if there are many side trips. Structure:
- **Paragraphs 1–2**: Golf course side trips — frame the decision logic for each golf add-on: what kind of round it creates, who it's for, how it connects to the base trip. Split across two paragraphs, grouping by proximity, commitment level, or type (e.g. premium add-ons vs. value options).
- **Paragraph 3**: Non-golf side trips and anything else noteworthy about the area — parks, towns, activities, regional context. If no non-golf side trips exist, use this paragraph for lower-priority golf add-ons or regional context.
- **Paragraph 4** (when needed): Use when the golf or non-golf list is long enough that three paragraphs would feel rushed. Don't force it if three covers everything cleanly.

Do not repeat what the Side Trip cards already say; treat the cards as the detail layer and Want More as the connective frame. Lead with decision logic, not descriptions. No markdown links or hyperlinks of any kind in Want More — refer to side trips and courses by name only.

**Tightening existing Want More**: If a Want More value already exists, run a tightening pass before presenting. Aim for the 3–4 paragraph structure above. Check for:
- Sentences that restate what the Side Trip cards already say — cut them
- Filler openings ("If you find yourself...", "For those looking to...") — restructure to lead with the decision logic
- Vague qualifiers ("some", "many", "various") — replace with named places or specifics
- Any sentence that could apply to any golf trip — cut or sharpen

Present the tightened version as **REVISED** (not DRAFT) so the user knows it's an edit, not a blank-slate rewrite.

---

### 3. Side Trips (TripSideTrips linked records)

Show current rows as a numbered list. Draft any that are empty. For each:

- **Golf side trip**: link Golf Course field to the matching GolfCourse record. Image served from `/images/courses/{slug}.jpg`.
- **Non-golf side trip**: leave Golf Course blank. Image served from `/images/side-trips/{slug}.jpg`.
- **Text**: maximum 50 words. What it is, why it's worth doing, the one specific detail that makes it worth knowing.

To look up a GolfCourse record ID by slug:
```bash
source <(grep AIRTABLE_API_KEY /workspaces/golftripindex/.env.local | sed 's/^/export /') && \
curl -s "https://api.airtable.com/v0/apptoCOaJ1ve0VRpL/tblNI7uox5fs0RhQU?filterByFormula=%7BSlug%7D%3D%22{slug}%22&maxRecords=1" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY"
```

---

### 4. Right for You
Fields: Fit Yes, Fit No

- **Fit Yes**: "Book this trip if…" items, one per line, 6-8 items. Specific: group size, budget, playing ability, priorities.
- **Fit No**: "Skip this trip if…" items, one per line, 4-6 items. Same specificity.

Items must be specific enough they could only apply to this trip, not any golf trip.

---

### 5. Cost (TripCostRows linked records + Cost Tier)
Fields: Cost Tier, Cost Note (on GolfTrips) + TripCostRows linked records

Show current rows in a table: Line | Peak | Shoulder | Off-Season. Draft any missing rows.

TripCostRows fields: Line (singleLineText), Peak (singleLineText), Shoulder (singleLineText), Off-Season (singleLineText), Sort Order (number).

Standard line items:
- Tee fees (X rounds)
- Lodging (X nights)
- Food & drink on property
- Rental car / ground transport (never include flights)
- Caddie

**Never include flights in cost rows or Cost Note totals.** Flights vary too widely by origin to be meaningful. Ground transport (rental car, shuttle, etc.) is included; flights are not.

**Cost Note**: one sentence. State the all-in total that matches the sum of every row — e.g. "Per-person estimates for a 4-round, 4-night trip with a group of 4 sharing lodge rooms. Excludes flights. All-in: $X–$Y peak, $X–$Y shoulder." The Cost Note total must match what you get by summing every row.

Include a draft Cost Tier (1-5) recommendation with brief rationale.

---

### 6. When to Go
Fields: Best Seasons, Peak Months, Peak Season Name, Peak Notes, Peak Verdict, Shoulder Months, Shoulder Season Name, Shoulder Notes, Shoulder Verdict, Off-Season Name, Off-Season Notes, Off-Season Verdict

- **Best Seasons**: multi-select from Spring / Summer / Fall / Winter
- **Peak/Shoulder/Off-Season Months**: multi-select of months for each period
- **Season Name fields**: one or two words naming the period (e.g. "Summer", "Spring & Fall")
- **Notes fields**: 3-5 bullet points, one per line, plain lines (no "Head: Body." format). Specific to this destination.
- **Verdict fields**: one sentence beginning "Best for:" — who each season suits

---

### 7. Tee Times
Fields: Tee Time Rules only

- **Tee Time Rules**: one rule per line in format `Head: Body.`
- **Lead Time**: NEVER read, draft, or write this field. Skip it entirely in every pass.

---

### 8. Common Mistakes
Field: Common Mistakes

One mistake per line in format `Head: Body.` — 5-7 items. Things golfers actually get wrong: booking, packing, on-course decisions, logistics. Each item must be specific enough it would only apply to this trip.

---

### 9. Pack List
Fields: Pack Bring, Pack Leave

- **Pack Bring**: one item per line in format `Item name: Explanation.` — no leading article, capital after colon. Affiliate links supported and encouraged: `[Rain jacket](https://affiliate-url)`.
- **Pack Leave**: same format. Things that are dead weight or not allowed/needed.

---

### 10. Itinerary (TripItinerary linked records)

Draft min-day and max-day variants. For each day row:
- **Day**: e.g. "Day 1"
- **Schedule**: e.g. "Arrive + Pacific Dunes" (brief, calendar-style)
- **Note**: 1-2 sentences of logistics detail

After both variants, draft **Sample Itinerary Notes** (a footnote shown below the itinerary).

---

### 11. Stay & Eat
Fields: Lodging, Dining

Both fields use structured markdown:

```
### Property or Restaurant Name
**Tag line or use case**
Description text. One paragraph. Named with decision logic.

### Next Property
**Tag line**
Description.
```

- **Lodging**: Tag = use-case label (e.g. "Best for groups of 8–12"). Decision logic for when to choose it. Affiliate/booking links supported and encouraged.
- **Dining**: Tag = shorthand (e.g. "Post-round drinks"). What it's best for and when.

---

### 12. SEO
Field: SEO Description

140-160 characters. Include destination, key selling point, who it's for. Propose the single strongest option — no need for 2-3 candidates.

---

## Calibration reference — Bandon Dunes

Use the Bandon Dunes data loaded in Step 2 to calibrate every section:

- **Verdict**: match sentence count, directness, and absence of hype
- **Full Description**: match 600-800 word length, paragraph structure, and the way specific holes/moments anchor the writing
- **Fit Yes / Fit No**: match specificity — items that could only apply to this trip
- **Tee Time Rules**: match `Head: Body.` format and operational detail level
- **Common Mistakes**: match item length and specificity
- **Stay & Eat**: match tag brevity (2-4 words) and decision-logic framing
- **Cost rows**: match range format (e.g. "$170–$410/night") and line-item naming
- **Side Trips**: match the 2-4 sentence length and "one specific detail" closing

Before finalizing any section: does this match the quality and register of Bandon Dunes? If not, revise.

---

## Saving to Airtable

### Simple fields (on GolfTrips)

```bash
source <(grep AIRTABLE_API_KEY /workspaces/golftripindex/.env.local | sed 's/^/export /') && curl -s -X PATCH \
  "https://api.airtable.com/v0/apptoCOaJ1ve0VRpL/tblrGoUOTP5VnoM2F/<tripId>" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"<FieldName>": "<value>"}}'
```

For multi-select fields (Best Seasons, Peak Months, Shoulder Months), pass an array: `["Spring", "Fall"]`.

### Linked record: create

```bash
curl -s -X POST \
  "https://api.airtable.com/v0/apptoCOaJ1ve0VRpL/<tableId>" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"<field>": "<value>", "Golf Trip": ["<tripId>"]}}'
```

### Linked record: update

```bash
curl -s -X PATCH \
  "https://api.airtable.com/v0/apptoCOaJ1ve0VRpL/<tableId>/<recordId>" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"<field>": "<value>"}}'
```

### Linked record: delete

```bash
curl -s -X DELETE \
  "https://api.airtable.com/v0/apptoCOaJ1ve0VRpL/<tableId>/<recordId>" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY"
```

After each save, check the API response for `"id"` (success) or `"error"` (failure). On failure, report it and ask how to proceed before continuing.

**Full Description verification:** After saving the Full Description field, count occurrences of `> "` in the saved content. If fewer than two are present, the blockquotes were not embedded — re-save immediately with both pull quotes inserted at the correct positions before moving to the next section.

---

## End of session summary

After completing the last section, re-run the fetch script and display:

| Section | Status |
|---|---|
| Core info | Complete |
| The Experience | Complete |
| ... | ... |

Show filled vs. total count. Call out anything still empty:
> Still empty: Common Mistakes, TripCostRows (0 rows)

Then ask: "Anything else to update before we wrap up?"

---

## Style rules (always apply)

- No em dashes. Use commas, colons, or restructure the sentence.
- No generic filler: "world-class", "breathtaking", "stunning", "incredible". Be specific.
- Write from the perspective of someone who has been there and has opinions.
- List items (Fit, Mistakes, Pack) must be specific enough they would only apply to this trip, not any golf trip.
- For long-form fields, use flowing paragraphs — no bullet points or headers inside field content.
- When in doubt about length or tone, compare directly against the corresponding Bandon Dunes field.
