#!/usr/bin/env python3
"""
fetch-course-image.py
Usage: python3 fetch-course-image.py "<course name>" "<state>" "<slug>"

Searches for a golf course image and saves it to public/images/courses/<slug>.jpg.
Width must be 580-1400px. Tries Wikipedia first, then Exa + og:image fallback.
Resizes images wider than 1400px down to 1400px.
"""
import sys
import io
import os
import re
import requests
from pathlib import Path
from PIL import Image

DEST_DIR = Path("/workspaces/golftripindex/public/images/courses")
MIN_W, MAX_W = 580, 1400
WIKI_HEADERS = {"User-Agent": "GolfTripIndex/1.0 (caseywinn@gmail.com)"}
BROWSER = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
}
EXA_KEY = os.environ.get("EXA_API_KEY", "")


# ── helpers ───────────────────────────────────────────────────────────────────

def log(msg: str):
    print(msg, flush=True)


def validate_and_save(data: bytes, dest: Path) -> tuple[int, int] | None:
    """
    Validate image bytes: must be JPEG, width 580-1400px.
    If width > 1400, resize down to 1400px maintaining aspect ratio.
    Returns (w, h) on success, None on failure.
    """
    try:
        img = Image.open(io.BytesIO(data))
        if img.format not in ("JPEG", "MPO"):
            return None
        img = img.convert("RGB")
        w, h = img.size
        if w < MIN_W:
            return None
        if w > MAX_W:
            new_h = int(h * MAX_W / w)
            img = img.resize((MAX_W, new_h), Image.LANCZOS)
            w, h = MAX_W, new_h
        img.save(dest, "JPEG", quality=88, optimize=True)
        return (w, h)
    except Exception:
        return None


def try_download_jpg(url: str, dest: Path) -> tuple[int, int] | None:
    """Download url, validate it's a JPG in range, save to dest."""
    try:
        r = requests.get(url, headers=BROWSER, timeout=20, allow_redirects=True)
        if r.status_code != 200:
            return None
        ct = r.headers.get("Content-Type", "").lower()
        # Accept jpeg content-type; also allow octet-stream and re-verify via PIL
        if ct and "html" in ct:
            return None
        return validate_and_save(r.content, dest)
    except Exception:
        return None


def og_image_from_page(url: str) -> str | None:
    """Fetch a web page and extract the og:image URL."""
    try:
        r = requests.get(url, headers=BROWSER, timeout=12, allow_redirects=True)
        if r.status_code != 200:
            return None
        for pat in [
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            r'property="og:image"\s+content="([^"]+)"',
            r'content="([^"]+)"\s+property="og:image"',
        ]:
            m = re.search(pat, r.text, re.IGNORECASE)
            if m:
                img_url = m.group(1).strip()
                if img_url.lower().endswith((".jpg", ".jpeg")) or "jpg" in img_url.lower():
                    return img_url
    except Exception:
        pass
    return None


# ── source 1: Wikipedia ───────────────────────────────────────────────────────

def wikipedia_image(query: str) -> str | None:
    api = "https://en.wikipedia.org/w/api.php"
    try:
        r = requests.get(api, params={
            "action": "query", "list": "search", "srsearch": query,
            "format": "json", "srlimit": 5,
        }, headers=WIKI_HEADERS, timeout=15)
        results = r.json().get("query", {}).get("search", [])
    except Exception:
        return None

    for result in results:
        try:
            r2 = requests.get(api, params={
                "action": "query", "titles": result["title"],
                "prop": "pageimages", "pithumbsize": 1400,
                "format": "json",
            }, headers=WIKI_HEADERS, timeout=15)
            pages = r2.json().get("query", {}).get("pages", {})
            page = list(pages.values())[0]
            thumb = page.get("thumbnail", {})
            url = thumb.get("source")
            w = thumb.get("width", 0)
            if url and w >= MIN_W:
                log(f"  Wikipedia: '{result['title']}' -> {w}px")
                return url
        except Exception:
            continue
    return None


# ── source 2: Exa search + og:image ──────────────────────────────────────────

def exa_search_images(course: str, state: str) -> list[str]:
    """Use Exa to find pages about the course, return candidate image URLs."""
    if not EXA_KEY:
        return []
    query = f'"{course}" golf course {state} photo'
    try:
        r = requests.post(
            "https://api.exa.ai/search",
            headers={"x-api-key": EXA_KEY, "Content-Type": "application/json"},
            json={"query": query, "numResults": 8, "type": "neural"},
            timeout=15,
        )
        results = r.json().get("results", [])
    except Exception:
        return []

    candidates: list[str] = []
    for res in results:
        url = res.get("url", "")
        if not url:
            continue
        log(f"  Exa result: {url[:80]}")
        og = og_image_from_page(url)
        if og:
            log(f"    og:image -> {og[:80]}")
            candidates.append(og)
    return candidates


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 4:
        print("Usage: fetch-course-image.py <course_name> <state> <slug>")
        sys.exit(1)

    course, state, slug = sys.argv[1], sys.argv[2], sys.argv[3]
    dest = DEST_DIR / f"{slug}.jpg"

    if dest.exists():
        log(f"Already exists: {dest}")
        sys.exit(0)

    log(f"Searching for: {course} ({state}) -> {slug}.jpg")

    # ── pass 1: Wikipedia ────────────────────────────────────────────────────
    log("Trying Wikipedia...")
    wiki_query = f"{course} golf course {state}"
    wiki_url = wikipedia_image(wiki_query)
    if wiki_url:
        dims = try_download_jpg(wiki_url, dest)
        if dims:
            log(f"Saved from Wikipedia: {dims[0]}x{dims[1]}px -> {dest.name}")
            sys.exit(0)
        else:
            log(f"  Wikipedia image failed validation (may not be JPG or too small)")

    # ── pass 2: Exa search + og:image ────────────────────────────────────────
    log("Trying Exa search...")
    candidates = exa_search_images(course, state)
    for img_url in candidates:
        dims = try_download_jpg(img_url, dest)
        if dims:
            log(f"Saved from Exa: {dims[0]}x{dims[1]}px -> {dest.name}")
            sys.exit(0)

    log(f"FAILED: no suitable image found for {course} ({state})")
    sys.exit(1)


if __name__ == "__main__":
    main()
