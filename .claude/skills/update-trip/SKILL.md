---
name: update-trip
description: Use when the user wants to update, fill in, edit, or review a trip's content in Airtable. Triggers on "update trip", "fill in trip", "edit trip", "add content to trip", or any reference to updating specific trip sections (verdict, experience, cost, itinerary, etc.).
metadata:
  version: 1.2.0
---

# Update Trip Skill

You are helping the user populate or update a golf trip's content in Airtable. You work section by section, presenting a review after each section is written before saving. The user can provide content directly, ask questions, or ask you to research and write it.

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

---

## Step 2 — Load current data

Run the fetch script:

```bash
source <(grep AIRTABLE_API_KEY /workspaces/golftripindex/.env.local | sed 's/^/export /') && source <(grep AIRTABLE_BASE_ID /workspaces/golftripindex/.env.local | sed 's/^/export /') && npx tsx /workspaces/golftripindex/scripts/fetch-trip-editor-data.ts <slug>
```

Parse the JSON output. Hold `tripId`, `completeness`, `currentValues`, and `linkedRecords` in memory for the session. Also hold the `Data Dump` and `Overview` fields — use them as context when researching or writing any section.

---

## Step 3 — Offer want_more migration

Check `linkedRecords.wantMoreCourses` in the loaded data. If any courses are listed with `alreadyInSideTrips: false`, surface the migration offer before anything else:

