#!/usr/bin/env python3
"""
Add 46 new golf trips (trips 56-101) with course mappings to Airtable.
Deduplicates against all existing courses by case-insensitive name match.
"""
import requests, time, re, os, sys

KEY = os.environ.get("AIRTABLE_KEY", "")
BASE = "apptoCOaJ1ve0VRpL"
TRIPS_TBL   = "tblrGoUOTP5VnoM2F"
COURSES_TBL = "tblNI7uox5fs0RhQU"
TC_TBL      = "tblTWo6qL0AOWqOCT"
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# ── helpers ─────────────────────────────────────────────────────────────────

def slugify(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9\s]", "", s)
    s = re.sub(r"\s+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")

def norm(s):
    return " ".join(s.lower().split())

def fetch_all(tbl, fields):
    recs, offset = [], None
    while True:
        p = {"pageSize": 100}
        if offset: p["offset"] = offset
        for i, f in enumerate(fields): p[f"fields[{i}]"] = f
        r = requests.get(f"https://api.airtable.com/v0/{BASE}/{tbl}", headers=H, params=p)
        d = r.json()
        if "error" in d: raise Exception(d)
        recs += d.get("records", [])
        offset = d.get("offset")
        if not offset: break
        time.sleep(0.22)
    return recs

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
        if "error" in d: raise Exception(f"batch_create error: {d}")
        created += d.get("records", [])
        time.sleep(0.25)
    return created

# ── trip data (name, slug, [(course_name, status), ...]) ────────────────────
# status: "must_play" = Courses Included, "want_more" = Want More Golf
# Course names that match existing records use the EXACT existing name.

