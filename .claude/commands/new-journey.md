---
description: Create a new Golf Journey in Airtable, covering courses, stops, hotels, restaurants, and all copy, following GTI style standards
argument-hint: <journey name and details, or paste raw itinerary notes>
---

You are building a new Journey (LongTrip) in the GTI Airtable database. Work through the steps below in order. Do not skip steps.

**Writing rule: never use em dashes.** This applies to every piece of copy you write in this skill, including descriptions, hotels, restaurants, booking advice, and notes. Use a comma, colon, semicolon, or restructure the sentence instead. This is a hard rule with no exceptions.

---

## Step 1 — Load credentials

```bash
export $(cat .env.local | grep -v '^#' | grep '=' | xargs)
```

Confirm `AIRTABLE_BASE_ID` and `AIRTABLE_API_KEY` are set before proceeding.

---

## Step 2 — Gather journey details

If `$ARGUMENTS` contains itinerary notes or a description, extract the following. If anything is missing, ask the user before continuing:

- **Name** — the journey's display name
- **Slug** — lowercase, hyphenated (derive from name if not given)
- **Duration** — min and max days (integers)
- **Stars** — editorial quality rating from 0 to 5 in half-step increments (0, 0.5, 1, 1.5 … 5)
- **Cost Tier** — relative cost rating from 1 to 5 (integers only; 1 = budget, 5 = most expensive)
- **Stops** — ordered list, each with:
  - Location name
  - Overnight: yes or no
  - Courses to play (with importance: must play / should play / optional)
  - Any hotel or restaurant names the user mentioned
  - Any notes or commentary the user provided

Present your understanding back to the user as a structured list and ask for confirmation or corrections before writing anything to Airtable.

---

## Step 3 — Deduplicate courses

Before creating any course records, fetch the complete list of existing GolfCourses. The database has over 400 courses, so you must paginate through all pages before drawing any conclusions.

```bash
# Page 1
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/GolfCourses?pageSize=100&fields%5B%5D=Name&fields%5B%5D=Slug" \
  -H "Authorization: Bearer ${AIRTABLE_API_KEY}"

# If the response includes an "offset" value, fetch the next page:
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/GolfCourses?pageSize=100&fields%5B%5D=Name&fields%5B%5D=Slug&offset=OFFSET_VALUE" \
  -H "Authorization: Bearer ${AIRTABLE_API_KEY}"

# Continue until no "offset" is returned. Collect all records across all pages before proceeding.
```

For each course the journey needs, check the complete collected list by name (case-insensitive). If a clear match exists, record its Airtable ID and do not create a duplicate.

**If there is any ambiguity** (similar names, possible alternate spellings, same course name in different states), stop and ask the user before proceeding. Do not make assumptions about whether two names refer to the same course.

Only create records for courses that are definitively not in the existing list.

When creating new courses, use:
- `Name`: the display name as it will appear on the site
- `Slug`: lowercase, hyphenated, no special characters
- `State`: the state abbreviation or full name
- No ranking fields needed for non-Top-100 courses

---

## Step 4 — Research hotels and restaurants with Exa

For every overnight stop, run Exa searches to ground the Hotels and Restaurants copy in current sources. Do not skip this step or rely on training data alone.

### 4a — On-site lodging check

For each stop that has a named golf property (resort, lodge, or club), first check whether on-site lodging exists and whether it is recommended:

```
mcp__claude_ai_Exa__web_search_exa: "[property name] on-site lodging stay reviews"
mcp__claude_ai_Exa__web_search_exa: "[property name] hotel review golfers"
```

**Default to recommending on-site unless:**
- Search results contain explicit complaints about on-site lodging quality (multiple sources, not just one review)
- Results show that a nearby alternative is substantially better and commonly recommended over the on-site option
- The on-site option is clearly not golf-oriented (e.g., a casino hotel attached to a golf course as an afterthought)

If on-site lodging is confirmed as good, lead with it and treat other options as alternatives.

### 4b — Hotel research (per overnight stop)

```
mcp__claude_ai_Exa__web_search_exa: "best hotels near [location] golf trip [state]"
mcp__claude_ai_Exa__web_search_exa: "where to stay [location] golfers [year]"
```

Look for:
- Proximity to the courses
- Golfer-specific recommendations or amenities (early breakfast, bag storage, shuttle)
- Any clear consensus on a top choice vs. a value alternative
- Properties that appear repeatedly across multiple sources

### 4c — Restaurant research (per overnight stop)

```
mcp__claude_ai_Exa__web_search_exa: "best restaurants [location] [state] dinner"
mcp__claude_ai_Exa__web_search_exa: "where to eat [location] local favorites"
```

Look for:
- Named restaurants with specific descriptions (not "great atmosphere": actual cuisine and dishes)
- Locals' favorites vs. tourist traps
- A mix of: post-round casual, proper dinner, breakfast option
- On-site dining quality if staying at a resort property

