#!/usr/bin/env python3
"""
Update Current Ranking for the 46 new trips (56-101) in Airtable.
"""
import requests, time, os

KEY = os.environ["AIRTABLE_KEY"]
BASE = "apptoCOaJ1ve0VRpL"
TRIPS_TBL = "tblrGoUOTP5VnoM2F"
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# Ordered list of (slug, rank) for the 46 new trips
RANKINGS = [
    ("cabo-san-lucas-los-cabos", 56),
    ("maui", 57),
    ("hawaii-big-island", 58),
    ("miami-west-palm-beach", 59),
    ("kauai", 60),
    ("chambers-bay-tacoma", 61),
    ("new-jersey-pine-barrens", 62),
    ("nemacolin-woodlands", 63),
    ("san-antonio", 64),
    ("kingsmill-resort", 65),
    ("puerto-rico", 66),
    ("oahu", 67),
    ("orlando", 68),
    ("horseshoe-bay", 69),
    ("nashville", 70),
    ("whistler", 71),
    ("denver", 72),
    ("sedona", 73),
    ("outer-banks", 74),
    ("amelia-island", 75),
    ("charleston", 76),
    ("asheville-blue-ridge", 77),
    ("sarasota", 78),
    ("naples-marco-island", 79),
    ("jackson-hole", 80),
    ("gulf-shores-orange-beach", 81),
    ("sun-valley", 82),
    ("jekyll-island", 83),
    ("maine", 84),
    ("prince-edward-island", 85),
    ("daytona-beach", 86),
    ("destin-sandestin", 87),
    ("cape-cod", 88),
    ("houston-area", 89),
    ("whitefish-glacier", 90),
    ("hot-springs", 91),
    ("vermont", 92),
    ("finger-lakes", 93),
    ("tennessee-bear-trace-trail", 94),
    ("virginia-beach", 95),
    ("white-mountains-bretton-woods", 96),
    ("eastern-shore-maryland", 97),
    ("chicago-area", 98),
    ("pocono-mountains", 99),
    ("oklahoma-shangri-la", 100),
    ("upper-peninsula-sweetgrass", 101),
]

def fetch_all_trips():
    recs, offset = [], None
    while True:
        p = {"pageSize": 100, "fields[0]": "Slug", "fields[1]": "Current Ranking"}
        if offset:
            p["offset"] = offset
        r = requests.get(f"https://api.airtable.com/v0/{BASE}/{TRIPS_TBL}", headers=H, params=p)
        d = r.json()
        if "error" in d:
            raise Exception(d)
        recs += d.get("records", [])
        offset = d.get("offset")
        if not offset:
            break
        time.sleep(0.22)
    return recs

def batch_update(updates):
    """updates: list of {"id": record_id, "fields": {...}}"""
    for i in range(0, len(updates), 10):
        batch = updates[i:i+10]
        r = requests.patch(
            f"https://api.airtable.com/v0/{BASE}/{TRIPS_TBL}",
            headers=H,
            json={"records": batch}
        )
        d = r.json()
        if "error" in d:
            raise Exception(f"batch_update error: {d}")
        for rec in d.get("records", []):
            print(f"  Updated: {rec['fields'].get('Slug')} → rank {rec['fields'].get('Current Ranking')}")
        time.sleep(0.25)

def main():
    print("Fetching all trips...")
    all_trips = fetch_all_trips()
    by_slug = {r["fields"].get("Slug", ""): r["id"] for r in all_trips}
    print(f"  {len(all_trips)} trips loaded")

    updates = []
    missing = []
    for slug, rank in RANKINGS:
        rid = by_slug.get(slug)
        if not rid:
            missing.append(slug)
            continue
        updates.append({"id": rid, "fields": {"Current Ranking": rank}})

    if missing:
        print(f"\nWARN: no Airtable record found for slugs: {missing}")

    print(f"\nUpdating {len(updates)} trip rankings...")
    batch_update(updates)
    print(f"\nDone. {len(updates)} rankings updated.")

if __name__ == "__main__":
    main()
