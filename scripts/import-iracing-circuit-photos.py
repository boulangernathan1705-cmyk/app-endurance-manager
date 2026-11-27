#!/usr/bin/env python3
"""One-shot collection of reviewed candidate files, never enables them in the UI."""
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / "docs/iracing-photo-candidates.json"
REPORT = ROOT / "docs/iracing-photo-import.json"
REVIEW = ROOT / "docs/iracing-photo-review"
COVERS = ROOT / "images/endurance/iracing"
PANOS = ROOT / "images/endurance/iracing-pano"
AGENT = "EnduranceManager/1.0 (licensed Wikimedia Commons circuit photos; https://endurance-manager.app)"
PROTECTED = {"iracing-spa", "iracing-bathurst", "iracing-laguna-seca", "iracing-tbd", "iracing-random"}
MAX_BYTES = 35_000_000
LIMIT = 180_000

class Plain(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
    def handle_data(self, data):
        self.parts.append(data)

def plain(value):
    parser = Plain()
    parser.feed(str(value or ""))
    return " ".join("".join(parser.parts).split())

def request(url, limit=MAX_BYTES):
    host = urlparse(url).hostname
    if host not in {"commons.wikimedia.org", "upload.wikimedia.org"} or not url.startswith("https://"):
        raise ValueError("Unexpected Wikimedia host")
    for attempt in range(4):
        try:
            with urlopen(Request(url, headers={"User-Agent": AGENT}), timeout=45) as resp:
                final = urlparse(resp.geturl())
                if final.scheme != "https" or final.hostname not in {"commons.wikimedia.org", "upload.wikimedia.org"}:
                    raise ValueError("Unexpected redirect")
                data = resp.read(limit + 1)
            if len(data) > limit:
                raise ValueError("Download exceeds size limit")
            return data
        except HTTPError as exc:
            if exc.code not in (429, 503) or attempt == 3:
                raise
            retry = exc.headers.get("Retry-After", "")
            try:
                delay = int(retry) if retry.isdigit() else (parsedate_to_datetime(retry) - datetime.now(timezone.utc)).total_seconds()
            except (ValueError, TypeError, OverflowError):
                delay = 45 * (attempt + 1)
            delay = max(30, delay)
            if delay > 240:
                raise RuntimeError("Wikimedia requested a retry delay beyond this run; stop") from exc
            print(f"Wikimedia {exc.code}: respect Retry-After {delay:.0f}s", flush=True)
            time.sleep(delay)
        except (URLError, TimeoutError):
            if attempt == 3:
                raise
            time.sleep(30 * (attempt + 1))

def query(titles):
    params = {"action":"query", "format":"json", "formatversion":"2", "redirects":"1", "titles":"|".join(titles),
              "prop":"imageinfo", "iiprop":"url|size|mime|sha1|extmetadata", "iiextmetadatalanguage":"en"}
    return json.loads(request("https://commons.wikimedia.org/w/api.php?" + urlencode(params), 8_000_000))["query"]

def metadata(titles):
    pages = {}
    for start in range(0, len(titles), 12):
        part = query(titles[start:start+12])
        redirects = {x["from"]:x["to"] for x in part.get("normalized", []) + part.get("redirects", [])}
        by_title = {p["title"]:p for p in part["pages"]}
        for title in titles[start:start+12]:
            target = title
            for _ in range(5):
                if target not in redirects: break
                target = redirects[target]
            pages[title] = by_title.get(target, {})
        time.sleep(5)
    return pages

def license_record(info):
    md = info["extmetadata"]
    get = lambda key: plain(md.get(key, {}).get("value", ""))
    name, url = get("LicenseShortName"), get("LicenseUrl").replace("http://", "https://", 1)
    artist = get("Artist")
    attribution = get("Attribution")
    copyright_flag = get("Copyrighted").lower()
    if re.fullmatch(r"https://creativecommons\.org/licenses/by(?:-sa)?/(?:1\.0|2\.0|2\.5|3\.0|4\.0)(?:/[a-z]{2})?/?(?:deed(?:\.[a-z-]+)?)?", url):
        if not re.match(r"^CC BY(?:-SA)?\b", name, re.I) or not artist:
            raise ValueError("CC attribution metadata incomplete")
    elif re.fullmatch(r"https://creativecommons\.org/publicdomain/zero/1\.0/?(?:deed(?:\.[a-z-]+)?)?", url) and ("CC0" in name or copyright_flag == "false"):
        name = "CC0 1.0"
    elif name.lower() in ("public domain", "pdm") and copyright_flag == "false":
        url = "https://creativecommons.org/publicdomain/mark/1.0/"
        name = "Public domain"
    else:
        raise ValueError(f"Unsupported or ambiguous licence {name!r} {url!r}")
    return {"license":name, "licenseUrl":url, "artist":artist or "Not specified (public domain)",
            "attribution":attribution, "credit":get("Credit"), "restrictions":get("Restrictions"),
            "description":get("ImageDescription")[:1200]}

def encode(im, path, size, focus):
    crop = ImageOps.fit(im, size, Image.Resampling.LANCZOS, centering=tuple(focus))
    for q in (82, 76, 70, 64, 58, 52, 46, 40):
        crop.save(path, "WEBP", quality=q, method=6)
        if path.stat().st_size <= LIMIT:
            with Image.open(path) as check:
                check.load()
                if check.size != size: raise ValueError("Unexpected crop dimensions")
            return path.stat().st_size
    raise ValueError("WebP exceeds 180 kB")

def save_report(records, errors):
    REPORT.write_text(json.dumps({"candidates":41,"downloaded":len(records),"records":records,"errors":errors}, ensure_ascii=False, indent=2)+"\n")

def review_sheets(records):
    REVIEW.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default(size=15)
    for start in range(0, len(records), 10):
        batch = records[start:start+10]
        board = Image.new("RGB",(1000,((len(batch)+1)//2)*225),"#141a21")
        draw = ImageDraw.Draw(board)
        for n, row in enumerate(batch):
            x, y = (n%2)*500, (n//2)*225
            draw.text((x+8,y+8),row["id"],font=font,fill="white")
            with Image.open(COVERS/(row["id"]+".webp")) as a:
                board.paste(ImageOps.fit(a,(160,160)),(x+8,y+32))
            with Image.open(PANOS/(row["id"]+".webp")) as p:
                board.paste(ImageOps.fit(p,(320,160)),(x+175,y+32))
            draw.text((x+8,y+197),row["license"]+" / "+str(row["coverBytes"]//1024)+" + "+str(row["panoramaBytes"]//1024)+" KiB",font=font,fill="#bac6d6")
        board.save(REVIEW/f"sheet-{start//10+1:02d}.jpg",quality=82,optimize=True)

def main():
    candidates = json.loads(CANDIDATES.read_text())
    ids = [x["id"] for x in candidates]
    assert len(ids) == len(set(ids)) == 41 and not set(ids)&PROTECTED
    assert all(re.fullmatch(r"iracing-[a-z0-9-]+", i) for i in ids)
    COVERS.mkdir(parents=True, exist_ok=True)
    PANOS.mkdir(parents=True, exist_ok=True)
    old = json.loads(REPORT.read_text()) if REPORT.exists() else {"records":[]}
    records = {r["id"]:r for r in old["records"] if (COVERS/(r["id"]+".webp")).exists() and (PANOS/(r["id"]+".webp")).exists()}
    errors = {}
    pending = [c for c in candidates if c["id"] not in records or records[c["id"]]["requestedTitle"] != c["title"]]
    pages = metadata([c["title"] for c in pending]) if pending else {}
    for c in pending:
        track = c["id"]
        cover, pano = COVERS/(track+".webp"), PANOS/(track+".webp")
        try:
            page = pages[c["title"]]
            info = page["imageinfo"][0]
            if info["mime"] not in ("image/jpeg","image/png","image/webp") or min(info["width"],info["height"]) < 450:
                raise ValueError("Not a suitable raster image")
            licence = license_record(info)
            time.sleep(12)
            raw = request(info["url"])
            with Image.open(BytesIO(raw)) as source:
                im = ImageOps.exif_transpose(source).convert("RGB")
            if min(im.size)<450:
                raise ValueError("Downloaded photo is too small")
            digest = hashlib.sha256(raw).hexdigest()
            if any(r["sha256"]==digest and r["id"]!=track for r in records.values()):
                raise ValueError("Duplicate source photograph")
            cover_bytes = encode(im, cover, (640,640), c["focus"])
            pano_bytes = encode(im, pano, (1280,720), c["focus"])
            records[track] = {"id":track,"requestedTitle":c["title"],"fileTitle":page["title"],"sourceUrl":info["descriptionurl"],
                "originalUrl":info["url"],"sha256":digest,"originalDimensions":list(im.size),"focus":c["focus"],
                "coverBytes":cover_bytes,"panoramaBytes":pano_bytes,**licence}
            print(f"OK {track}: {licence['license']} ({cover_bytes}, {pano_bytes} bytes)",flush=True)
        except (KeyError, IndexError, ValueError, OSError, RuntimeError) as exc:
            records.pop(track,None)
            cover.unlink(missing_ok=True)
            pano.unlink(missing_ok=True)
            errors[track]=str(exc)
            print(f"REVIEW REQUIRED {track}: {exc}",flush=True)
            if "retry delay beyond" in str(exc):
                break
        save_report([records[k] for k in ids if k in records],errors)
    ordered = [records[k] for k in ids if k in records]
    save_report(ordered,errors)
    review_sheets(ordered)
    print(f"Imported {len(ordered)}/41 candidates; not activated",flush=True)

if __name__ == "__main__":
    main()