### 4d — Booking advice research (per stop with golf)

```
mcp__claude_ai_Exa__web_search_exa: "[course name] tee time booking how to reserve"
mcp__claude_ai_Exa__web_search_exa: "[course name] book in advance lead time tips"
mcp__claude_ai_Exa__web_search_exa: "[resort name] lodging required tee time access"
```

Look for:
- How to book: phone vs. online, direct vs. third-party
- How far in advance to book (especially for demand courses)
- Whether on-site lodging is required or gives access priority for certain tee times
- Group booking minimums or restrictions
- Nearby courses that are easy to add without special requirements

**Do not include:** specific green fees, room rates, deposit amounts, or cancellation policies. General booking advice only.

### 4e — Notes and insider tips research (per stop)

Search public forums and editorial sources for on-the-ground intelligence:

```
mcp__claude_ai_Exa__web_search_exa: "[course name] tips advice forum golfwrx reddit"
mcp__claude_ai_Exa__web_search_exa: "[course name] best holes conditions when to play"
mcp__claude_ai_Exa__web_search_exa: "[location] golf trip tips things to know"
mcp__claude_ai_Exa__web_search_exa: "[resort or hotel name] review tips golfers"
```

Look for:
- Course secrets: favored tees, which nines play better in morning vs. afternoon, wind patterns
- Conditions advice: best season, how the course plays firm vs. soft, drainage
- Caddie and walking details: is walking required, caddie quality, forecaddie options
- Hotel insider tips: room types, views, what to request
- Area activities worth mentioning: non-golf things nearby that golfers commonly reference
- Any commonly shared warnings (book early, avoid certain holes from wrong tees, etc.)

Run all Exa searches in parallel where possible. Note which sources each finding came from.

---

## Step 5 — Write all copy

Using the Exa research from Step 4, write the following before making any Airtable calls. Present all drafts to the user for review.

### Description (short, one-liner)

One sentence. Follow this formula exactly:
"A [region] golf road trip from [start] through [key middle stops] to [end], [one specific closing detail]."

The closing detail must be concrete and specific: a course, a setting, a fact. No adjectives that do not earn their place. Never two sentences.

**Examples for calibration:**
- "A Pacific Northwest golf road trip from Seattle through central Washington to Coeur d'Alene, Idaho, finishing with a Spokane classic before flying home."
- "A north-to-south Alabama road trip from Huntsville through The Shoals, Birmingham, and Grand National to Capitol Hill, public golf at its most ambitious."

### Full Description (600–800 words)

Flowing paragraphs only. No headers, no bullets, no sections.

Structure:
1. **Opening (1–2 sentences):** What makes this trip distinct. Direct and opinionated.
2. **Body (stop by stop):** What makes each location special, which courses matter and why, how to approach them, where to stay. Be specific: architects, signature holes, what surprises people.
3. **Closing (1 paragraph):** Logistics: fly-in/out points, driving times between stops, what to book first.

Tone: written for a serious golfer planning a real trip. No generic travel writing. If something is the best, say it plainly.

### Stop Hotels (one paragraph per overnight stop)

Ground every recommendation in the Exa research. Lead with on-site lodging if it exists and sources support it. State the trade-off for any alternative clearly. Include proximity to courses. Give decision logic when two options are genuinely equal. Be honest if there is no good alternative. 3–5 sentences. No bullets.

**Example:** "Stay on property at The Inn at Gamble Sands. There is no other reasonable option in Brewster, and you do not need one. The Inn has 77 rooms split between River-View rooms overlooking the Columbia River and Golf-View rooms overlooking Scarecrow's fairways. Book Golf-View if you want to watch other groups play from your back porch. Book River-View if sunsets matter more."

### Stop Restaurants (one paragraph per overnight stop)

Ground every recommendation in the Exa research. Name specific places with their use case: post-round casual, splurge dinner, breakfast before a tee time. Note cuisine type when it helps. Be honest about limitations in remote locations. 3–5 sentences. No bullets.

**Example:** "Beverly's at the Coeur d'Alene Resort is the best fine dining in the area, with lake views and a Pacific Northwest-focused menu. Worth a reservation on arrival night. Anthony's at Coeur d'Alene is the better call for a casual post-round meal with waterfront seating. Tony's on the Lake is a local favorite for sunset dinners."

### Stop Booking Advice (per stop with golf courses)

Ground this in Exa research. Cover how and when to book, any lodging requirements for tee time access, group-specific requirements, and easy nearby add-ons. Write in flowing prose, not bullets.

**Do not include** specific green fees, room rates, deposit amounts, or cancellation policies.

Cover:
- How to book: phone vs. online, direct vs. third-party
- How far in advance to book and what fills up first
- Whether staying on-site unlocks preferred tee time access
- Any group minimums or restrictions
- Easy add-on courses nearby that require no special access

