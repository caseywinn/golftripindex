#!/usr/bin/env python3
"""
Create 35 TripSideTrips records for courses flagged as want_more in TripCourses
but missing from TripSideTrips. Text fields written from Exa research.
"""
import requests, time, re, os, sys

KEY = os.environ.get("AIRTABLE_KEY", "")
BASE = "apptoCOaJ1ve0VRpL"
COURSES_TBL     = "tblNI7uox5fs0RhQU"
SIDE_TRIPS_TBL  = "tblvOkUIeTSCuqNzt"
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

if not KEY:
    sys.exit("AIRTABLE_KEY env var not set")

def slugify(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9\s]", "", s)
    s = re.sub(r"\s+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")

def batch_create(tbl, rows):
    created = []
    for i in range(0, len(rows), 10):
        batch = rows[i:i+10]
        r = requests.post(
            f"https://api.airtable.com/v0/{BASE}/{tbl}",
            headers=H,
            json={"records": [{"fields": f} for f in batch]}
        )
        d = r.json()
        if "error" in d:
            raise Exception(f"batch_create error: {d}")
        created += d.get("records", [])
        print(f"  Created batch {i//10 + 1} ({len(batch)} records)")
        time.sleep(0.25)
    return created

def fetch_course_names(ids):
    """Fetch Name for a list of GolfCourse record IDs."""
    names = {}
    formula = "OR(" + ",".join(f'RECORD_ID()="{i}"' for i in ids) + ")"
    r = requests.get(
        f"https://api.airtable.com/v0/{BASE}/{COURSES_TBL}",
        headers=H,
        params={"filterByFormula": formula, "fields[0]": "Name", "pageSize": 100}
    )
    d = r.json()
    if "error" in d:
        raise Exception(d)
    for rec in d.get("records", []):
        names[rec["id"]] = rec["fields"].get("Name", "")
    return names

