import requests
import os
import time
import re

AIRTABLE_KEY = os.environ["AIRTABLE_KEY"]
BASE_ID = "apptoCOaJ1ve0VRpL"
TABLE_ID = "tblNI7uox5fs0RhQU"

airtable_headers = {
    "Authorization": f"Bearer {AIRTABLE_KEY}",
    "Content-Type": "application/json"
}

nominatim_headers = {
    "User-Agent": "GolfTripIndex/1.0 (caseywinn@gmail.com)"
}

# Override queries for courses that need a parent resort or alternate name
QUERY_OVERRIDES = {
    "Bethpage Blue": "Bethpage State Park, Farmingdale, New York",
    "Bethpage Green": "Bethpage State Park, Farmingdale, New York",
    "Bethpage Red": "Bethpage State Park, Farmingdale, New York",
    "Bethpage Yellow": "Bethpage State Park, Farmingdale, New York",
    "Mammoth Dunes": "Sand Valley Golf Resort, Nekoosa, Wisconsin",
    "The Lido": "Sand Valley Golf Resort, Nekoosa, Wisconsin",
    "Sedge Valley": "Sand Valley Golf Resort, Nekoosa, Wisconsin",
    "The Sandbox": "Sand Valley Golf Resort, Nekoosa, Wisconsin",
    "QuickSands": "Gamble Sands, Brewster, Washington",
    "Cabot Citrus Farms (Karoo)": "Cabot Citrus Farms, Citrus County, Florida",
    "Cabot Citrus Farms (Roost)": "Cabot Citrus Farms, Citrus County, Florida",
    "Cabot Citrus Farms (The Wedge)": "Cabot Citrus Farms, Citrus County, Florida",
    "Cabot Citrus Farms (The Squeeze)": "Cabot Citrus Farms, Citrus County, Florida",
    "McLemore Club (Highlands)": "McLemore Club, Rising Fawn, Georgia",
    "McLemore Club (The Keep)": "McLemore Club, Rising Fawn, Georgia",
    "Payne's Valley": "Big Cedar Lodge, Ridgedale, Missouri",
    "Black Diamond Ranch (Quarry)": "Black Diamond Ranch, Lecanto, Florida",
    "Black Jack's Crossing": "Lajitas Golf Resort, Lajitas, Texas",
    "Bayonet and Black Horse": "Bayonet Golf Course, Seaside, California",
    "Warren Course at Notre Dame": "University of Notre Dame, Notre Dame, Indiana",
    "Pfau Course at Indiana University": "Indiana University, Bloomington, Indiana",
    "Rawls Course at Texas Tech": "Texas Tech University, Lubbock, Texas",
    "Birdwood at Boar's Head": "Boar's Head Resort, Charlottesville, Virginia",
    "Primland Highland": "Primland Resort, Meadows of Dan, Virginia",
    "Wynn Golf Club": "Wynn Las Vegas, Las Vegas, Nevada",
    "Kapalua Plantation": "Kapalua, Maui, Hawaii",
    "May River at Palmetto Bluff": "Palmetto Bluff, Bluffton, South Carolina",
    "Atlantic Dunes": "Atlantic Dunes, Pawleys Island, South Carolina",
    "Fairmont Jasper Park Lodge Golf Course": "Jasper Park Lodge, Jasper, Alberta",
    "Ak-Chin Southern Dunes": "Maricopa, Arizona",
    "Bayside GC": "Bayside Golf Club, Nebraska",
    "The Mines": "Forest Dunes Golf Club, Roscommon, Michigan",
    "Wilderness Club": "Eureka, Montana",
    "River Valley Ranch Golf Club": "Carbondale, Colorado",
    "Serket": "Scottsdale, Arizona",
    "Beowulf": "Williston, North Dakota",
    "Paako Ridge": "Sandia Park, New Mexico",
    "Barona Creek": "Lakeside, California",
    "Tullymore Golf Resort": "Stanwood, Michigan",
    "Rodeo Dunes": "Alamosa, Colorado",
    "Tatanka Golf Club": "Belle Fourche, South Dakota",
    "The Preserve": "Gulfport, Mississippi",
    "Mystic Creek": "Flora, Mississippi",
    "Sandpines Golf Links": "Florence, Oregon",
    "Astoria Golf and Country Club": "Warrenton, Oregon",
    "The Ledges of St George": "St George, Utah",
    "Tribute Links": "The Colony, Texas",
    "Frederick Peak Golf Club": "Bishop, California",
    "Bone Valley": "Mulberry, Florida",
    "Bandon Crossings": "Bandon, Oregon",
    "Newport National Orchard": "Middletown, Rhode Island",
    "Landmand": "Homer, Nebraska",
    "Lawsonia Woodlands": "Green Lake, Wisconsin",
    "Lawsonia Links": "Green Lake, Wisconsin",
    "Fighting Joe": "RTJ Golf Trail, Muscle Shoals, Alabama",
    "Schoolmaster": "RTJ Golf Trail, Auburn, Alabama",
    "Charleston Municipal GC": "Charleston, South Carolina",
}


def geocode(query):
    resp = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": query, "format": "json", "limit": 1, "addressdetails": 1},
        headers=nominatim_headers,
        timeout=10
    )
    results = resp.json()
    if not results:
        return None, None, None
    r = results[0]
    addr = r.get("address", {})
    city = (
        addr.get("city") or
        addr.get("town") or
        addr.get("village") or
        addr.get("municipality") or
        addr.get("county")
    )
    return float(r["lat"]), float(r["lon"]), city


def fetch_ungeocode_courses():
    courses = []
    offset = None
    while True:
        params = {"pageSize": 100, "fields[]": ["Name", "State", "Latitude"]}
        if offset:
            params["offset"] = offset
        resp = requests.get(
            f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}",
            headers=airtable_headers,
            params=params
        )
        data = resp.json()
        for r in data["records"]:
            if not r["fields"].get("Latitude"):
                courses.append(r)
        offset = data.get("offset")
        if not offset:
            break
    return courses


def update_course(record_id, lat, lon, city):
    fields = {"Latitude": lat, "Longitude": lon}
    if city:
        fields["City"] = city
    requests.patch(
        f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}/{record_id}",
        headers=airtable_headers,
        json={"fields": fields}
    )


def main():
    print("Fetching un-geocoded courses...")
    courses = fetch_ungeocode_courses()
    print(f"Found {len(courses)} courses still missing location\n")

    success = 0
    still_failed = []

    for i, course in enumerate(courses):
        name = course["fields"].get("Name", "").strip()
        state = course["fields"].get("State", "").strip()
        record_id = course["id"]

        override = QUERY_OVERRIDES.get(name)
        query = override if override else f"{name}, {state}"

        print(f"[{i+1}/{len(courses)}] {name}", end=" ... ", flush=True)

        try:
            lat, lon, city = geocode(query)
            time.sleep(1.1)
        except Exception as e:
            print(f"ERROR: {e}")
            still_failed.append(name)
            time.sleep(1.1)
            continue

        if lat is None:
            print("NOT FOUND")
            still_failed.append(name)
        else:
            update_course(record_id, lat, lon, city)
            print(f"({lat:.4f}, {lon:.4f}) {city}")
            success += 1

    print(f"\nDone: {success} updated, {len(still_failed)} still not found")
    if still_failed:
        print("\nStill not found:")
        for f in still_failed:
            print(f"  {f}")


if __name__ == "__main__":
    main()