**Example (Kohler):** "Call Destination Kohler directly to book lodging and golf together; groups of eight or more must call rather than book online. Lock in lodging first, then coordinate tee times, as staying at a Destination Kohler property is effectively required to access preferred Straits Course tee times during peak season. The Bull at Pinehurst Farms in Sheboygan Falls is fully public and easy to add as a fifth round from this base without any stay requirement."

### Stop Notes (per stop)

Ground this entirely in Exa research from forums, reviews, and editorial sources. This is the insider intelligence section, not marketing copy, not a repeat of the Full Description. Write in paragraphs.

Cover any combination of:
- Course secrets: which tees to play, wind patterns, holes that punish the wrong approach
- Conditions: best season, how it plays firm vs. wet, drainage, morning vs. afternoon
- Caddie and walking details: whether walking is required, caddie quality, forecaddie options
- Hotel insider tips: room types worth requesting, views, amenities golfers commonly mention
- Area context: notable non-golf activities, nearby towns, anything golfers commonly reference online
- Practical warnings from forums: book this early, don't make this mistake, locals know this

**Example (Erin Hills):** "Erin Hills is walking-only with no exceptions; ADA accommodations require advance notice and documentation. Around 150 professional caddies are on staff, many of whom work at prominent clubs during the winter. The course hosted the 2017 U.S. Open and the 2025 U.S. Women's Open. The scale of the property is hard to grasp until you are on it: 650 acres of glacially sculpted terrain with exposed fescue that plays firm and fast in dry conditions. Forecaddie is available for groups and is the right call for a foursome that wants guidance without paying for four individual bags."

**Example (Sand Valley):** "All five Sand Valley courses are walking-only. The Lido is available Sunday through Thursday only for resort guests; Fridays and Saturdays are reserved for members and owners. It is a down-to-the-inch recreation of C.B. Macdonald's original 1914–1917 Lido Golf Club on Long Island, demolished by the U.S. Navy in WWII and rebuilt using historical records and aerial photography. Plan your resort dates around Lido availability first before booking anything else. Sedge Valley plays as a par-68 under 6,000 yards and rewards a second visit after the headline courses."

---

## Step 6 — Create Airtable records (in order)

**Do not proceed until the user has reviewed and approved the copy from Step 5.**

### 6a — Create new GolfCourse records (only those not found in Step 3)

Batch up to 10 per request:
```
POST /v0/{baseId}/GolfCourses
{"records": [{"fields": {"Name": "...", "Slug": "...", "State": "..."}}]}
```

Record the returned IDs alongside each course name.

### 6b — Check for duplicate LongTrip slug, then create

Before creating the trip, verify no existing LongTrip uses the same slug:

```bash
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/LongTrips?filterByFormula=%7BSlug%7D%3D%22YOUR_SLUG%22&fields%5B%5D=Name&fields%5B%5D=Slug" \
  -H "Authorization: Bearer ${AIRTABLE_API_KEY}"
```

If a record is returned, stop and notify the user before proceeding.

```
POST /v0/{baseId}/LongTrips
{"records": [{"fields": {
  "Name": "...",
  "Slug": "...",
  "Status": "published",
  "Duration Min Days": N,
  "Duration Max Days": N,
  "Description": "...",
  "Full Description": "...",
  "Stars": N,
  "Cost Tier": N
}}]}
```

Record the returned `id` as `TRIP_ID`.

### 6c — Create all Stop records

One API call per batch of up to 10:
```
POST /v0/{baseId}/Stops
{"records": [{"fields": {
  "Long Trip": ["TRIP_ID"],
  "Stop Order": N,
  "Location Name": "...",
  "Overnight": true/false,
  "Hotels": "...",
  "Restaurants": "...",
  "Booking Advice": "...",
  "Notes": "..."
}}]}
```

Record each returned stop `id`.

### 6d — Create all StopCourse records

Map importance values:
- Must play → `"must_play"`
- Should play → `"should_play"`
- Optional / want more → `"want_more"`

```
POST /v0/{baseId}/StopCourses
{"records": [{"fields": {
  "Stop": ["STOP_ID"],
  "Golf Course": ["COURSE_ID"],
  "Importance": "must_play|should_play|want_more"
}}]}
```

---

## Step 7 — Verify

Confirm the journey was created correctly:

```bash
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/LongTrips/TRIP_ID" \
  -H "Authorization: Bearer ${AIRTABLE_API_KEY}" | jq '{name: .fields.Name, stops: (.fields.Stops | length)}'
```

Then spot-check one stop to confirm StopCourses are linked:
```bash
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Stops/STOP_ID" \
  -H "Authorization: Bearer ${AIRTABLE_API_KEY}" | jq '{location: .fields["Location Name"], courses: (.fields.StopCourses | length)}'
```

---

## Step 8 — Remind about the hero image

Tell the user: a hero image is needed at `/public/images/journeys/{slug}.jpg` to complete the listing card on the journeys page.
