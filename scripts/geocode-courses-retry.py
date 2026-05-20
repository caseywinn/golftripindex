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


def strip_parens(name):
    return re.sub(r'\s*\(.*?\)', '', name).strip()


def build_queries(name, state):
    queries = []
    # Original
    queries.append(f"{name}, {state}, USA")
    # Strip parenthetical
    stripped = strip_parens(name)
    if stripped != name:
        queries.append(f"{stripped}, {state}, USA")
        queries.append(f"{stripped} Golf Course, {state}, USA")
    # Add "Golf Course" suffix
    queries.append(f"{name} Golf Course, {state}, USA")
    # Canada doesn't need USA
    if state == "Canada":
        queries = [q.replace(", USA", "") for q in queries]
    return queries


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

        print(f"[{i+1}/{len(courses)}] {name}, {state}", end=" ... ", flush=True)

        queries = build_queries(name, state)
        lat, lon, city = None, None, None

        for q in queries:
            try:
                lat, lon, city = geocode(q)
                time.sleep(1.1)
            except Exception as e:
                time.sleep(1.1)
                continue
            if lat is not None:
                break

        if lat is None:
            print("NOT FOUND")
            still_failed.append(f"{name}, {state}")
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
