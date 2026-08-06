#!/usr/bin/env python3
"""Turn the extracted standards JSON into the app's generated data module."""
import json
import re
import sys

# Topic each standard belongs to, for the filter chips on the standards page.
CATS = {
    "P.003.MLT.003": "პროცესები",
    "P.004.MLT.004": "MEP / სანტექნიკა",
    "P.028.MLT.024": "პროცესები",
    "P.052.MLT.041": "MEP / სანტექნიკა",
    "S.018.MLT.017": "პროცესები",
    "S.019.MLT.018": "მონტაჟი",
    "S.025.MLT.023": "კეთილმოწყობა",
    "S.026.MLT.024": "მოპირკეთება",
    "S.027.MLT.025": "კონსტრუქცია",
    "S.028.MLT.026": "წყობა",
    "S.029.MLT.027": "კონსტრუქცია",
    "S.030.MLT.028": "ფასადი",
    "S.031.MLT.029": "მოპირკეთება",
    "S.032.MLT.030": "მოპირკეთება",
    "S.033.MLT.031": "კეთილმოწყობა",
    "S.034.MLT.032": "მოპირკეთება",
    "S.035.MLT.033": "მონტაჟი",
    "S.036.MLT.034": "კონსტრუქცია",
    "S.037.MLT.035": "ფასადი",
    "S.038.MLT.036": "კონსტრუქცია",
    "S.039.MLT.037": "ჰიდროიზოლაცია",
    "S.055.MLT.045": "მონტაჟი",
    "S.064.MLT.049": "MEP / სანტექნიკა",
    "S.085.MLT.051": "კონსტრუქცია",
    "S.141.TEC.019": "პროცესები",
    "S.143.MLT.038": "მოპირკეთება",
    "S.154.TEC.020": "კონსტრუქცია",
    "S.155.TEC.021": "კონსტრუქცია",
}

MONTHS = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"]


def ts(value, indent=0):
    """Serialise to TypeScript source (JSON is valid TS, but quote style differs)."""
    pad = "  " * indent
    if isinstance(value, str):
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"
    if isinstance(value, (int, float)):
        return str(value)
    if value is None:
        return "null"
    if isinstance(value, list):
        if not value:
            return "[]"
        inner = ",\n".join(f"{pad}  {ts(v, indent + 1)}" for v in value)
        return "[\n" + inner + f",\n{pad}]"
    if isinstance(value, dict):
        if not value:
            return "{}"
        parts = []
        for k, v in value.items():
            key = k if re.match(r"^[A-Za-z_$][\w$]*$", k) else f"'{k}'"
            parts.append(f"{pad}  {key}: {ts(v, indent + 1)}")
        return "{\n" + ",\n".join(parts) + f",\n{pad}}}"
    raise TypeError(type(value))


def pretty_date(raw):
    """Normalise the assorted date formats on the cover pages to `12 მაი 2024`."""
    if not raw:
        return ""
    m = re.search(r"(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})", raw)
    if not m:
        return raw.strip()
    a, b, c = m.groups()
    if len(a) == 4:  # yyyy-mm-dd
        year, month, day = int(a), int(b), int(c)
    elif len(c) == 4 and int(a) > 12:  # dd.mm.yyyy
        day, month, year = int(a), int(b), int(c)
    elif len(c) == 4:  # m/d/yyyy as written by the export
        month, day, year = int(a), int(b), int(c)
    else:
        return raw.strip()
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return raw.strip()
    return f"{day} {MONTHS[month - 1]} {year}"


def main():
    src, dest, index_dest = sys.argv[1], sys.argv[2], sys.argv[3]
    docs = json.load(open(src))
    out = []
    for d in docs:
        code = d["code"]
        meta = {k: v for k, v in d["meta"].items() if k not in ("code", "name") and v}
        # `_____` and friends are placeholders left in the source documents.
        meta = {k: v for k, v in meta.items() if not re.fullmatch(r"[_\-–—.\s]+", v)}
        for field in ("approved", "changed"):
            if meta.get(field):
                meta[field] = pretty_date(meta[field])
        if meta.get("version"):  # some covers write "I ვერსია", most just "I"
            meta["version"] = re.sub(r"\s*ვერსია\s*$", "", meta["version"]).strip()
        sections = [
            {"title": s["title"], "blocks": s["blocks"]} for s in d["sections"] if s["blocks"]
        ]
        out.append(
            {
                "code": code,
                "title": d["title"],
                "cat": CATS.get(code, "სხვა"),
                "kind": "P" if code.startswith("P.") else "S",
                "pages": d["pages"],
                "meta": meta,
                "sections": sections,
            }
        )

    header = (
        "// GENERATED FILE — do not edit by hand.\n"
        "//\n"
        "// The 28 TEC department standards, extracted from their SharePoint PDF exports.\n"
        "// The exports' logo banner, timestamp headers and URL footers are stripped;\n"
        "// what remains is the document itself.\n"
        "//\n"
        "// To refresh:\n"
        "//   python3 scripts/extract-standards.py <pdf-dir> public/standards standards.json\n"
        "//   python3 scripts/generate-standards-ts.py standards.json \\\n"
        "//     src/data/standards-content.ts src/data/standards-index.ts\n\n"
    )

    with open(dest, "w") as fh:
        fh.write(header)
        fh.write("import type { StandardDoc } from './domain'\n\n")
        fh.write("export const STANDARD_DOCS: StandardDoc[] = ")
        fh.write(ts(out, 0))
        fh.write("\n")

    # The card list is generated separately so seeding the database does not pull
    # the whole body text into the initial bundle.
    index = [
        {
            "code": d["code"],
            "title": d["title"],
            "cat": d["cat"],
            "kind": d["kind"],
            "rev": f"v.{d['meta']['version']}" if d["meta"].get("version") else "—",
            "updated": d["meta"].get("changed") or d["meta"].get("approved") or "—",
            "pages": d["pages"],
            "author": d["meta"].get("author", ""),
            "dept": d["meta"].get("ownerDoc") or d["meta"].get("dept") or "",
        }
        for d in out
    ]
    with open(index_dest, "w") as fh:
        fh.write(header)
        fh.write("import type { Standard } from './domain'\n\n")
        fh.write("export const STANDARD_INDEX: Standard[] = ")
        fh.write(ts(index, 0))
        fh.write("\n")

    print(f"wrote {len(out)} docs -> {dest}, {index_dest}")


if __name__ == "__main__":
    main()
