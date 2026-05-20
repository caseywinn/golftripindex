import requests
import os
import json

AIRTABLE_KEY = os.environ["AIRTABLE_KEY"]
BASE_ID = "apptoCOaJ1ve0VRpL"
TABLE_ID = "tblNI7uox5fs0RhQU"

headers = {"Authorization": f"Bearer {AIRTABLE_KEY}"}

courses = []
offset = None
while True:
    params = {
        "pageSize": 100,
        "fields[]": ["Name", "State", "City", "Course Type", "Consolidated Ranking"],
        "sort[0][field]": "Consolidated Ranking",
        "sort[0][direction]": "asc"
    }
    if offset:
        params["offset"] = offset
    resp = requests.get(
        f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}",
        headers=headers, params=params
    )
    data = resp.json()
    for r in data["records"]:
        courses.append({
            "id": r["id"],
            "name": r["fields"].get("Name", ""),
            "state": r["fields"].get("State", ""),
            "city": r["fields"].get("City", ""),
            "course_type": r["fields"].get("Course Type", ""),
            "ranking": r["fields"].get("Consolidated Ranking")
        })
    offset = data.get("offset")
    if not offset:
        break

print(f"Fetched {len(courses)} courses")
with open("/tmp/all_courses.json", "w") as f:
    json.dump(courses, f, indent=2)
print("Saved to /tmp/all_courses.json")