> **[Trip Name]** has [N] course(s) marked as "want more" that could become Side Trips:
> - [Course Name] (ranked #X overall)
> - ...
>
> Want to migrate these to Side Trips? I'll link them to their Golf Course records so their rankings display automatically. You'll just need to add a description for each.

If the user says yes, for each course not already in side trips:
1. Ask for (or offer to write) the Text description — 2-4 sentences on what the course is, why it's worth the extra day, and one specific detail
2. Create a TripSideTrips record with: Name = course name, Slug = course slug, Golf Course = [courseId], Text = description, Sort Order = next available
3. Do NOT delete or modify the TripCourse record — it stays as-is

If the user says no or skips, proceed to Step 4.

---

## Step 4 — Always ask scope first

After any migration step, show a one-line status for each section (Complete / Partial / Empty / X rows). Then always ask:

> **[Trip Name]** — X of 12 sections complete.
>
> Do you want to update a **specific section**, or walk through the **entire trip**?

If they name a section, jump directly to it. If they say "all" or "entire trip", walk through all 12 sections in order, starting with any that are incomplete.

If they say something like "check if pricing is still current" or "see if tee times have changed", treat that as targeting a specific section and jump there.

---

## Step 4 — Section loop

For each section being worked:

1. **Show current state** — display the existing value(s), or "Empty" / "0 rows" if blank
2. **Ask what to do** — user can provide content, ask a question, request a draft, or skip
3. **Handle the response** (see below)
4. **Present for review** — always show the complete drafted content before saving
5. **Save after approval** — only write to Airtable after the user says "save", "looks good", or equivalent
6. **Confirm save** — check API response for success, then move to next section

---

## Handling responses

### User provides content directly
Show it back formatted, ask "Ready to save this?" then save on confirmation.

### User asks a question
Search Exa for a web-based answer:
```
mcp__claude_ai_Exa__web_search_exa: "[trip name] [topic] [current year]"
```
Answer the question using both the Exa results and the trip's existing Airtable context (Data Dump, Overview). Then return to the same section prompt.

### User says "write it", "draft it", "help me", or "write the whole thing"
Research using both sources:

1. **Airtable context** — read `Data Dump`, `Overview`, and any existing field values for background
2. **Exa search** — search for current, specific information:
   - `"[destination] [topic] [year]"` (e.g. `"Bandon Dunes tee time rules 2025"`)
   - Use at least one search per section to get current facts, pricing, and conditions
3. **Calibrate against Bandon Dunes** — before finalizing the draft, compare it to the corresponding Bandon Dunes field. Match the length, tone, and specificity. If the draft is vaguer or shorter, revise it.

Draft the content in the Golf Trip Index voice (see Style rules). Present the full draft clearly labeled **DRAFT**, then ask:
> Does this look right? Say "save", make edits inline, or ask me to revise specific parts.

Do not save until the user approves.

### User says "check if this is still current" or asks about recent changes
Search Exa with the current year in the query. Compare results against the existing Airtable value. Report:
- What appears to have changed
- What appears the same
- Specific suggested updates with the proposed new text

Show the proposed update labeled **PROPOSED UPDATE**, ask to confirm before saving.

### User says "skip"
Move to the next section without saving anything.

### User says "keep it" or "that's fine"
Move to the next section without changes.

---

## Section-specific guidance

Each section follows the same research-first pattern when drafting from scratch:
1. Search Exa with the queries listed for that section
2. Cross-reference findings with the trip's Data Dump and Overview
3. Propose the content — present as **DRAFT** or **PROPOSED**, labeled clearly
4. Wait for the user to confirm, edit, or reject before saving anything

Skip the research step only if the user provides content directly.

---

### 1. Core info
Fields: Name, Subheader, Verdict

**Research first (when drafting):**
1. Search Exa: `"[trip name] golf review [year]"` and `"[trip name] golf trip [year]"`
2. Cross-reference with Data Dump and Overview — identify the defining characteristic, what editorial consensus says about this destination, who the trip is genuinely for
3. Propose Subheader and Verdict as **DRAFT** — confirm before saving

- **Name**: rarely needs changing; confirm it's correct
- **Subheader**: one sentence, the trip's defining quality
- **Verdict**: 2-4 sentences. Honest editorial take — what makes it genuinely worth doing and who it's for. Not hype.

Handle all three fields together as one section. Show all current values upfront.

---

### 2. The Experience
Fields: Full Description, Pull Quote, Want More

**Research first (when drafting):**
1. Search Exa: `"[trip name] golf courses review [year]"` and `"[destination] best holes what makes it special"`
2. Look for: what standout moments the destination is known for, specific holes or design features referenced repeatedly, what experienced golfers say about returning
3. Cross-reference with Data Dump — compile a list of specific details, identify one defensible pull quote candidate, and note what nearby courses or extensions exist for Want More
4. Propose the key themes and pull quote candidate for approval before drafting full text

Handle as one section. Show all three current values upfront.

- **Full Description**: 600-800 words. Flowing paragraphs, no headers. Opinionated and specific. Closes with what to book first. Embed the pull quote inline using a blockquote:
  ```
  > "The exact pull quote sentence."
  ```
  Place it after the paragraph that introduces the claim. The page renders it as a styled green-bordered callout. Markdown links are supported: `[text](url)`.
- **Pull Quote**: one sentence. Store it here as a plain string for reference — the rendered callout comes from the blockquote embedded in Full Description.
- **Want More**: 1-2 paragraphs. For golfers who want to extend the trip — adjacent courses, extra days, what to add on. Markdown links supported.

---

### 3. Side Trips (TripSideTrips linked records)

**Research first (when drafting or "write them all"):**
1. Search Exa: `"golf courses near [destination]"` and `"things to do near [destination] golfers"`
2. Cross-reference with Data Dump for any courses or attractions already mentioned
3. Propose a candidate list — golf and non-golf — with a one-line rationale for each. Confirm the list before writing descriptions or creating records.

Show current rows as a numbered list. For each, show type and ranking if applicable:
- Golf: "1. Bandon Crossings — Golf, #87 overall"
- Non-golf: "2. Shore Acres State Park — [first line of text]"

Options the user can pick:
- Add a new side trip
- Edit one (by number)
- Remove one
- "Write them all" — research and draft the full list from scratch
- Done with this section

**Determining type when adding:**
Ask the user if it's a golf course or a non-golf destination. This determines the Golf Course link and the image path.

- **Golf side trip**: link the Golf Course field to the matching GolfCourse record (look it up by name or slug in GolfCourses table). Use the course's existing slug for the TripSideTrip Slug — image will be served from `/images/courses/{slug}.jpg`. The Golf Course link is what drives the ranking display; no separate isGolf flag is stored.
- **Non-golf side trip**: leave Golf Course blank. Slug is a short URL-safe identifier — image served from `/images/side-trips/{slug}.jpg`.

**Text** for all side trips: maximum 50 words. What it is, why it's worth doing, the one specific detail that makes it worth knowing.

When the user is done making edits, show the full proposed list and ask to confirm before saving any changes.

To look up a GolfCourse record ID by slug:
```bash
source <(grep AIRTABLE_API_KEY /workspaces/golftripindex/.env.local | sed 's/^/export /') && \
curl -s "https://api.airtable.com/v0/apptoCOaJ1ve0VRpL/tblNI7uox5fs0RhQU?filterByFormula=%7BSlug%7D%3D%22{slug}%22&maxRecords=1" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY"
```

---

### 4. Right for You
Fields: Fit Yes, Fit No

**Research first (when drafting):**
1. Search Exa: `"[trip name] golf trip review [year]"` and `"[destination] golf who is it for worth it"`
2. Look for: what reviewers praise (recurring positives), what they warn about (recurring complaints or caveats), what type of golfer is repeatedly mentioned
3. Propose a draft yes list and no list as **DRAFT** — confirm before saving

Handle as one section. Show both current values upfront.

- **Fit Yes**: "Book this trip if…" items, one per line, 6-8 items. Specific: group size, budget, playing ability, priorities.
- **Fit No**: "Skip this trip if…" items, one per line, 4-6 items. Same specificity.

---

### 5. Cost (TripCostRows linked records + Cost Tier)
Fields: Cost Tier, Cost Note (on GolfTrips) + TripCostRows linked records

**Research first (when drafting):**
1. Search Exa: `"[trip name] tee fees [year]"` and `"[destination] golf lodging rates [year]"`
2. Note shoulder vs. peak pricing differences if mentioned. Cross-reference with Data Dump for any existing pricing references.
3. Propose draft cost rows — show as a table with ranges — and confirm before creating records

Show current rows in a table: Line | Peak | Shoulder | Off-Season. Also show current Cost Tier and Cost Note.

TripCostRows fields: Line (singleLineText), Peak (singleLineText), Shoulder (singleLineText), Off-Season (singleLineText), Sort Order (number). The Optional (checkbox) field exists in Airtable but is not used.

Standard line items:
- Tee fees (X rounds)
- Lodging (X nights)
- Food & drink on property
- Travel (flight + drive)
- Caddie

After all rows are set, show a total range across **all rows** (including caddie) and ask the user to confirm it makes sense before saving. Do not exclude any line items from the stated total — the Cost Note total must match what you get by summing every row in the table.

Also ask if Cost Tier (1-5) needs updating.

**Cost Note**: one sentence shown below the cost table clarifying the basis for estimates. State the all-in total that matches the sum of all rows — e.g. "Per-person estimates for a 4-round, 4-night trip with a group of 4 sharing lodge rooms. All-in with caddie: $X–$Y peak, $X–$Y shoulder." Be specific about group size, round count, and lodging type.

---

### 6. When to Go
Fields: Best Seasons, Peak Months, Peak Season Name, Peak Notes, Peak Verdict, Shoulder Months, Shoulder Season Name, Shoulder Notes, Shoulder Verdict, Off-Season Name, Off-Season Notes, Off-Season Verdict

**Research first (when drafting):**
1. Search Exa: `"[destination] golf best time to visit"` and `"[trip name] peak season prices [year]"`
2. Identify: which months see highest demand and pricing (peak), which offer good conditions at lower cost (shoulder), and what the off-season trade-offs are
3. Propose the peak/shoulder/off-season breakdown — specific months and a brief rationale for each — as **PROPOSED**. Confirm before setting fields and writing notes.

- **Best Seasons**: multi-select from Spring / Summer / Fall / Winter
- **Peak Months**: multi-select of highest-demand travel months
- **Peak Season Name**: one or two words naming the peak period — e.g. "Summer", "Summer & Fall". Shown as a heading in the season card. The page will derive this from the months if left blank, but setting it explicitly gives cleaner results for unusual periods.
- **Peak Notes**: 3-5 bullet points, one per line, describing peak season conditions — weather, pricing, booking lead time, who it's best for. Plain lines (no "Head: Body." format). Be specific to this destination.
- **Peak Verdict**: one sentence beginning "Best for:" — who this season is ideal for, e.g. "Best for first-timers who want ideal conditions and can plan far ahead." Shown at the bottom of the peak card.
- **Shoulder Months**: multi-select of good-value months with reasonable conditions
- **Shoulder Season Name**: one or two words naming the shoulder period — e.g. "Spring & Fall", "Fall". Same rules as Peak Season Name.
- **Shoulder Notes**: 3-5 bullet points, one per line, describing shoulder season trade-offs — what you gain, what you give up. Plain lines.
- **Shoulder Verdict**: one sentence beginning "Best for:" — who shoulder season suits, e.g. "Best for most groups — the smart trade-off between conditions and cost."
- **Off-Season Name**: one or two words naming the off-season period — e.g. "Winter", "December & January". Same rules as Peak Season Name.
- **Off-Season Notes**: 3-5 bullet points, one per line, describing off-season trade-offs — what you save, what you risk. Plain lines.
- **Off-Season Verdict**: one sentence beginning "Best for:" — who off-season suits, e.g. "Best for value-hunters who treat weather as part of the adventure."

---

### 7. Tee Times
Fields: Tee Time Rules, Lead Time

**Research first (when drafting):**
1. Search Exa: `"[trip name] tee time booking policy [year]"` and `"[destination] golf reservation access rules"`
2. Look for: lodging vs. day-guest access tiers, booking lead time, group size restrictions, any recent policy changes
3. Propose draft rules as a numbered list — confirm before saving

- **Tee Time Rules**: one rule per line in format `Head: Body.` (e.g. `Lodging drives access: Guests who book a room get priority tee time access.`)
- **Lead Time**: one sentence on booking horizon (e.g. "Lodge reservations open 13 months in advance.") **IMPORTANT: always show the current Lead Time value first and ask the user to confirm or update it before saving. Never overwrite a pre-existing Lead Time without explicit approval.**

---

### 8. Common Mistakes
Field: Common Mistakes

**Research first (when drafting):**
1. Search Exa: `"[trip name] golf tips what to know [year]"` and `"[destination] golf mistakes first time"`
2. Look through trip reports, forum threads, and review sites for recurring warnings — things first-timers get wrong on booking, packing, logistics, or on-course decisions
3. Propose 5-7 candidates as **DRAFT** — confirm the list before writing full items

One mistake per line in format `Head: Body.` — 5-7 items. Things golfers actually get wrong: booking, packing, on-course decisions, logistics. Each item should be specific enough that it would only apply to this trip.

---

### 9. Pack List
Fields: Pack Bring, Pack Leave

**Research first (when drafting):**
1. Search Exa: `"[destination] golf weather [typical peak month]"` and `"[trip name] what to pack dress code"`
2. Note: typical temperature range, precipitation likelihood, wind exposure, any course-specific gear requirements (walking only, dress code, cart restrictions)
3. Propose bring and leave lists as **DRAFT** — confirm before saving

Handle as one section.

- **Pack Bring**: one item per line. Gear specific to this destination — weather, terrain, course conditions. **Affiliate links are supported and encouraged** for gear items: `[Rain jacket](https://affiliate-url)`. Include links when there is a specific product worth recommending.
- **Pack Leave**: one item per line. Things that are dead weight or not allowed/needed. Affiliate links supported if relevant.

---

### 10. Itinerary (TripItinerary linked records)

**Research first (when drafting):**
1. Search Exa: `"[trip name] [X]-day itinerary"` and `"[destination] golf how many rounds [days] days"`
2. Note: typical travel times between courses and lodging, any courses that require specific day placement (arrival day, departure day), logical sequencing by difficulty or location
3. Propose a day-by-day outline for both min and max variants as **DRAFT** — confirm each before creating records

Handle **min days** and **max days** as two separate passes.

**Pass 1 — Min days ([X]-day itinerary):**
Show any existing min-day rows. Ask: provide them, ask questions, or "write it". Draft or accept the full day-by-day list, then present for review. Save on approval.

**Pass 2 — Max days ([Y]-day itinerary):**
After min is saved, move to the max variant. Same flow.

For each day row:
- **Day**: e.g. "Day 1", "Day 2"
- **Schedule**: e.g. "Arrive + Pacific Dunes" (brief, calendar-style)
- **Note**: 1-2 sentences of logistics detail — what to know about that day

After both variants are saved, ask for **Sample Itinerary Notes** (a footnote shown below the itinerary — e.g. "Tee times assume lodge guests. Day visitors should plan 30 days out.").

---

### 11. Stay & Eat
Fields: Lodging, Dining

**Research first (when drafting):**
1. Search Exa: `"[destination] golf resort lodging options [year]"` and `"restaurants near [destination] golf"`
2. Look for: named lodging types with booking programs and group-size use cases, on-property vs. off-property options, restaurants with specific strengths (post-round, group dinners, breakfast)
3. Propose a list of lodging options and dining spots with a one-line rationale for each — confirm the list before writing full entries

Handle as one section. Show both current values upfront.

Both fields use a structured markdown format — one entry per property or restaurant:

```
### Property or Restaurant Name
**Tag line or use case**
Description text. One paragraph. Named with decision logic. [Affiliate link](url) supported.

### Next Property
**Tag line**
Description.
```

- **Lodging**: Each entry is a named lodging option. Tag = "Best for groups of 8–12" type label. Description = decision logic for when to choose it, no filler. **Affiliate or booking links are supported and encouraged** for properties that have booking programs: `[Book the Bunkhouses](https://affiliate-url)`.
- **Dining**: Same format. Tag = "Nightly default" / "Post-round drinks" type shorthand. Description = what it's best for and when. Affiliate or booking links supported.

---

### 12. SEO
Field: SEO Description

**Research first (when drafting):**
1. Search Exa: `"[destination] golf trip"` — scan the top results to see how competitors describe this destination and what specific angles appear in titles and meta descriptions
2. Cross-reference with the trip's Subheader and Verdict for the key selling point and target audience
3. Propose 2-3 candidate descriptions (each 140-160 characters) as **DRAFT** — confirm before saving

140-160 characters. Specific to this trip — not generic golf copy. Include destination, key selling point, who it's for.

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

---

## End of session summary

When the user says "done" or after completing the last section, re-run the fetch script and display:

| Section | Status |
|---|---|
| Core info | Complete |
| The Experience | Complete |
| ... | ... |

Show the filled vs. total count. Call out anything still empty:
> Still empty: Common Mistakes, TripCostRows (0 rows)

Then ask: "Anything else to update before we wrap up?"

---

## Calibration reference — Bandon Dunes

**Before drafting any content, load the Bandon Dunes trip as a style benchmark.** It is the fully completed reference trip for tone, length, and editorial voice across every section.

Fetch it:
```bash
source <(grep AIRTABLE_API_KEY /workspaces/golftripindex/.env.local | sed 's/^/export /') && source <(grep AIRTABLE_BASE_ID /workspaces/golftripindex/.env.local | sed 's/^/export /') && npx tsx /workspaces/golftripindex/scripts/fetch-trip-editor-data.ts bandon-dunes
```

Use the Bandon Dunes content to calibrate:
- **Verdict**: match the sentence count, directness, and absence of hype
- **Full Description**: match the 600-800 word length, paragraph structure, and the way specific holes/moments anchor the writing
- **Fit Yes / Fit No**: match the specificity — items that could only apply to this trip, not any golf trip
- **Tee Time Rules**: match the `Head: Body.` format and the level of operational detail
- **Common Mistakes**: match the length per item and the specificity of the advice
- **Stay & Eat**: match the tag brevity (2-4 words), the decision-logic framing of descriptions, and the absence of filler
- **Cost rows**: match the range format (e.g. "$170-$410/night") and the line-item naming
- **Side Trips**: match the 2-4 sentence text length and the "one specific detail" closing

When drafting any section, ask yourself: does this match the quality and register of Bandon Dunes? If not, revise before presenting.

---

## Style rules (always apply to generated content)

- No em dashes. Use commas, colons, or restructure the sentence.
- No generic filler: "world-class", "breathtaking", "stunning", "incredible". Be specific.
- Write from the perspective of someone who has been there and has opinions.
- List items (Fit, Mistakes, Pack) must be specific enough they would only apply to this trip, not any golf trip.
- For long-form fields, use flowing paragraphs — no bullet points or headers inside field content.
- When in doubt about length or tone, compare directly against the corresponding Bandon Dunes field.