TRIPS = [
  ("Cabo San Lucas / Los Cabos", "cabo-san-lucas-los-cabos", [
    ("Quivira Golf Club","must_play"),("Diamante Dunes Course","must_play"),
    ("Diamante El Cardonal","must_play"),("Cabo del Sol Desert Course","must_play"),
    ("Cabo San Lucas Country Club","want_more"),("Cabo Real Golf Club","want_more"),
    ("Palmilla Ocean 9","want_more"),("Club Campestre San Jose","want_more"),
    ("Solmar Golf Links","want_more"),("Twin Dolphin Golf Club","want_more"),
    ("Chileno Bay Golf Club","want_more"),("Costa Palmas Golf Club","want_more"),
  ]),
  ("Maui", "maui", [
    ("Kapalua Bay Course","must_play"),("Kapalua Plantation","must_play"),   # existing
    ("Wailea Blue Course","must_play"),("Wailea Gold Course","must_play"),
    ("Wailea Emerald Course","must_play"),
    ("Royal Kaanapali Course","want_more"),("The Dunes at Maui Lani","want_more"),
  ]),
  ("Hawaii — Big Island", "hawaii-big-island", [
    ("Mauna Kea","must_play"),                                               # existing
    ("Mauna Lani North Course","must_play"),("Mauna Lani South Course","must_play"),
    ("Mauna Lani WikiWiki 9","must_play"),("Waikoloa Beach Course","must_play"),
    ("Waikoloa Lakes Course","must_play"),("Waikoloa Kings Course","must_play"),
    ("Hapuna Golf Course","must_play"),
    ("Kona Country Club Ocean Course","want_more"),
    ("Kona Country Club Mountain Course","want_more"),
  ]),
  ("Miami / West Palm Beach", "miami-west-palm-beach", [
    ("Trump National Doral (Blue Monster)","must_play"),                     # existing
    ("Trump National Doral (Golden Palm)","must_play"),
    ("Trump National Doral (Red Tiger)","must_play"),
    ("Trump National Doral (Silver Fox)","must_play"),
    ("PGA National (Champion)","must_play"),                                 # existing
    ("PGA National (Fazio)","must_play"),("PGA National (Palmer)","must_play"),
    ("PGA National (Estates)","must_play"),("PGA National (The Match)","must_play"),
    ("Crandon Golf at Key Biscayne","must_play"),
    ("The Park West Palm","must_play"),                                      # existing
    ("JW Marriott Turnberry Soffer Course","want_more"),
    ("Biltmore Golf Course","want_more"),("Miami Beach Golf Club","want_more"),
    ("The Breakers Rees Jones Course","want_more"),
    ("North Palm Beach Country Club","want_more"),
  ]),
  ("Kauai", "kauai", [
    ("Princeville Makai","must_play"),                                       # existing (18-hole)
    ("Princeville Makai (Woods)","must_play"),
    ("Poipu Bay Golf Course","must_play"),("Kiahuna Golf Club","must_play"),
    ("Ocean Course at Hokuala","want_more"),("Puakea Golf Course","want_more"),
  ]),
  ("Chambers Bay / Tacoma", "chambers-bay-tacoma", [
    ("Chambers Bay","must_play"),                                            # existing
    ("Gold Mountain Cascade Course","must_play"),
    ("Gold Mountain Olympic Course","must_play"),
    ("The Home Course","want_more"),("North Shore Golf Club","want_more"),
  ]),
  ("New Jersey Pine Barrens", "new-jersey-pine-barrens", [
    ("Sand Barrens Golf Club","must_play"),("Twisted Dune Golf Club","must_play"),
    ("Blue Heron Pines (East)","want_more"),("Blue Heron Pines (West)","want_more"),
    ("Shore Gate Golf Club","want_more"),("McCulloughs Emerald Golf Links","want_more"),
    ("Seaview Golf Resort (Bay)","want_more"),("Seaview Golf Resort (Pines)","want_more"),
    ("Harbor Pines Golf Club","want_more"),("Pine Hill Golf Club","want_more"),
  ]),
  ("Nemacolin Woodlands", "nemacolin-woodlands", [
    ("Nemacolin (Mystic Rock)","must_play"),                                 # existing
    ("Nemacolin (Shepherds Rock)","must_play"),
    ("Mount Summit Golf Club","want_more"),("Olde Stonewall Golf Club","want_more"),
  ]),
  ("San Antonio", "san-antonio", [
    ("TPC San Antonio (Oaks)","must_play"),("TPC San Antonio (Canyons)","must_play"),
    ("La Cantera Resort Course","must_play"),
    ("The Quarry Golf Club","want_more"),("Canyon Springs Golf Club","want_more"),
    ("Hyatt Hill Country Golf Club","want_more"),
    ("Tapatio Springs Golf Club","want_more"),("SilverHorn Golf Club","want_more"),
    ("Brackenridge Park Golf Course","want_more"),("The Republic Golf Club","want_more"),
  ]),
  ("Kingsmill Resort", "kingsmill-resort", [
    ("Kingsmill Resort (River)","must_play"),                                # existing
    ("Kingsmill Resort (Plantation)","must_play"),
    ("Kingsmill Resort (Woods)","must_play"),
    ("Golden Horseshoe (Gold)","want_more"),                                 # existing
    ("Golden Horseshoe (Green)","want_more"),                                # existing
    ("Stonehouse","want_more"),                                              # existing
    ("Fords Colony (Blackheath)","want_more"),("Fords Colony (Blue Heron)","want_more"),
    ("Williamsburg National (Jamestown)","want_more"),
    ("Williamsburg National (Yorktown)","want_more"),
  ]),
  ("Puerto Rico", "puerto-rico", [
    ("El Conquistador Golf Club","must_play"),("Royal Isabela Golf Club","must_play"),
    ("Grand Reserve (Championship)","must_play"),
    ("Grand Reserve (International)","must_play"),
    ("Rio Mar (River)","must_play"),("Rio Mar (Ocean)","must_play"),
    ("TPC Dorado Beach (East)","want_more"),("TPC Dorado Beach (West)","want_more"),
    ("Bahia Beach Golf Club","want_more"),
    ("Palmas del Mar Flamboyan Course","want_more"),
    ("El Legado Golf Resort","want_more"),("Dorado del Mar Golf Club","want_more"),
    ("Costa Caribe Golf Club","want_more"),
  ]),
  ("Oahu", "oahu", [
    ("Ko Olina Golf Club","must_play"),
    ("Turtle Bay (Arnold Palmer)","must_play"),("Turtle Bay (George Fazio)","must_play"),
    ("Royal Hawaiian Golf Club","must_play"),
    ("Kapolei Golf Club","want_more"),
    ("Hawaii Prince (A Nine)","want_more"),("Hawaii Prince (B Nine)","want_more"),
    ("Hawaii Prince (C Nine)","want_more"),
    ("Hawaii Kai Championship Course","want_more"),("Koolau Golf Club","want_more"),
  ]),
  ("Orlando", "orlando", [
    ("Reunion Resort (Arnold Palmer)","must_play"),
    ("Reunion Resort (Tom Watson)","must_play"),
    ("Reunion Resort (Jack Nicklaus)","must_play"),
    ("ChampionsGate (International)","must_play"),
    ("ChampionsGate (National)","must_play"),
    ("Orange County National (Panther Lake)","must_play"),
    ("Orange County National (Crooked Cat)","must_play"),
    ("Orange County National (The Tooth)","must_play"),
    ("Grande Lakes Golf Club","want_more"),
    ("Mission Inn (El Campeon)","want_more"),("Mission Inn (Las Colinas)","want_more"),
    ("Celebration Golf Club","want_more"),
    ("Waldorf Astoria Golf Club Orlando","want_more"),
    ("Mystic Dunes Golf Club","want_more"),("Shingle Creek Golf Club","want_more"),
  ]),
  ("Horseshoe Bay", "horseshoe-bay", [
    ("Ram Rock Course","must_play"),("Slick Rock Course","must_play"),
    ("Apple Rock Course","must_play"),
    ("Legends Golf Club at Horseshoe Bay","want_more"),
    ("Hidden Falls Golf Club","want_more"),("Lago Vista Golf Club","want_more"),
  ]),
  ("Nashville", "nashville", [
    ("Hermitage Golf Course (Generals Retreat)","must_play"),
    ("Hermitage Golf Course (Presidents Reserve)","must_play"),
    ("Gaylord Springs Golf Links","must_play"),
    ("Twelve Stones Crossing Golf Club","want_more"),
    ("Franklin Bridge Golf Club","want_more"),("Old Fort Golf Club","want_more"),
  ]),
  ("Whistler", "whistler", [
    ("Nicklaus North Golf Course","must_play"),("Whistler Golf Club","must_play"),
    ("Fairmont Chateau Whistler Golf Course","must_play"),
    ("Big Sky Golf Club","want_more"),("Squamish Valley Golf Club","want_more"),
  ]),
  ("Denver", "denver", [
    ("Riverdale (Dunes)","must_play"),("CommonGround Golf Course","must_play"),
    ("Fossil Trace","must_play"),                                            # existing
    ("Arrowhead Golf Club","must_play"),
    ("Bear Dance","want_more"),                                              # existing
    ("TPC Colorado","want_more"),                                            # existing
    ("The Ridge at Castle Pines","want_more"),                               # existing
    ("Red Hawk Ridge Golf Club","want_more"),("Plum Creek Golf Club","want_more"),
  ]),
  ("Sedona", "sedona", [
    ("Sedona Golf Resort","must_play"),("Oak Creek Country Club","must_play"),
    ("Beaver Creek Golf Resort","want_more"),("Verde Santa Fe Golf Club","want_more"),
    ("Canyon Mesa Country Club","want_more"),
    ("Poco Diablo Resort Golf Course","want_more"),
  ]),
  ("Outer Banks", "outer-banks", [
    ("Currituck Club","must_play"),("Kilmarlic Golf Club","must_play"),
    ("Nags Head Golf Links","must_play"),("Duck Woods Country Club","must_play"),
    ("Sea Scape Golf Links","want_more"),("The Carolina Club","want_more"),
    ("The Pointe Golf Club","want_more"),
  ]),
  ("Amelia Island", "amelia-island", [
    ("Oak Marsh Golf Club","must_play"),
    ("Long Point Club at Amelia Island","must_play"),
    ("Golf Club of Amelia Island","must_play"),
    ("Little Sandy Short Course","must_play"),("Amelia River Golf Club","must_play"),
    ("Fernandina Beach Golf Club","want_more"),
    ("Osprey Cove Golf Club","want_more"),("Cimarrone Golf Club","want_more"),
  ]),
  ("Charleston", "charleston", [
    ("Wild Dunes (Links)","must_play"),("Wild Dunes (Harbor)","must_play"),
    ("Patriots Point Links","want_more"),("RiverTowne Country Club","want_more"),
    ("Kiawah Ocean Course","want_more"),                                     # existing
    ("Osprey Point","want_more"),                                            # existing
    ("Cougar Point","want_more"),                                            # existing
    ("Turtle Point","want_more"),                                            # existing
    ("Oak Point","want_more"),                                               # existing
    ("Dunes West Golf Club","want_more"),("The Links at Stono Ferry","want_more"),
  ]),
  ("Asheville / Blue Ridge", "asheville-blue-ridge", [
    ("Omni Grove Park Inn Golf Club","must_play"),
    ("Reems Creek Golf Club","must_play"),("Black Mountain Golf Club","must_play"),
    ("Crowne Plaza Resort Asheville Golf Club","want_more"),
    ("Springdale Golf Club","want_more"),("Broadmoor Golf Links","want_more"),
    ("High Vista Golf Club","want_more"),("Waynesville Inn Golf Resort","want_more"),
    ("Connestee Falls Golf Club","want_more"),
  ]),
  ("Sarasota", "sarasota", [
    ("Bobby Jones Golf Club","must_play"),("Sarasota National Golf Club","must_play"),
    ("Tatum Ridge Golf Links","want_more"),("Sarasota Golf Club","want_more"),
    ("Waterford Golf Club","want_more"),("Legacy Golf Club","want_more"),
  ]),
  ("Naples / Marco Island", "naples-marco-island", [
    ("Tiburon (Gold)","must_play"),("Tiburon (Black)","must_play"),
    ("Lely Resort (Mustang)","must_play"),("Lely Resort (Flamingo Island)","must_play"),
    ("TPC Treviso Bay","want_more"),("The Rookery at Marco","want_more"),
    ("Hammock Bay Golf Club","want_more"),
    ("Arrowhead Golf Club Naples","want_more"),("Panther Run Golf Club","want_more"),
  ]),
  ("Jackson Hole", "jackson-hole", [
    ("Jackson Hole Golf and Tennis Club","must_play"),
    ("Teton Pines Country Club","must_play"),
    ("Teton Reserve Golf Club","want_more"),("Teton Peaks Golf Club","want_more"),
    ("Targhee Village Golf Club","want_more"),
  ]),
  ("Gulf Shores / Orange Beach", "gulf-shores-orange-beach", [
    ("Craft Farms Cotton Creek","must_play"),("Craft Farms Cypress Bend","must_play"),
    ("Craft Farms The Woodlands","must_play"),("Kiva Dunes Golf Club","must_play"),
    ("Peninsula Golf and Racquet Club","must_play"),
    ("Rock Creek Golf Club","want_more"),("TimberCreek Golf Club","want_more"),
    ("Lost Key Golf Club","want_more"),("Perdido Bay Golf Club","want_more"),
  ]),
  ("Sun Valley", "sun-valley", [
    ("Trail Creek Golf Course","must_play"),("White Clouds Golf Course","must_play"),
    ("Elkhorn Golf Club","must_play"),
    ("Bigwood Golf Club","want_more"),("Teton Reserve Golf Club","want_more"),
  ]),
  ("Jekyll Island", "jekyll-island", [
    ("Jekyll Island (Oleander)","must_play"),
    ("Jekyll Island (Pine Lakes)","must_play"),
    ("Jekyll Island (Indian Mound)","must_play"),
    ("Jekyll Island (Great Dunes)","must_play"),
    ("Sea Island (Seaside)","want_more"),                                    # existing
    ("Sea Island (Plantation)","want_more"),                                 # existing
    ("Sea Island (Retreat)","want_more"),                                    # existing
    ("Sanctuary Cove Golf Club","want_more"),
  ]),
  ("Maine", "maine", [
    ("Samoset Resort Golf Club","must_play"),("Belgrade Lakes Golf Club","must_play"),
    ("Sugarloaf Golf Club","must_play"),
    ("Sunday River Golf Club","want_more"),
    ("Kebo Valley Club","want_more"),
    ("Cape Arundel","want_more"),                                            # existing
    ("The Ledges Golf Club","want_more"),("Boothbay Harbor Country Club","want_more"),
  ]),
  ("Prince Edward Island", "prince-edward-island", [
    ("The Links at Crowbush Cove","must_play"),                              # existing
    ("Brudenell River Golf Club","must_play"),("Dundarave Golf Club","must_play"),
    ("Green Gables Golf Club","must_play"),
    ("Glasgow Hills Resort and Golf Club","must_play"),
    ("Mill River Golf Club","want_more"),("Eagles Glenn Golf Club","want_more"),
    ("Stanhope Country Club","want_more"),
  ]),
  ("Daytona Beach", "daytona-beach", [
    ("LPGA International (Jones)","must_play"),("LPGA International (Hills)","must_play"),
    ("Daytona Beach Golf Club (North)","must_play"),
    ("Daytona Beach Golf Club (South)","must_play"),
    ("Cypress Head Golf Club","want_more"),("River Bend Golf Club","want_more"),
    ("Halifax Plantation Golf Club","want_more"),("Victoria Hills Golf Club","want_more"),
    ("Riviera Country Club Daytona","want_more"),
  ]),
  ("Destin / Sandestin", "destin-sandestin", [
    ("Raven Golf Club at Sandestin","must_play"),
    ("Baytowne Golf Club at Sandestin","must_play"),
    ("The Links at Sandestin","must_play"),
    ("Kelly Plantation Golf Club","want_more"),
    ("Regatta Bay Golf and Country Club","want_more"),
    ("Indian Bayou Golf and Country Club","want_more"),
    ("Golf Club at Bluewater Bay (Bay)","want_more"),
    ("Golf Club at Bluewater Bay (Marsh)","want_more"),
  ]),
  ("Cape Cod", "cape-cod", [
    ("Captains Golf Club (Starboard)","must_play"),
    ("Captains Golf Club (Port)","must_play"),
    ("Cranberry Valley Golf Club","must_play"),("Chatham Seaside Links","must_play"),
    ("Cape Cod National","want_more"),                                       # existing
    ("Dennis Highlands Golf Club","want_more"),("Dennis Pines Golf Club","want_more"),
    ("Hyannis Golf Club","want_more"),
  ]),
  ("Houston Area", "houston-area", [
    ("Memorial Park","must_play"),                                           # existing
    ("Redstone Golf Club (Tournament)","must_play"),("Tour 18 Houston","must_play"),
    ("Golf Club of Houston (Tournament)","want_more"),
    ("BlackHorse Golf Club (North)","want_more"),
    ("BlackHorse Golf Club (South)","want_more"),
    ("Cypresswood Tradition Course","want_more"),("Augusta Pines Golf Club","want_more"),
    ("High Meadow Ranch Golf Club","want_more"),
  ]),
  ("Whitefish / Glacier", "whitefish-glacier", [
    ("Whitefish Lake Golf Club (North)","must_play"),
    ("Whitefish Lake Golf Club (South)","must_play"),
    ("Meadow Lake Golf Resort","must_play"),
    ("Buffalo Hill Golf Club","want_more"),("Northern Pines Golf Club","want_more"),
    ("Glacier View Golf Club","want_more"),("Glacier Park Golf Club","want_more"),
  ]),
  ("Hot Springs", "hot-springs", [
    ("Diamondhead Golf Club","must_play"),("Mountain Ranch Golf Club","must_play"),
    ("Red Apple Inn Golf Club","must_play"),
    ("Glenwood Country Club","want_more"),
    ("Hot Springs Village (Balboa)","want_more"),
    ("Hot Springs Village (Coronado)","want_more"),
    ("Hot Springs Village (Magellan)","want_more"),
    ("Hot Springs Village (DeSoto)","want_more"),
  ]),
  ("Vermont", "vermont", [
    ("Woodstock Country Club","must_play"),
    ("Green Mountain National Golf Club","must_play"),
    ("Sugarbush Golf Club","must_play"),
    ("Killington Golf Resort","want_more"),("Okemo Valley Golf Club","want_more"),
    ("Stratton Mountain Golf Club","want_more"),
    ("Jay Peak Championship Golf Club","want_more"),
    ("Mount Snow Golf Club","want_more"),
  ]),
  ("Finger Lakes", "finger-lakes", [
    ("Ravenwood Golf Club","must_play"),
    ("Victor Hills Golf Club (North)","must_play"),
    ("Victor Hills Golf Club (South)","must_play"),
    ("The Links at Greystone","want_more"),
    ("Turning Stone (Atunyote)","want_more"),                                # existing
    ("Turning Stone (Kaluhyat)","want_more"),                                # existing
    ("Turning Stone (Shenendoah)","want_more"),                              # existing
    ("Turning Stone (Sandstone Hollow)","want_more"),
  ]),
  ("Tennessee — Bear Trace Trail", "tennessee-bear-trace-trail", [
    ("Bear Trace at Harrison Bay","must_play"),
    ("Bear Trace at Tims Ford","must_play"),
    ("Bear Trace at Cumberland Mountain","must_play"),
    ("Bear Trace at Chickasaw","want_more"),
    ("Ross Creek Landing Golf Club","want_more"),
    ("Fall Creek Falls State Park Golf Club","want_more"),
  ]),
  ("Virginia Beach", "virginia-beach", [
    ("Heron Ridge Golf Club","must_play"),("Hells Point Golf Club","must_play"),
    ("Honey Bee Golf Club","must_play"),
    ("Virginia Beach National Golf Club","must_play"),
    ("Red Wing Lake Golf Club","want_more"),("Sleepy Hole Golf Club","want_more"),
    ("Bay Creek (Palmer)","want_more"),("Bay Creek (Nicklaus)","want_more"),
  ]),
  ("White Mountains / Bretton Woods", "white-mountains-bretton-woods", [
    ("Omni Mount Washington Golf Course","must_play"),
    ("Owls Nest Golf Club","must_play"),("Owls Nest Vineyard Course","must_play"),
    ("Maplewood Golf Club","must_play"),
    ("Waumbek Golf Club","want_more"),
  ]),
  ("Eastern Shore Maryland", "eastern-shore-maryland", [
    ("Eagles Landing Golf Club","must_play"),
    ("Bay Club (East)","must_play"),("Bay Club (West)","must_play"),
    ("Ocean City Golf Club (Newport Bay)","must_play"),
    ("Ocean City Golf Club (Seaside)","must_play"),
    ("Rum Pointe Seaside Golf Links","want_more"),
    ("The Links at Lighthouse Sound","want_more"),
    ("GlenRiddle Man O War Course","want_more"),
    ("Ocean Pines Golf Club","want_more"),("River Run Golf Club","want_more"),
    ("Bayside Resort Golf Club","want_more"),
  ]),
  ("Chicago Area", "chicago-area", [
    ("Cog Hill #1","must_play"),("Cog Hill #2","must_play"),
    ("Cog Hill #3","must_play"),("Cog Hill #4","must_play"),                 # existing
    ("Cantigny (Woodside)","must_play"),("Cantigny (Lakeside)","must_play"),
    ("Cantigny (Hillside)","must_play"),
    ("Harborside International (Port)","must_play"),
    ("Harborside International (Starboard)","must_play"),
    ("Mistwood Golf Club","want_more"),("Bolingbrook Golf Club","want_more"),
    ("Prairie Landing Golf Club","want_more"),
  ]),
  ("Pocono Mountains", "pocono-mountains", [
    ("Shawnee Inn (Blue)","must_play"),("Shawnee Inn (Red)","must_play"),
    ("Shawnee Inn (White)","must_play"),("Pocono Manor Golf Club","must_play"),
    ("Great Bear Golf Club","want_more"),("Jack Frost National Golf Club","want_more"),
    ("Hideaway Hills Golf Club","want_more"),("Buck Hill Falls Golf Club","want_more"),
  ]),
  ("Oklahoma — Shangri-La", "oklahoma-shangri-la", [
    ("Shangri-La (Champions)","must_play"),("Shangri-La (Heritage)","must_play"),
    ("Shangri-La (Legends)","must_play"),
    ("The Battlefield Par-3 Course","must_play"),
    ("The Coves at Bird Island Golf Club","want_more"),
    ("Patricia Island Country Club","want_more"),("Peoria Ridge Golf Club","want_more"),
  ]),
  ("Upper Peninsula / Sweetgrass", "upper-peninsula-sweetgrass", [
    ("Sweetgrass Golf Club","must_play"),("Sage Run Golf Club","must_play"),
    ("TimberStone Golf Club","want_more"),
    ("Marquette (Greywalls)","want_more"),                                   # existing
  ]),
]

