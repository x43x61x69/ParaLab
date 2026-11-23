"""Compare Tamagotchi Wiki's published codes with ParaLab's catalog."""
import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

PAGE = "Tamagotchi_Paradise/List_of_Codes"
WIKI = "https://tamagotchi.fandom.com"
CATALOG = Path(__file__).resolve().parents[1] / "src" / "collection_reference.json"


class CodeTables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self.table = None
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append("".join(self.cell).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def read_codes(html):
    parser = CodeTables()
    parser.feed(html)
    codes = {"Lab": {}, "Shop": {}}
    for table in parser.tables:
        if not table:
            continue
        header, *rows = table
        kind = {"Character": "Lab", "Item": "Shop"}.get(header[0] if header else "")
        if not kind or "Code" not in header:
            continue
        column = header.index("Code")
        pattern = r"[A-Z0-9]{4}\s*[A-Z0-9]{4}" if kind == "Lab" else r"[0-9]{4}\s*[0-9]{4}"
        for row in rows:
            # Some published rows omit the sprite cell entirely.
            candidates = row[1:column + 1]
            for value in reversed(candidates):
                if re.fullmatch(pattern, value.upper()):
                    code = re.sub(r"\s+", "", value).upper()
                    codes[kind][code] = row[0]
                    break
    if len(codes["Lab"]) < 15 or len(codes["Shop"]) < 47:
        raise ValueError("Wiki code tables are incomplete or their format has changed")
    return codes


def fetch_codes():
    query = urlencode({"action": "parse", "page": PAGE, "prop": "text",
                       "format": "json", "formatversion": 2})
    sources = [(f"{WIKI}/api.php?{query}", True), (f"{WIKI}/wiki/{PAGE}", False)]
    errors = []
    for url, is_api in sources:
        try:
            request = Request(url, headers={"User-Agent": "ParaLab catalog check (github.com/x43x61x69/ParaLab)"})
            with urlopen(request, timeout=15) as response:
                body = response.read().decode("utf-8")
            return read_codes(json.loads(body)["parse"]["text"] if is_api else body)
        except (URLError, TimeoutError, ValueError, KeyError) as error:
            errors.append(str(error))
    raise ValueError("; ".join(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html", type=Path, help="compare against a saved Wiki page")
    parser.add_argument("--warn-unavailable", action="store_true",
                        help="warn if Wiki access fails, while still failing on verified differences")
    args = parser.parse_args()
    try:
        wiki = read_codes(args.html.read_text(encoding="utf-8")) if args.html else fetch_codes()
    except (OSError, ValueError) as error:
        prefix = "::warning::" if args.warn_unavailable else ""
        print(f"{prefix}Wiki comparison unavailable. Review {WIKI}/wiki/{PAGE} manually before publishing. {error}",
              file=sys.stderr)
        return 0 if args.warn_unavailable else 2

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    local = {"Lab": {entry["code"] for entry in catalog["characters"].values()},
             "Shop": set(catalog["shopCodes"].values())}
    missing = False
    for kind, entries in wiki.items():
        print(f"Wiki {kind} Codes: {len(entries)} distinct codes")
        for code in sorted(entries.keys() - local[kind]):
            print(f"Missing {kind} Code: {entries[code]} ({code})")
            missing = True
    return int(missing)


if __name__ == "__main__":
    sys.exit(main())
