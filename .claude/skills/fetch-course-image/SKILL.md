---
name: fetch-course-image
description: Search Google Images for a golf course photo and save it to public/images/courses/. Triggers on "fetch course image", "get image for", "find image for", "download course photo", or any request to find/save an image for a golf course.
metadata:
  version: 1.0.0
---

# Fetch Course Image Skill

Download a golf course photo and save it as `public/images/courses/[slug].jpg`.

**Rules:**
- JPG only. No PNG, GIF, or other formats.
- Width must be 580–1400px. Wider images are resized down to 1400px. Images under 580px are rejected.
- Output filename is always `[slug].jpg`.

---

## Step 1 — Parse arguments

From `$ARGUMENTS`, extract:
- **Course name** — the full display name of the course (e.g. "Chambers Bay", "Harbor Pines Golf Club")
- **State** — U.S. state or country/province (e.g. "Washington", "New Jersey")
- **Slug** — if not provided, derive it: lowercase, remove special characters, replace spaces with hyphens (e.g. "harbor-pines-golf-club")

If course name or state is missing and cannot be inferred, ask once before proceeding.

---

## Step 2 — Load credentials

```bash
export $(grep -E "^EXA_API_KEY" /workspaces/golftripindex/.env.local | xargs)
```

---

## Step 3 — Run the image fetcher

```bash
export $(grep -E "^EXA_API_KEY" /workspaces/golftripindex/.env.local | xargs) && python3 /workspaces/golftripindex/scripts/fetch-course-image.py "<COURSE_NAME>" "<STATE>" "<SLUG>"
```

Replace `<COURSE_NAME>`, `<STATE>`, and `<SLUG>` with the values from Step 1.

The script tries two sources in order:
1. **Wikipedia API** — searches Wikipedia for the course, pulls the largest available thumbnail
2. **Exa search + og:image** — searches Exa for pages about the course, extracts `og:image` from the top results

---

## Step 4 — Report result

If the script exits 0, confirm: `Saved public/images/courses/<slug>.jpg`

If the script exits 1 (no suitable image found), report the failure clearly so the user can try a different query or provide a URL manually.

---

## Manual URL override

If the user provides a direct image URL (e.g. `/fetch-course-image harbor-pines New Jersey url:https://...`), skip Steps 2-3 and run:

```bash
python3 << 'EOF'
import requests, io, sys
from pathlib import Path
from PIL import Image

url = "<URL>"
slug = "<SLUG>"
dest = Path("/workspaces/golftripindex/public/images/courses") / f"{slug}.jpg"

BROWSER = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"}
r = requests.get(url, headers=BROWSER, timeout=20, allow_redirects=True)
img = Image.open(io.BytesIO(r.content)).convert("RGB")
w, h = img.size
if w > 1400:
    h = int(h * 1400 / w); w = 1400
    img = img.resize((w, h), Image.LANCZOS)
if w < 580:
    print(f"REJECTED: {w}px wide (min 580)")
    sys.exit(1)
img.save(dest, "JPEG", quality=88, optimize=True)
print(f"Saved: {w}x{h}px -> {dest.name}")
EOF
```