# ── records to create ──────────────────────────────────────────────────────────
# (course_id, trip_id, sort_order, text)
RECORDS = [
    # Cabo San Lucas
    (
        "recFjoXY3qB6uTnDm", "recF1hfAL9AubrCW9", 9,
        "Greg Norman's 2020 design plays 7210 yards through coastal dunes, desert scrub, and Pacific shoreline, with ocean views on every hole. Winds off the water make it play significantly harder than the card suggests, giving it a links feel closer to Doonbeg than a typical resort course. Ranked No. 16 in Mexico and the Caribbean by Golfweek, it rounds out a Cabo trip for golfers who want more oceanside exposure beyond Quivira."
    ),
    # Hawaii Big Island
    (
        "recl9Wtad083X0p1a", "rechB9g8nFfGQ9V1p", 3,
        "William Bell and Dick Wright's design sits above Keauhou on elevated terrain with sweeping ocean views from most holes. At 6494 yards it plays as a relaxed value round compared to the Kohala Coast resorts further north. A solid choice for an early morning tee time before heading to the beach."
    ),
    (
        "recEPNwvsxcAFocLa", "rechB9g8nFfGQ9V1p", 4,
        "A nine-hole par-3 walking course at the Auberge resort, completable in about an hour on the lava fields near the Pacific. The only short course of its kind on the Big Island, ideal as a warmup on arrival day or a quick close to the trip. Book through the Auberge concierge."
    ),
    (
        "rec0AE7WgeFpraIuk", "rechB9g8nFfGQ9V1p", 5,
        "The lower, oceanfront companion to Kona CC's Mountain course, with several holes routing along the Pacific coastline. Older and less manicured than the Kohala resorts but priced accordingly, and worth an afternoon if the other courses are full. Plays best as a casual add-on rather than a destination round."
    ),
    # Kingsmill / Williamsburg
    (
        "rect0AaZQbr7axPb0", "recrU1GynrWwceM69", 6,
        "Mike Strantz carved Stonehouse through forested hills and ravines in 1993, and a multi-year renovation completed in 2021 brought the 7013-yard layout back to peak form. Strantz courses are known for dramatic terrain use and minimal architectural compromise, and Stonehouse holds up as one of the best examples in the mid-Atlantic. About 45 minutes from Kingsmill and a significant change of scenery from the flat Williamsburg-area courses."
    ),
    (
        "recxIuEJL7Cdb8mGa", "recrU1GynrWwceM69", 7,
        "Tom Clark's 2007 design plays 7018 yards with overseeded Bermuda that holds color through the season, and the par-3 14th features a dramatically tiered green that plays differently at every pin position. Consistently underrated among Williamsburg's public options and well-conditioned throughout the year. A reliable fallback when Kingsmill's own courses are unavailable."
    ),
    (
        "recTJXK90S0gheeMP", "recrU1GynrWwceM69", 8,
        "Rees Jones designed the Green course in 1991, routing 7120 yards through tree-lined corridors in a layout that plays more forgiving than its sibling Gold course. The USGA has used it for multiple championships, which signals the conditioning and strategic challenge. Pairs naturally with the Gold for a full Colonial Williamsburg day."
    ),
    (
        "recb7v0Dpgr0DvDde", "recrU1GynrWwceM69", 9,
        "Dan Maples routed Blackheath through wooded land with water coming into play on 13 holes, closing on an island green at the 18th. Generally regarded as the best of the three Fords Colony courses, with conditions that hold through the season. About 15 minutes from Kingsmill and a sharper test than the Williamsburg municipal options."
    ),
    (
        "recbhNiIGdVC1P1T2", "recrU1GynrWwceM69", 10,
        "Robert Trent Jones Sr. called this his finest design when it opened in 1963, and Rees Jones updated it in 2017 without altering its character. The island green par-3 16th is one of the most photographed holes in Virginia and plays differently depending on the wind. The marquee round in Williamsburg for golfers not playing Kingsmill's own courses."
    ),
    (
        "rec5CmYsw0vUqd5ww", "recrU1GynrWwceM69", 11,
        "Nicklaus Design's 1995 layout plays at a relaxed pace with six holes that carry no bunkers, making it the most accessible of the Williamsburg options for higher handicaps. A good filler round for a group with mixed skill levels or an evening walk when the longer courses are closing. Well-maintained without the premium pricing of the resort layouts."
    ),
    (
        "recDQ2PUSgINzi5yB", "recrU1GynrWwceM69", 12,
        "Dan Maples routed the longest of the three Fords Colony courses through wetlands, with birds and wildlife common throughout the round. Plays at a lower intensity than Blackheath and functions well as an opening or closing round for a Williamsburg trip. About 15 minutes from Kingsmill."
    ),
    # Nemacolin
    (
        "rec7zwTUamJrOIs1a", "recCU7NmDypvFn8cc", 3,
        "Hurdzan and Fry's 1999 design in Ellwood City, Pennsylvania plays 7100 yards through exposed limestone outcroppings, with the 16th hole dropping 80 feet over 474 yards to a green framed by rock faces. Nationally acclaimed and a completely different character from Nemacolin's own mountain courses. About 45 minutes away and worth the drive for golfers with an extra morning."
    ),
    (
        "recumLkeCUbbyqJVj", "recCU7NmDypvFn8cc", 4,
        "A nine-hole par-3 course at the Historic Summit Inn Resort in Farmington, positioned on a mountaintop with 60-mile views across the Laurel Highlands. Plays in under two hours and sits minutes from Nemacolin. Best suited for arrival day or a quick finish before checkout."
    ),
    # NJ Pine Barrens
    (
        "recHprAOzRlxbVB2P", "recRbCWq0GEyruiBa", 9,
        "William Flynn laid out the Pines course in 1929 on the Seaview property, routing it through woodland with tight parkland fairways. Hosted the 1942 PGA Championship and carries more history than most public layouts in the region. Pairs naturally with the Seaview Bay course for a full day at one of New Jersey's oldest golf complexes."
    ),
    (
        "rec9dyzGy6jFzH2co", "recRbCWq0GEyruiBa", 10,
        "Stephan Kay built McCulloughs Emerald in 2002 on a former landfill in Egg Harbor, constructing replica holes modeled after Prestwick, Royal County Down, and other classic British links. Unusual and deliberately quirky, it attracts golfers who want something different from the Pine Barrens forest courses. A good one-time novelty round for a group that has already played the main destinations."
    ),
    (
        "recD79KT2aZM5JFPA", "recRbCWq0GEyruiBa", 11,
        "Ron Fream and David Dale opened Shore Gate in 2002 with bold mounding and penal bunkering that gives it an assertive links feel. Consistently listed among the best public courses in New Jersey and a natural complement to the pine forest routing of the core destination courses. A stronger test than most comparable public layouts in the state."
    ),
    (
        "recVNHr7Iwrw3u8bl", "recRbCWq0GEyruiBa", 12,
        "Harbor Pines routes through a residential neighborhood in Egg Harbor Township with water coming into play on several holes, most dramatically on the 12th. A calmer parkland character compared to the sandy Pine Barrens terrain, priced as a value option within the broader region. A reliable second-day filler when the core courses are booked."
    ),
    (
        "rec320t4arKcrZ5rf", "recRbCWq0GEyruiBa", 13,
        "Tom Fazio designed Pine Hill in 2000, placing it in the pines just a few miles from Pine Valley in what was considered one of the best new public courses of its era. Now operated as Trump National Philadelphia and no longer open to public play. Worth knowing as context for the area's deep concentration of strong layouts."
    ),
    (
        "recjxl4Fmi2mj4oQK", "recRbCWq0GEyruiBa", 14,
        "Stephen Kay's 1993 design routes 6810 yards through a residential community in Galloway, with six ponds affecting play on more than half the holes. The more established of the two Blue Heron courses, with a parkland feel that contrasts well with the sandy Pine Barrens originals. Consistently well-conditioned and a reliable option when the forest courses are full."
    ),
    (
        "recYyCyumv5Ib5cQU", "recRbCWq0GEyruiBa", 15,
        "Steve Smyers added the East course in 2000, stretching it to 7221 yards with a wide-open character and deep pot bunkers that give it a links feel uncommon in the region. More exposed and longer than the West course, making it the more demanding of the two. Pairs well with the West for a Blue Heron doubleheader."
    ),
    (
        "rec7SHMdbisiSPaNJ", "recRbCWq0GEyruiBa", 16,
        "Hugh Wilson and Donald Ross laid out the Bay course in 1914, routing it along Reed's Bay in a layout that plays as genuine links terrain with ocean wind exposure. Has hosted the LPGA Classic and remains one of the oldest continuously operated resort courses in the Northeast. A must-add for any Pine Barrens trip that extends into the Atlantic City area."
    ),
    # Puerto Rico
    (
        "recCdXuIO7i1lpjqM", "reczqYXTdNt5gxwBV", 8,
        "Robert Trent Jones Sr. built the East course in 1958, and Robert Trent Jones Jr. renovated it in 2011, preserving the ocean exposure on 15 of 18 holes while updating the greens throughout. Fast surfaces and Caribbean wind make it play more strategically demanding than its 6800-yard length suggests. The premier resort course on the island and a legitimate bucket-list round."
    ),
    (
        "recUyCZ0yvA3S5FjV", "reczqYXTdNt5gxwBV", 9,
        "Robert Trent Jones Sr. designed the West course as a companion to the East, with Ray Floyd updating it in 2003. Currently closed as of 2020; confirm status before building an itinerary around it. If available, it plays as a natural complement to the East for a full Dorado Beach day."
    ),
    (
        "recfQlNtIWXZAZJSX", "reczqYXTdNt5gxwBV", 10,
        "Chi Chi Rodriguez designed El Legado in Guayama on the south coast, routing 7200 yards across 285 acres with winds from the Cordillera Central adding difficulty. About 90 minutes from San Juan, it represents a completely different climate and character from the north coast resorts. A worthwhile addition for a group spending multiple days on the island."
    ),
    (
        "recVc3LrnjPPrjwKk", "reczqYXTdNt5gxwBV", 11,
        "Robert Trent Jones Jr. designed Bahia Beach in 2007, routing 15 holes near water through tropical jungle and along the Atlantic coast at the St. Regis in Rio Grande. Visually dramatic and notable for its combination of coastal and forest terrain within a single round. A strong option for golfers staying in northeastern Puerto Rico."
    ),
    (
        "recg0rdA1SYTJhl9y", "reczqYXTdNt5gxwBV", 12,
        "Chi Chi Rodriguez designed Dorado del Mar in 1998, routing water into play on more than 12 holes on the north coast near TPC Dorado. Ocean views from the clubhouse dining make it a reasonable option if TPC tee times are unavailable. A value round in the Dorado Beach corridor."
    ),
    (
        "recW8oy3EJlgtpPVo", "reczqYXTdNt5gxwBV", 13,
        "A 27-hole facility at the Hilton Ponce on the south coast, offering golf for groups spending time in Ponce rather than the San Juan metro. Reports on conditioning have been inconsistent, but it fills the slot for golfers who want to play during a southern Puerto Rico itinerary. Worth calling ahead on current status."
    ),
    (
        "rec4luFDvxxFKWbRG", "reczqYXTdNt5gxwBV", 14,
        "Rees Jones designed the Flamboyan course in 1998 on the former Palmas del Mar sugar plantation, routing wide fairways through gently rolling terrain about an hour from San Juan on the southeast coast. A relaxed, resort-paced round on a layout that holds up well without being demanding. The natural complement for golfers staying at the Palmas del Mar resort."
    ),
    # San Antonio
    (
        "reclOoBPcL9XnCz0S", "recexfiFajbABbdYb", 8,
        "Keith Foster built The Quarry in 1993 on the former Alamo Cement plant site, routing the front nine across surface terrain in links style and sending the back nine down into the quarry walls, where limestone faces frame the fairways. The 17th plays beside an active waterfall. One of the most architecturally distinctive public courses in Texas and a natural addition to any San Antonio trip."
    ),
    (
        "rec7QvUMPeYyktqti", "recexfiFajbABbdYb", 9,
        "Tripp Davis renovated Tapatio Springs in 2014 in Boerne, about 30 miles from downtown, routing through white limestone Hill Country terrain that plays as a strong visual contrast to the urban San Antonio courses. George Strait is a co-owner. A well-run resort course and a reliable extension of the trip for groups with a vehicle."
    ),
    (
        "reccgUsK9CWhpgeNe", "recexfiFajbABbdYb", 10,
        "Arthur Hills designed a 27-hole complex near Sea World, with the Oaks, Lakes, and Creeks nines available in any 18-hole combination. Wildlife crossings and authentic Hill Country terrain give it a more natural feel than the courses closer to downtown. A strong choice for a group that wants to stay in the resort corridor near the theme parks."
    ),
    (
        "recgRSFifuM2c47Tr", "recexfiFajbABbdYb", 11,
        "A.W. Tillinghast designed Brackenridge Park in 1916, making it the first municipal golf course in Texas and one of the oldest continuously operated public layouts in the country. Stone bridges, square greens, and tight parkland corridors give it a character unlike anything else in the city. On the National Register of Historic Places and worth a round for history-minded golfers."
    ),
    (
        "recvnExVLYDlZGGC4", "recexfiFajbABbdYb", 12,
        "Randy Heckenkemper designed SilverHorn in 1997, routing it through tree-lined Hill Country terrain in northwest San Antonio with input from tour pros. Consistently ranked in the top 25 public courses in Texas and carries a strong local following that keeps weekend tee times competitive. A reliable option for an extra day's play without driving outside the city."
    ),
    (
        "recZlWtTpKMtmu6gU", "recexfiFajbABbdYb", 13,
        "Thomas Walker designed Canyon Springs in 1998, earning Best New Public honors from both Golf Digest and Golf Magazine, with a loop design and limestone waterfalls on two holes. Now operated as Trump National San Antonio and no longer publicly accessible. Included for context on the area's range of historically strong public layouts."
    ),
    (
        "recAsHbFyNNhfghnk", "recexfiFajbABbdYb", 14,
        "Art Schaupeter routed The Republic along Salado Creek in 2002, with 13 holes incorporating water and heavily wooded corridors that give it a parkland feel distinct from the Hill Country courses. One of the closest affordable public options to the Alamo, with a layout that accommodates groups at a range of skill levels. A dependable fallback when other tee sheets are full."
    ),
]

def main():
    print(f"Fetching course names for {len(RECORDS)} courses...")
    course_ids = [r[0] for r in RECORDS]
    names = fetch_course_names(course_ids)
    print(f"  Got {len(names)} names")

    missing = [cid for cid in course_ids if cid not in names]
    if missing:
        print(f"WARNING: could not resolve names for: {missing}")

    rows = []
    for course_id, trip_id, sort_order, text in RECORDS:
        name = names.get(course_id, "")
        if not name:
            print(f"  SKIPPING {course_id}: no name found")
            continue
        slug = slugify(name)
        rows.append({
            "Name": name,
            "Slug": slug,
            "Sort Order": sort_order,
            "Text": text,
            "Golf Course": [course_id],
            "Golf Trip": [trip_id],
        })
        print(f"  Prepared: {name} (sort {sort_order})")

    print(f"\nCreating {len(rows)} TripSideTrips records...")
    created = batch_create(SIDE_TRIPS_TBL, rows)
    print(f"\nDone. Created {len(created)} records.")

if __name__ == "__main__":
    main()
