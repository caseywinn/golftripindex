#!/usr/bin/env python3
"""
Add Chambers Bay and Coeur d'Alene course additions:
- Create GolfCourse records for Salish Cliffs, Trophy Lake, Indian Summer
- Patch existing GolfCourse records (Washington National, Newcastle, Indian Canyon)
- Update Chambers Bay TripCourses ranks (shift want_more to 9-10)
- Create TripCourses for all new courses
- Create TripSideTrips for Indian Canyon
"""
import requests, time, re, os, sys

KEY = os.environ.get("AIRTABLE_KEY", "")
BASE = "apptoCOaJ1ve0VRpL"
COURSES_TBL     = "tblNI7uox5fs0RhQU"
TC_TBL          = "tblTWo6qL0AOWqOCT"
SIDE_TRIPS_TBL  = "tblvOkUIeTSCuqNzt"
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

if not KEY:
    sys.exit("AIRTABLE_KEY env var not set")

def slugify(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9\s]", "", s)
    s = re.sub(r"\s+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")

def create_record(tbl, fields):
    r = requests.post(
        f"https://api.airtable.com/v0/{BASE}/{tbl}",
        headers=H,
        json={"fields": fields}
    )
    d = r.json()
    if "error" in d:
        raise Exception(f"create_record error: {d}")
    return d

def patch_record(tbl, record_id, fields):
    r = requests.patch(
        f"https://api.airtable.com/v0/{BASE}/{tbl}/{record_id}",
        headers=H,
        json={"fields": fields}
    )
    d = r.json()
    if "error" in d:
        raise Exception(f"patch_record error: {d}")
    return d

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
        time.sleep(0.25)
    return created

# ── Trip IDs ──────────────────────────────────────────────────────────────────
CHAMBERS_TRIP_ID = "recNJx6P0iAFYBmki"
CDA_TRIP_ID      = "recsdHiTXLwCfIPBQ"

# ── Existing TripCourses to update (Chambers Bay want_more, shift to higher ranks)
TC_HOME_COURSE   = "recthLqgIzgKRiR1C"  # Home Course, rank 4 -> 9
TC_NORTH_SHORE   = "reczoUCXNgLCteZRW"  # North Shore, rank 5 -> 10

# ── Existing GolfCourse record IDs to update ─────────────────────────────────
WASHINGTON_NAT_ID = "recTtslpIu6ZPo3s8"
NEWCASTLE_ID      = "recE1sDDjFSZRAJk2"
INDIAN_CANYON_ID  = "rec18QK5yoLnOXiRH"