# ── main ─────────────────────────────────────────────────────────────────────

def main():
    print("=== Phase 1: Fetching existing data ===")
    existing_courses = fetch_all(COURSES_TBL, ["Name","Slug"])
    course_by_name = {norm(r["fields"].get("Name","")): r["id"] for r in existing_courses}
    print(f"  {len(existing_courses)} existing courses loaded")

    existing_trips = fetch_all(TRIPS_TBL, ["Name","Slug"])
    trip_by_name = {norm(r["fields"].get("Name","")): r["id"] for r in existing_trips}
    print(f"  {len(existing_trips)} existing trips loaded")

    # ── Phase 2: Collect all unique new courses ──────────────────────────────
    print("\n=== Phase 2: Creating new courses ===")
    all_course_names = {}
    for _, _, courses in TRIPS:
        for cname, _ in courses:
            k = norm(cname)
            if k not in all_course_names:
                all_course_names[k] = cname

    new_course_fields = []
    for k, cname in all_course_names.items():
        if k in course_by_name:
            print(f"  SKIP (exists): {cname}")
        else:
            new_course_fields.append({"Name": cname, "Slug": slugify(cname)})

    print(f"  Creating {len(new_course_fields)} new courses...")
    created_courses = batch_create(COURSES_TBL, new_course_fields)
    for r in created_courses:
        course_by_name[norm(r["fields"]["Name"])] = r["id"]
        print(f"  CREATED course: {r['fields']['Name']}")

    # ── Phase 3: Create new trips ────────────────────────────────────────────
    print("\n=== Phase 3: Creating new trips ===")
    new_trip_rows = []
    for tname, tslug, _ in TRIPS:
        if norm(tname) in trip_by_name:
            print(f"  SKIP (exists): {tname}")
        else:
            new_trip_rows.append({"Name": tname, "Slug": tslug})

    print(f"  Creating {len(new_trip_rows)} new trips...")
    created_trips = batch_create(TRIPS_TBL, new_trip_rows)
    for r in created_trips:
        trip_by_name[norm(r["fields"]["Name"])] = r["id"]
        print(f"  CREATED trip: {r['fields']['Name']}")

    # ── Phase 4: Create TripCourse links ─────────────────────────────────────
    print("\n=== Phase 4: Creating TripCourse links ===")
    tc_rows = []
    for tname, _, courses in TRIPS:
        tid = trip_by_name.get(norm(tname))
        if not tid:
            print(f"  WARN: no trip ID for {tname}")
            continue
        for rank, (cname, status) in enumerate(courses, start=1):
            cid = course_by_name.get(norm(cname))
            if not cid:
                print(f"  WARN: no course ID for {cname} (trip: {tname})")
                continue
            tc_rows.append({
                "GolfTrip": [tid],
                "GolfCourse": [cid],
                "Status": status,
                "Rank": rank,
            })

    print(f"  Creating {len(tc_rows)} TripCourse links...")
    created_tc = batch_create(TC_TBL, tc_rows)
    print(f"  Created {len(created_tc)} TripCourse records")

    print("\n=== Done ===")
    print(f"  Courses: {len(created_courses)} new")
    print(f"  Trips:   {len(created_trips)} new")
    print(f"  Links:   {len(created_tc)} new")

if __name__ == "__main__":
    main()
