import requests
import os
import time

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


def fetch_all_courses():
    courses = []
    offset = None
    while True:
        params = {"pageSize": 100, "fields[]": ["Name", "State"]}
        if offset:
            params["offset"] = offset
        resp = requests.get(
            f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}",
            headers=airtable_headers,
            params=params
        )
        data = resp.json()
        courses.extend(data["records"])
        offset = data.get("offset")
        if not offset:
            break
    return courses


def geocode(name, state):
    query = f"{name}, {state}, USA"
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


def update_course(record_id, lat, lon, city):
    fields = {}
    if lat is not None:
        fields["Latitude"] = lat
    if lon is not None:
        fields["Longitude"] = lon
    if city:
        fields["City"] = city
    if not fields:
        return
    requests.patch(
        f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}/{record_id}",
        headers=airtable_headers,
        json={"fields": fields}
    )


def main():
    print("Fetching courses from Airtable...")
    courses = fetch_all_courses()
    print(f"Found {len(courses)} courses\n")

    success = 0
    failed = []

    for i, course in enumerate(courses):
        name = course["fields"].get("Name", "").strip()
        state = course["fields"].get("State", "").strip()
        record_id = course["id"]

        if not name:
            print(f"[{i+1}/{len(courses)}] SKIP — no name")
            continue

        print(f"[{i+1}/{len(courses)}] {name}, {state}", end=" ... ", flush=True)

        try:
            lat, lon, city = geocode(name, state)
        except Exception as e:
            print(f"ERROR: {e}")
            failed.append(f"{name}, {state}")
            time.sleep(1.1)
            continue

        if lat is None:
            print("NOT FOUND")
            failed.append(f"{name}, {state}")
        else:
            update_course(record_id, lat, lon, city)
            print(f"({lat:.4f}, {lon:.4f}) {city}")
            success += 1

        time.sleep(1.1)

    print(f"\nDone: {success} updated, {len(failed)} not found")
    if failed:
        print("\nNot found:")
        for f in failed:
            print(f"  {f}")


if __name__ == "__main__":
    main()
