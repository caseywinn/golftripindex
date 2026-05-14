#!/usr/bin/env python3
"""
Downloads side-trip images from Wikipedia's page thumbnails.
Usage: python3 fetch-side-trip-images.py
"""
import requests
import sys
import io
from pathlib import Path
from PIL import Image

DEST = Path("/workspaces/golftripindex/public/images/side-trips")
TARGET_W = 1000
TARGET_H = 667  # 3:2 ratio

HEADERS = {"User-Agent": "GolfTripIndex/1.0 (caseywinn@gmail.com)"}

IMAGES = [
    # slug, wikipedia search query
    ("new-orleans",                  "New Orleans Louisiana"),
    ("garden-of-the-gods",           "Garden of the Gods Colorado Springs"),
    ("french-lick-scenic-railway",   "French Lick Scenic Railway Indiana"),
    ("niagara-falls",                "Niagara Falls"),
    ("theodore-roosevelt-national-park", "Theodore Roosevelt National Park North Dakota"),
    ("cooperstown",                  "Cooperstown New York Baseball Hall of Fame"),
    ("saguaro-national-park",        "Saguaro National Park Arizona"),
    ("napa-valley-wineries",         "Napa Valley vineyards wine"),
    ("san-francisco",                "San Francisco skyline"),
    ("streamsong-fishing",           "bass fishing Florida lake"),
    ("greenbrier-gun-club",          "sporting clays shooting range"),
    ("greenbrier-fly-fishing",       "fly fishing mountain river trout"),
    ("homestead-shooting-club",      "skeet shooting clay target"),
    ("sandy-creek-sporting-grounds", "sporting clays course grounds"),
    ("broadfield-sporting-club",     "quail hunting plantation Georgia"),
    ("rio-grande-float-trips",       "Rio Grande canyon rafting Big Bend"),
]


def get_wikipedia_thumb(query: str, min_width: int = 800) -> str | None:
    api = "https://en.wikipedia.org/w/api.php"
    # Step 1: find page
    r = requests.get(api, params={
        "action": "query", "list": "search", "srsearch": query,
        "format": "json", "srlimit": 3,
    }, headers=HEADERS, timeout=15)
    results = r.json().get("query", {}).get("search", [])
    if not results:
        return None

    for result in results:
        title = result["title"]
        r2 = requests.get(api, params={
            "action": "query", "titles": title,
            "prop": "pageimages", "pithumbsize": 1200,
            "format": "json",
        }, headers=HEADERS, timeout=15)
        pages = r2.json().get("query", {}).get("pages", {})
        page = list(pages.values())[0]
        thumb = page.get("thumbnail", {})
        if thumb.get("width", 0) >= min_width:
            return thumb["source"]
        elif "source" in thumb:
            return thumb["source"]  # take whatever we can get

    return None


def download_and_crop(url: str, dest: Path) -> bool:
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    img = Image.open(io.BytesIO(r.content)).convert("RGB")
    w, h = img.size

    # Resize so width = TARGET_W
    new_h = int(h * TARGET_W / w)
    img = img.resize((TARGET_W, new_h), Image.LANCZOS)

    # Center-crop to TARGET_H if taller
    if new_h > TARGET_H:
        top = (new_h - TARGET_H) // 2
        img = img.crop((0, top, TARGET_W, top + TARGET_H))

    img.save(dest, "JPEG", quality=85, optimize=True)
    return True


def main():
    skip = []
    done = []
    failed = []

    for slug, query in IMAGES:
        dest = DEST / f"{slug}.jpg"
        if dest.exists():
            skip.append(slug)
            continue

        print(f"  {slug}: searching...", end=" ", flush=True)
        url = get_wikipedia_thumb(query)
        if not url:
            print("NO IMAGE FOUND")
            failed.append(slug)
            continue

        try:
            download_and_crop(url, dest)
            print(f"saved ({dest.stat().st_size // 1024}KB)")
            done.append(slug)
        except Exception as e:
            print(f"ERROR: {e}")
            failed.append(slug)

    print(f"\nDone: {len(done)} saved, {len(skip)} already existed, {len(failed)} failed")
    if failed:
        print("Failed:", ", ".join(failed))
    if skip:
        print("Skipped:", ", ".join(skip))


if __name__ == "__main__":
    main()
