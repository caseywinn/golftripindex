#!/usr/bin/env python3
"""
Apply all TripCostRow corrections identified in the pricing audit.
Fixes: lodging night counts, tee fee round counts, per-unit formatting,
missing Dismal River (Western Nebraska), and Whistling Straits value typos.

Usage:
  npx dotenv-cli -e .env.local -- python3 scripts/fix-cost-rows.py [--dry-run]
"""

import json, re, os, sys, time
import urllib.request, urllib.parse, urllib.error

DRY_RUN = "--dry-run" in sys.argv

API_KEY = os.environ.get("AIRTABLE_API_KEY", "")
BASE_ID = os.environ.get("AIRTABLE_BASE_ID", "")
if not API_KEY or not BASE_ID:
    sys.exit("ERROR: Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID")

BASE = f"https://api.airtable.com/v0/{BASE_ID}"
TRIPS_TABLE  = "tblrGoUOTP5VnoM2F"
COST_TABLE   = "tblUFRi02u1Y52YXq"


# ── helpers ──────────────────────────────────────────────────────────────────

def headers():
    return {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

def at_request(method, path, body=None):
    url = f"{BASE}/{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers(), method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"Airtable error {e.code}: {e.read().decode()}")

def fetch_all(table, formula):
    records, offset = [], None
    while True:
        params = urllib.parse.urlencode({"filterByFormula": formula, "maxRecords": 100})
        if offset:
            params += f"&offset={offset}"
        data = at_request("GET", f"{table}?{params}")
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
        time.sleep(0.15)
    return records

def fetch_by_ids(table, ids):
    if not ids:
        return []
    results = []
    for i in range(0, len(ids), 30):
        chunk = ids[i:i+30]
        formula = "OR(" + ",".join(f'RECORD_ID()="{id}"' for id in chunk) + ")"
        results.extend(fetch_all(table, formula))
        time.sleep(0.2)
    return results

def patch_batch(table, updates):
    """PATCH up to 10 records at a time."""
    for i in range(0, len(updates), 10):
        chunk = updates[i:i+10]
        if DRY_RUN:
            print(f"  [DRY-RUN] would patch {len(chunk)} records")
            for u in chunk:
                print(f"    {u['id']}: {u['fields']}")
        else:
            at_request("PATCH", table, {"records": chunk})
            print(f"  ✓ Patched {len(chunk)} records")
        time.sleep(0.25)

def post_record(table, fields):
    if DRY_RUN:
        print(f"  [DRY-RUN] would create record: {fields}")
        return "recDRYRUN"
    result = at_request("POST", table, {"records": [{"fields": fields}]})
    return result["records"][0]["id"]

def link_cost_row(trip_id, new_row_id, existing_ids):
    """Append a new cost row ID to a trip's TripCostRows field."""
    all_ids = existing_ids + [new_row_id]
    if DRY_RUN:
        print(f"  [DRY-RUN] would link {new_row_id} to trip {trip_id}")
        return
    at_request("PATCH", TRIPS_TABLE, {
        "records": [{"id": trip_id, "fields": {"TripCostRows": all_ids}}]
    })
    print(f"  ✓ Linked new row to trip")


# ── value helpers ─────────────────────────────────────────────────────────────

def parse_range(s):
    """Extract (lo, hi) numbers from a price string."""
    if not s:
        return None, None
    cleaned = re.sub(r"[,$\s]", "", str(s))
    cleaned = re.sub(r"[–—]", "-", cleaned)
    cleaned = re.sub(r"/(person|round|day)", "", cleaned)
    nums = [int(x) for x in re.findall(r"\d{2,6}", cleaned)]
    if not nums:
        return None, None
    return nums[0], nums[-1]

def nice(n):
    if n <= 0:
        return 0
    if n < 100:
        return round(n / 5) * 5
    if n < 1000:
        return round(n / 25) * 25
    return round(n / 50) * 50

def scale_str(s, factor):
    """Scale a price string by factor, return nicely rounded string."""
    lo, hi = parse_range(s)
    if lo is None:
        return s
    nl, nh = nice(lo * factor), nice(hi * factor)
    return f"${nl:,}" if nl == nh else f"${nl:,}–${nh:,}"

def multiply_per_unit(s, count):
    return scale_str(s, count)

def strip_per_unit_label(s):
    return re.sub(r"\s*/\s*(person|round|day)", "", str(s)).strip()

def strip_per_unit_value(s):
    return re.sub(r"\s*/\s*(person|round|day)", "", str(s)).strip()


# ── correction definitions ────────────────────────────────────────────────────

# Each entry: (trip_slug, line_substring_to_match, new_line, shoulder_scale, peak_scale)
# scale=None means use a custom handler; scale is a float multiplier for simple cases.

LODGING_4_TO_3 = [  # 4 nights → 3 nights (scale 3/4)
    ("bandon-dunes",     "4 nights, group of 4",           "3 nights, group of 4"),
    ("pinehurst-area",   "4 nights, house rental",         "3 nights, house rental"),
    ("streamsong",       "Lodging (4 nights)",              "Lodging (3 nights)"),
    ("whistling-straits","Lodging (4 nights)",              "Lodging (3 nights)"),
    ("kiawah-island",    "Lodging (4 nights)",              "Lodging (3 nights)"),
    ("bend-oregon",      "Lodging (4 nights)",              "Lodging (3 nights)"),
    ("arcadia-bluffs",   "4 nights, 2 properties",         "3 nights, 2 properties"),
    ("hilton-head",      "4 nights, Sea Pines",            "3 nights, Sea Pines"),
    ("banff",            "Lodging (4 nights)",              "Lodging (3 nights)"),
    ("scottsdale",       "4 nights, house share",          "3 nights, house share"),
    ("palm-springs",     "4 nights, house rental",         "3 nights, house rental"),
    ("san-diego",        "4 nights, La Jolla",             "3 nights, La Jolla"),
]

LODGING_3_TO_2 = [  # 3 nights → 2 nights (scale 2/3)
    ("sea-island",           "Golf Package (3 nights)",           "Golf Package (2 nights)"),
    ("cabot-citrus-farms",   "3 nights, 4BR cottage",            "2 nights, 4BR cottage"),
    ("reynolds-lake-oconee", "3 nights, Ritz",                   "2 nights, Ritz"),
    ("las-vegas",            "3 nights, per person",             "2 nights, per person"),
    ("dallas",               "3 nights, Omni",                   "2 nights, Omni"),
    ("broadmoor",            "3 nights, The Broadmoor",          "2 nights, The Broadmoor"),
    ("omni-homestead",       "3 nights, Omni Homestead",         "2 nights, Omni Homestead"),
    ("innisbrook",           "Lodging (3 nights)",               "Lodging (2 nights)"),
    ("omni-barton-creek",    "Lodging (3 nights)",               "Lodging (2 nights)"),
    ("tucson",               "Lodging (3 nights)",               "Lodging (2 nights)"),
    ("lake-tahoe",           "Lodging (3 nights)",               "Lodging (2 nights)"),
    ("treetops",             "Lodging (3 nights)",               "Lodging (2 nights)"),
]

# Tee fee adjustments: (slug, match, new_line, scale_factor)
TEE_FEE_ADJUSTMENTS = [
    # Increase rounds
    ("sawgrass",       "2 rounds)",   "Tee fees (3 rounds)",                           3/2),
    ("bay-harbor",     "3 rounds)",   "Tee fees (4 rounds)",                           4/3),
    ("eastern-nebraska","3 rounds)",  "Tee fees (4 rounds)",                           4/3),
    ("north-dakota",   "4 rounds)",   "Tee fees (5 rounds)",                           5/4),
    ("bethpage",       "2 rounds",    "Tee fees (3 rounds, non-resident)",             3/2),
    ("giants-ridge",   "2 rounds)",   "Tee fees (3 rounds)",                           3/2),
    ("coeur-dalene",   "2 rounds)",   "Tee fees (3 rounds)",                           3/2),
    ("french-lick",    "2 rounds)",   "Tee fees + forecaddie (3 rounds)",              3/2),
    ("napa",           "3 rounds)",   "Tee fees (4 rounds)",                           4/3),
    ("new-mexico",     "4 rounds, with cart", "Tee fees (5 rounds, with cart)",        5/4),
    ("palm-springs",   "4 rounds)",   "Tee fees (5 rounds)",                           5/4),
    ("southern-utah",  "4 rounds)",   "Tee fees (5 rounds)",                           5/4),
    # Decrease rounds
    ("scottsdale",     "5 rounds)",   "Tee fees (4 rounds)",                           4/5),
    ("las-vegas",      "4 rounds",    "Tee fees (3 rounds: excluding Shadow Creek or Wynn)", 3/4),
    ("dallas",         "4 rounds",    "Tee fees (3 rounds: Fields Ranch East, West, Old American)", 3/4),
    ("omni-barton-creek","4 rounds)", "Tee fees (3 rounds)",                           3/4),
    ("tucson",         "4 rounds)",   "Tee fees (2 rounds)",                           2/4),
]


# ── fetch all trip + cost row data ────────────────────────────────────────────

print("Fetching trips...")
trip_records = fetch_all(TRIPS_TABLE, '{Status}="published"')
trip_by_slug = {}
for r in trip_records:
    slug = r["fields"].get("Slug", "")
    if slug:
        trip_by_slug[slug] = {
            "id": r["id"],
            "name": r["fields"].get("Name", ""),
            "cost_row_ids": list(r["fields"].get("TripCostRows", [])),
        }

all_cost_row_ids = list({id for t in trip_by_slug.values() for id in t["cost_row_ids"]})
print(f"Fetching {len(all_cost_row_ids)} cost rows...")
cost_row_records = fetch_by_ids(COST_TABLE, all_cost_row_ids)
cost_row_by_id = {r["id"]: r for r in cost_row_records}

# Build trip → cost rows map
trip_rows = {}
for slug, trip in trip_by_slug.items():
    rows = []
    for rid in trip["cost_row_ids"]:
        r = cost_row_by_id.get(rid)
        if r:
            rows.append({
                "id": r["id"],
                "line": r["fields"].get("Line", ""),
                "shoulder": r["fields"].get("Shoulder", ""),
                "peak": r["fields"].get("Peak", ""),
                "off_season": r["fields"].get("Off-Season", ""),
                "optional": bool(r["fields"].get("Optional", False)),
                "sort_order": r["fields"].get("Sort Order"),
            })
    rows.sort(key=lambda x: x["sort_order"] or 0)
    trip_rows[slug] = rows


# ── helper: find a row by substring match ─────────────────────────────────────

def find_row(slug, substring, optional=False):
    rows = trip_rows.get(slug, [])
    for r in rows:
        if r.get("optional", False) == optional and substring.lower() in r["line"].lower():
            return r
    # fallback: ignore optional flag
    for r in rows:
        if substring.lower() in r["line"].lower():
            return r
    return None


# ── apply corrections ─────────────────────────────────────────────────────────

patches = []  # [{id, fields}]

def add_patch(record_id, fields):
    patches.append({"id": record_id, "fields": fields})

def label_sub(line, old, new):
    """Replace substring in label, case-preserving."""
    return line.replace(old, new)


# 1. LODGING 4→3 NIGHTS
print("\n[1] Lodging 4→3 nights...")
for slug, match, new_label_template in LODGING_4_TO_3:
    row = find_row(slug, match)
    if not row:
        # Try broader match
        row = find_row(slug, "4 nights")
    if not row:
        print(f"  ⚠ no lodging row found for {slug} ({match})")
        continue
    new_shoulder = scale_str(row["shoulder"], 3/4)
    new_peak     = scale_str(row["peak"],     3/4)
    new_off      = scale_str(row["off_season"], 3/4) if row["off_season"] else ""
    # Build new line label
    new_line = row["line"].replace("4 nights", "3 nights")
    fields = {"Line": new_line, "Shoulder": new_shoulder, "Peak": new_peak}
    if new_off:
        fields["Off-Season"] = new_off
    print(f"  {slug}: '{row['line']}' → '{new_line}'  {row['shoulder']} → {new_shoulder}  {row['peak']} → {new_peak}")
    add_patch(row["id"], fields)

# 2. LODGING 3→2 NIGHTS
print("\n[2] Lodging 3→2 nights...")
for slug, match, new_label_template in LODGING_3_TO_2:
    row = find_row(slug, match)
    if not row:
        row = find_row(slug, "3 nights")
    if not row:
        row = find_row(slug, "lodg")
    if not row:
        print(f"  ⚠ no lodging row found for {slug} ({match})")
        continue
    new_shoulder = scale_str(row["shoulder"], 2/3)
    new_peak     = scale_str(row["peak"],     2/3)
    new_off      = scale_str(row["off_season"], 2/3) if row["off_season"] else ""
    new_line = row["line"].replace("3 nights", "2 nights")
    fields = {"Line": new_line, "Shoulder": new_shoulder, "Peak": new_peak}
    if new_off:
        fields["Off-Season"] = new_off
    print(f"  {slug}: '{row['line']}' → '{new_line}'  {row['shoulder']} → {new_shoulder}  {row['peak']} → {new_peak}")
    add_patch(row["id"], fields)

# 3. TEE FEE ROUND ADJUSTMENTS
print("\n[3] Tee fee round adjustments...")
for slug, match, new_line, factor in TEE_FEE_ADJUSTMENTS:
    row = find_row(slug, match)
    if not row:
        # Try generic tee/green fee match
        row = find_row(slug, "tee fee")
        if not row:
            row = find_row(slug, "green fee")
    if not row:
        print(f"  ⚠ no tee fee row found for {slug} ({match})")
        continue
    new_shoulder = scale_str(row["shoulder"], factor)
    new_peak     = scale_str(row["peak"],     factor)
    new_off      = scale_str(row["off_season"], factor) if row["off_season"] else ""
    fields = {"Line": new_line, "Shoulder": new_shoulder, "Peak": new_peak}
    if new_off:
        fields["Off-Season"] = new_off
    print(f"  {slug}: '{row['line']}' → '{new_line}'  {row['shoulder']} → {new_shoulder}  {row['peak']} → {new_peak}")
    add_patch(row["id"], fields)

# 4. RTJ TRAIL – convert per-unit to trip totals (5 rounds, 3 nights, 4 days)
print("\n[4] RTJ Trail per-unit conversion...")
RTJ_SLUG = "rtj-trail"
RTJ_ROUNDS = 5
RTJ_NIGHTS = 3
RTJ_DAYS   = 4
rtj_rows = trip_rows.get(RTJ_SLUG, [])
for row in rtj_rows:
    line_l = row["line"].lower()
    if "tee fee" in line_l or "green fee" in line_l:
        new_line = f"Tee fees ({RTJ_ROUNDS} rounds, with cart)"
        new_s = multiply_per_unit(row["shoulder"], RTJ_ROUNDS)
        new_p = multiply_per_unit(row["peak"],     RTJ_ROUNDS)
        print(f"  RTJ tee: '{row['line']}' → '{new_line}'  {row['shoulder']}×{RTJ_ROUNDS} → {new_s}")
        add_patch(row["id"], {"Line": new_line, "Shoulder": new_s, "Peak": new_p})
    elif "lodg" in line_l or "night" in line_l or "hotel" in line_l or "room" in line_l:
        new_line = f"Lodging ({RTJ_NIGHTS} nights, shared room)"
        new_s = multiply_per_unit(row["shoulder"], RTJ_NIGHTS)
        new_p = multiply_per_unit(row["peak"],     RTJ_NIGHTS)
        print(f"  RTJ lodg: '{row['line']}' → '{new_line}'  {row['shoulder']}×{RTJ_NIGHTS} → {new_s}")
        add_patch(row["id"], {"Line": new_line, "Shoulder": new_s, "Peak": new_p})
    elif "food" in line_l or "drink" in line_l:
        new_line = f"Food & drink ({RTJ_DAYS} days)"
        new_s = multiply_per_unit(row["shoulder"], RTJ_DAYS)
        new_p = multiply_per_unit(row["peak"],     RTJ_DAYS)
        print(f"  RTJ food: '{row['line']}' → '{new_line}'  {row['shoulder']}×{RTJ_DAYS} → {new_s}")
        add_patch(row["id"], {"Line": new_line, "Shoulder": new_s, "Peak": new_p})
    elif "rental" in line_l or "transport" in line_l or "car" in line_l:
        new_line = f"Rental car ({RTJ_NIGHTS} days, split 4 ways)"
        new_s = multiply_per_unit(row["shoulder"], RTJ_NIGHTS)
        new_p = multiply_per_unit(row["peak"],     RTJ_NIGHTS)
        print(f"  RTJ car: '{row['line']}' → '{new_line}'  {row['shoulder']}×{RTJ_NIGHTS} → {new_s}")
        add_patch(row["id"], {"Line": new_line, "Shoulder": new_s, "Peak": new_p})

# 5. LAJITAS – strip /person from all labels and values
print("\n[5] Lajitas /person cleanup...")
LAJITAS_SLUG = "lajitas-tx"
lajitas_rows = trip_rows.get(LAJITAS_SLUG, [])
for row in lajitas_rows:
    new_line = strip_per_unit_label(row["line"])
    new_s    = strip_per_unit_value(row["shoulder"])
    new_p    = strip_per_unit_value(row["peak"])
    if new_line != row["line"] or new_s != row["shoulder"] or new_p != row["peak"]:
        print(f"  Lajitas: '{row['line']}' → '{new_line}'  shoulder: {row['shoulder']} → {new_s}")
        add_patch(row["id"], {"Line": new_line, "Shoulder": new_s, "Peak": new_p})

# 6. OMNI BARTON CREEK – strip /person; tee fee round fix already handled in [3]
print("\n[6] Omni Barton Creek /person cleanup...")
OBC_SLUG = "omni-barton-creek"
obc_rows = trip_rows.get(OBC_SLUG, [])
for row in obc_rows:
    new_line = strip_per_unit_label(row["line"])
    new_s    = strip_per_unit_value(row["shoulder"])
    new_p    = strip_per_unit_value(row["peak"])
    if new_line != row["line"] or new_s != row["shoulder"] or new_p != row["peak"]:
        print(f"  OBC: '{row['line']}' → '{new_line}'  shoulder: {row['shoulder']} → {new_s}")
        # Check if this row already has a pending patch; if so, strip /person from
        # the already-updated values to avoid reverting earlier round/night scaling.
        existing = next((p for p in patches if p["id"] == row["id"]), None)
        if existing:
            base_line     = existing["fields"].get("Line",     row["line"])
            base_shoulder = existing["fields"].get("Shoulder", row["shoulder"])
            base_peak     = existing["fields"].get("Peak",     row["peak"])
            stripped_line = strip_per_unit_label(base_line)
            stripped_s    = strip_per_unit_value(base_shoulder)
            stripped_p    = strip_per_unit_value(base_peak)
            if stripped_line != base_line:
                existing["fields"]["Line"] = stripped_line
            if stripped_s != base_shoulder:
                existing["fields"]["Shoulder"] = stripped_s
            if stripped_p != base_peak:
                existing["fields"]["Peak"] = stripped_p
        else:
            add_patch(row["id"], {"Line": new_line, "Shoulder": new_s, "Peak": new_p})

# 7. CABOT CITRUS FARMS – caddie per-round → 4-round total
print("\n[7] Cabot Citrus Farms caddie conversion...")
CCF_SLUG = "cabot-citrus-farms"
ccf_rows = trip_rows.get(CCF_SLUG, [])
for row in ccf_rows:
    if "caddie" in row["line"].lower() or "forecaddie" in row["line"].lower():
        new_line = "Caddie (forecaddie, 4 rounds)"
        new_s = multiply_per_unit(row["shoulder"], 4)
        new_p = multiply_per_unit(row["peak"],     4)
        print(f"  CCF caddie: '{row['line']}' → '{new_line}'  {row['shoulder']}×4 → {new_s}")
        # Check for existing patch
        existing = next((p for p in patches if p["id"] == row["id"]), None)
        if existing:
            existing["fields"].update({"Line": new_line, "Shoulder": new_s, "Peak": new_p})
        else:
            add_patch(row["id"], {"Line": new_line, "Shoulder": new_s, "Peak": new_p})

# 8. WHISTLING STRAITS – fix missing $ in value strings
print("\n[8] Whistling Straits value formatting...")
WS_SLUG = "whistling-straits"
ws_rows = trip_rows.get(WS_SLUG, [])
for row in ws_rows:
    fixed_s = re.sub(r'(\$\d[\d,]*)–(\d)', r'\1–$\2', row["shoulder"])
    fixed_p = re.sub(r'(\$\d[\d,]*)–(\d)', r'\1–$\2', row["peak"])
    if fixed_s != row["shoulder"] or fixed_p != row["peak"]:
        existing = next((p for p in patches if p["id"] == row["id"]), None)
        if existing:
            if fixed_s != row["shoulder"]: existing["fields"]["Shoulder"] = fixed_s
            if fixed_p != row["peak"]:     existing["fields"]["Peak"]     = fixed_p
        else:
            fields = {}
            if fixed_s != row["shoulder"]: fields["Shoulder"] = fixed_s
            if fixed_p != row["peak"]:     fields["Peak"]     = fixed_p
            if fields:
                print(f"  WS: shoulder {row['shoulder']} → {fixed_s}")
                add_patch(row["id"], fields)

# 9. WESTERN NEBRASKA – add Dismal River row
print("\n[9] Western Nebraska – add Dismal River...")
WNE_SLUG = "western-nebraska"
wne_trip = trip_by_slug.get(WNE_SLUG)
if wne_trip:
    # Check if Dismal River row already exists
    existing_dismal = find_row(WNE_SLUG, "Dismal River")
    if existing_dismal:
        print(f"  ⚠ Dismal River row already exists, skipping")
    else:
        new_row_fields = {
            "Line":       "Dismal River (2 rounds)",
            "Shoulder":   "$400–$600",
            "Peak":       "$500–$700",
            "Off-Season": "$350–$500",
            "Optional":   False,
            "Sort Order": 3,
        }
        print(f"  Creating Dismal River row: {new_row_fields}")
        new_id = post_record(COST_TABLE, new_row_fields)
        if not DRY_RUN:
            link_cost_row(wne_trip["id"], new_id, wne_trip["cost_row_ids"])
            print(f"  ✓ Created and linked Dismal River row (id: {new_id})")


# ── de-duplicate patches (keep last for each record id) ──────────────────────

seen = {}
for p in patches:
    if p["id"] in seen:
        seen[p["id"]]["fields"].update(p["fields"])
    else:
        seen[p["id"]] = {"id": p["id"], "fields": dict(p["fields"])}

final_patches = list(seen.values())
print(f"\n{'='*60}")
print(f"Total records to patch: {len(final_patches)}")


# ── apply patches ─────────────────────────────────────────────────────────────

if final_patches:
    print(f"\nApplying patches{' (DRY RUN)' if DRY_RUN else ''}...")
    patch_batch(COST_TABLE, final_patches)

print("\nDone.")