def main():
    # ── 1. Create new GolfCourse records ──────────────────────────────────────
    print("Creating GolfCourse records...")

    new_courses = [
        {
            "Name": "Salish Cliffs Golf Club",
            "Slug": "salish-cliffs-golf-club",
            "Architect": "Gene Bates",
            "Year Opened": 2011,
            "City": "Shelton",
            "State": "WA",
            "Course Style": ["Forest", "Parkland"],
            "Access Type": "Public",
            "Walk Friendly": False,
            "Closed Off-Season": False,
            "Green Fee Peak": 125,
            "Green Fee Shoulder": 89,
            "Green Fee Off-Season": 55,
        },
        {
            "Name": "Trophy Lake Golf & Casting",
            "Slug": "trophy-lake-golf-casting",
            "Architect": "John Fought",
            "Year Opened": 1999,
            "City": "Port Orchard",
            "State": "WA",
            "Course Style": ["Forest", "Parkland"],
            "Access Type": "Public",
            "Walk Friendly": True,
            "Closed Off-Season": False,
            "Green Fee Peak": 99,
            "Green Fee Shoulder": 75,
            "Green Fee Off-Season": 55,
        },
        {
            "Name": "Indian Summer Golf & Country Club",
            "Slug": "indian-summer-golf-country-club",
            "Architect": "Peter Thomson & Michael Wolveridge",
            "Year Opened": 1992,
            "City": "Olympia",
            "State": "WA",
            "Course Style": ["Forest", "Parkland"],
            "Access Type": "Public",
            "Walk Friendly": True,
            "Closed Off-Season": False,
            "Green Fee Peak": 125,
            "Green Fee Shoulder": 99,
            "Green Fee Off-Season": 75,
        },
    ]

    created_courses = {}
    for c in new_courses:
        rec = create_record(COURSES_TBL, c)
        created_courses[c["Name"]] = rec["id"]
        print(f"  Created: {c['Name']} -> {rec['id']}")
        time.sleep(0.22)

    salish_id   = created_courses["Salish Cliffs Golf Club"]
    trophy_id   = created_courses["Trophy Lake Golf & Casting"]
    ind_sum_id  = created_courses["Indian Summer Golf & Country Club"]

    # ── 2. Patch existing GolfCourse records ─────────────────────────────────
    print("\nUpdating existing GolfCourse records...")

    patches = [
        (WASHINGTON_NAT_ID, "Washington National Golf Club", {
            "Architect": "John Fought",
            "Year Opened": 2000,
            "City": "Auburn",
            "State": "WA",
            "Course Style": ["Links", "Parkland"],
            "Access Type": "Public",
            "Walk Friendly": True,
            "Closed Off-Season": False,
            "Green Fee Peak": 125,
            "Green Fee Shoulder": 99,
            "Green Fee Off-Season": 75,
        }),
        (NEWCASTLE_ID, "The Golf Club at Newcastle", {
            "Architect": "Robert Cupp; Fred Couples",
            "Year Opened": 1999,
            "City": "Newcastle",
            "State": "WA",
            "Course Style": ["Mountain", "Parkland"],
            "Access Type": "Public",
            "Walk Friendly": False,
            "Closed Off-Season": False,
            "Green Fee Peak": 165,
            "Green Fee Shoulder": 125,
            "Green Fee Off-Season": 85,
        }),
        (INDIAN_CANYON_ID, "Indian Canyon Golf Course", {
            "Architect": "H. Chandler Egan",
            "Year Opened": 1935,
            "City": "Spokane",
            "State": "WA",
            "Course Style": ["Forest", "Parkland"],
            "Access Type": "Public",
            "Walk Friendly": True,
            "Closed Off-Season": True,
            "Green Fee Peak": 57,
            "Green Fee Shoulder": 57,
            "Green Fee Off-Season": 45,
        }),
    ]

    for rec_id, name, fields in patches:
        patch_record(COURSES_TBL, rec_id, fields)
        print(f"  Updated: {name}")
        time.sleep(0.22)

    # ── 3. Shift Chambers Bay want_more TripCourses to higher ranks ───────────
    print("\nUpdating Chambers Bay existing TripCourses ranks...")

    patch_record(TC_TBL, TC_HOME_COURSE, {"Trip Course Rank": 9})
    print("  Home Course: rank 4 -> 9")
    time.sleep(0.22)

    patch_record(TC_TBL, TC_NORTH_SHORE, {"Trip Course Rank": 10})
    print("  North Shore: rank 5 -> 10")
    time.sleep(0.22)

    # ── 4. Create TripCourses records ─────────────────────────────────────────
    print("\nCreating TripCourses records...")

    chambers_tc = [
        {
            "Golf Trip": [CHAMBERS_TRIP_ID],
            "Golf Course": [salish_id],
            "Status": "must_play",
            "Trip Course Rank": 4,
            "GUID": "Chambers Bay - Salish Cliffs Golf Club",
        },
        {
            "Golf Trip": [CHAMBERS_TRIP_ID],
            "Golf Course": [WASHINGTON_NAT_ID],
            "Status": "should_play",
            "Trip Course Rank": 5,
            "GUID": "Chambers Bay - Washington National Golf Club",
        },
        {
            "Golf Trip": [CHAMBERS_TRIP_ID],
            "Golf Course": [trophy_id],
            "Status": "should_play",
            "Trip Course Rank": 6,
            "GUID": "Chambers Bay - Trophy Lake Golf & Casting",
        },
        {
            "Golf Trip": [CHAMBERS_TRIP_ID],
            "Golf Course": [ind_sum_id],
            "Status": "should_play",
            "Trip Course Rank": 7,
            "GUID": "Chambers Bay - Indian Summer Golf & Country Club",
        },
        {
            "Golf Trip": [CHAMBERS_TRIP_ID],
            "Golf Course": [NEWCASTLE_ID],
            "Status": "should_play",
            "Trip Course Rank": 8,
            "GUID": "Chambers Bay - The Golf Club at Newcastle",
        },
        # Coeur d'Alene
        {
            "Golf Trip": [CDA_TRIP_ID],
            "Golf Course": [INDIAN_CANYON_ID],
            "Status": "want_more",
            "Trip Course Rank": 5,
            "GUID": "Coeur d'Alene - Indian Canyon Golf Course",
        },
    ]

    tc_created = batch_create(TC_TBL, chambers_tc)
    print(f"  Created {len(tc_created)} TripCourses records")

    # ── 5. Create TripSideTrips record for Indian Canyon ─────────────────────
    print("\nCreating TripSideTrips record for Indian Canyon...")

    side_trip = {
        "Name": "Indian Canyon Golf Course",
        "Slug": "indian-canyon-golf-course",
        "Sort Order": 5,
        "Text": (
            "H. Chandler Egan designed Indian Canyon in 1930, routing 6255 yards across a canyon wall "
            "with a 240-foot vertical drop above downtown Spokane. Golf Digest has repeatedly named it "
            "among the top 25 public courses in the country, and the USGA has staged three championships "
            "here. About 30 minutes from Coeur d'Alene, it plays as a walking course in the classic sense: "
            "hilly, historic, and cheaper than anything on the resort circuit at $57 per round."
        ),
        "Golf Course": [INDIAN_CANYON_ID],
        "Golf Trip": [CDA_TRIP_ID],
    }

    st_rec = create_record(SIDE_TRIPS_TBL, side_trip)
    print(f"  Created TripSideTrip: Indian Canyon -> {st_rec['id']}")

    print("\nAll done.")

if __name__ == "__main__":
    main()
