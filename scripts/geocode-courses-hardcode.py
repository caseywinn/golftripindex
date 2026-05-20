import requests
import os

AIRTABLE_KEY = os.environ["AIRTABLE_KEY"]
BASE_ID = "apptoCOaJ1ve0VRpL"
TABLE_ID = "tblNI7uox5fs0RhQU"

airtable_headers = {
    "Authorization": f"Bearer {AIRTABLE_KEY}",
    "Content-Type": "application/json"
}

# name -> (lat, lon, city)
HARDCODED = {
    # Sand Valley Resort, Nekoosa WI
    "The Lido":       (44.3145, -89.8971, "Nekoosa"),
    "Sedge Valley":   (44.3145, -89.8971, "Nekoosa"),
    "Mammoth Dunes":  (44.3145, -89.8971, "Nekoosa"),
    "The Sandbox":    (44.3145, -89.8971, "Nekoosa"),
    # Cabot Citrus Farms, Brooksville FL
    "Cabot Citrus Farms (Karoo)":      (28.4722, -82.4329, "Brooksville"),
    "Cabot Citrus Farms (Roost)":      (28.4722, -82.4329, "Brooksville"),
    "Cabot Citrus Farms (The Wedge)":  (28.4722, -82.4329, "Brooksville"),
    "Cabot Citrus Farms (The Squeeze)":(28.4722, -82.4329, "Brooksville"),
    # McLemore Club, Rising Fawn GA
    "McLemore Club (Highlands)": (34.6148, -85.6269, "Rising Fawn"),
    "McLemore Club (The Keep)":  (34.6148, -85.6269, "Rising Fawn"),
    # Black Diamond Ranch, Lecanto FL
    "Black Diamond Ranch (Quarry)": (28.8447, -82.4957, "Lecanto"),
    # Lajitas Golf Resort, Lajitas TX
    "Black Jack's Crossing": (29.2681, -103.7655, "Lajitas"),
    # Forest Dunes / The Mines, Roscommon MI
    "The Mines": (44.4997, -84.5858, "Roscommon"),
    # Primland Resort, Meadows of Dan VA
    "Primland Highland": (36.6412, -80.4459, "Meadows of Dan"),
    # Gamble Sands / QuickSands, Brewster WA
    "QuickSands": (48.0954, -119.7795, "Brewster"),
    # RTJ Golf Trail — Fighting Joe, Muscle Shoals AL
    "Fighting Joe": (34.7448, -87.6678, "Muscle Shoals"),
    # RTJ Golf Trail — Schoolmaster, Auburn AL
    "Schoolmaster": (32.6099, -85.4808, "Auburn"),
    # Atlantic Dunes, Pawleys Island SC
    "Atlantic Dunes": (33.4607, -79.1198, "Pawleys Island"),
    # The Boulders Club South, Carefree AZ
    "The Boulders Club South": (33.8267, -111.9164, "Carefree"),
}


def fetch_ungeocode_courses():
    courses = []
    offset = None
    while True:
        params = {"pageSize": 100, "fields[]": ["Name", "Latitude"]}
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
    fields = {"Latitude": lat, "Longitude": lon, "City": city}
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
    skipped = []

    for course in courses:
        name = course["fields"].get("Name", "").strip()
        record_id = course["id"]

        if name in HARDCODED:
            lat, lon, city = HARDCODED[name]
            update_course(record_id, lat, lon, city)
            print(f"OK  {name} -> {city} ({lat}, {lon})")
            success += 1
        else:
            skipped.append(name)

    print(f"\nDone: {success} updated")
    if skipped:
        print(f"\n{len(skipped)} courses have no hardcoded entry (may need manual review):")
        for s in skipped:
            print(f"  {s}")


if __name__ == "__main__":
    main()
