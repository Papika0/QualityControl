#!/usr/bin/env python3
"""Extract Archi TEC standard PDFs into structured JSON.

These are SharePoint print-exports: an Archi logo banner and repeated title on page 1,
a timestamp header and URL footer on every page, and the real content in bordered
tables plus prose. This reads the borders for tables, keeps figures, and drops chrome.
"""
import json
import os
import re
import sys

import pymupdf

SRC = None      # PDF source directory, set by main()
FIG_DIR = None  # where extracted figures are written, set by main()

HEADER_Y = 30.0   # timestamp band
FOOTER_Y = 760.0  # sharepoint URL band
SECTION_RE = re.compile(r"^\s*(I{1,3}|IV|VI{0,3}|V)\.\s*(\S.*?)\s*$")
BULLET_RE = re.compile(r"^\s*([-–—•*]|\d+[.)])\s+(\S.*)$")
ORG_RE = re.compile(r"შპს\s*„არქი")
FIG_RE = re.compile(r"^\(?\s*(ფოტო|ფიგურა|სურათი|ნახაზი)\s*\d*", re.I)

META_LABELS = {
    "დოკუმენტის #": "code",
    "დოკუმნტის #": "code",  # typo in the source of one standard
    "დოკუმენტის ნომერი": "code",
    "დოკუმენტის სახელი": "name",
    "დოკუმენტის ტიპი": "kind",
    "დოკუმენტის ავტორი": "author",
    "დოკუმენტის დამტკიცების თარიღი": "approved",
    "დამტკიცების თარიღი": "approved",
    "ვერსიის ნომერი": "version",
    "ვერსიის #": "version",
    "დოკუმენტის ბოლო ცვლილების თარიღი": "changed",
    "ბოლო ცვლილების თარიღი": "changed",
    "პროცესზე პასუხისმგებელი დეპარტამენტი": "ownerProcess",
    "დოკუმენტზე პასუხისმგებელი დეპარტამენტი": "ownerDoc",
    "დეპარტამენტი სამსახური": "dept",
    "დეპარტამენტი": "dept",
    "დოკუმენტის ოუნერი": "ownerDoc",
    "დაკავშირებული ერთეულები/ პოზიციები": "related",
    "დაკავშირებული ერთეულები/პოზიციები": "related",
    "დოკუმენტთან წვდომის დაშვება": "access",
}


def norm(s):
    s = (s or "").replace("\n", " ").replace("\xa0", " ")
    return re.sub(r"[ \t]+", " ", s).strip()


def key(s):
    """Loose comparison key, for spotting the banner's repeat of the title."""
    return re.sub(r"[^\w]", "", norm(s).lower())


def overlaps(a, b, frac=0.25):
    """True when rect a sits inside rect b — its centre, or most of its area."""
    cx, cy = (a[0] + a[2]) / 2, (a[1] + a[3]) / 2
    if b[0] <= cx <= b[2] and b[1] <= cy <= b[3]:
        return True
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    area = max(1e-6, (a[2] - a[0]) * (a[3] - a[1]))
    return (ix * iy) / area > frac


def clean_rows(rows):
    """Trim empty cells/rows/columns from an extracted table."""
    rows = [[norm(c) for c in r] for r in rows]
    rows = [r for r in rows if any(r)]
    if not rows:
        return []
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    keep = [c for c in range(width) if any(r[c] for r in rows)]
    return [[r[c] for c in keep] for r in rows]


def label_of(cell):
    """The metadata field a cell names, if any. Some covers pad labels with dots."""
    return META_LABELS.get(norm(cell).strip(".: "))


def parse_meta(rows):
    """Read the cover table, which comes as label|value pairs or label-over-value."""
    meta = {}
    for r, row in enumerate(rows):
        for c, cell in enumerate(row):
            field = label_of(cell)
            if not field or field in meta:
                continue
            value = ""
            if c + 1 < len(row) and not label_of(row[c + 1]):
                value = norm(row[c + 1])
            if not value and r + 1 < len(rows) and c < len(rows[r + 1]):
                below = rows[r + 1][c]
                if not label_of(below):
                    value = norm(below)
            if value:
                meta[field] = value
    return meta


def page_items(doc, page, pno, code):
    """Everything on one page as ordered items, with chrome and the logo dropped."""
    items = []
    tables = page.find_tables()
    table_boxes = []
    for t in tables.tables:
        rows = clean_rows(t.extract())
        if not rows:
            continue
        table_boxes.append(t.bbox)
        items.append({"y": t.bbox[1], "type": "table", "rows": rows, "cols": len(rows[0])})

    for blk in page.get_text("dict")["blocks"]:
        if blk["type"] != 0:
            continue
        bbox = blk["bbox"]
        if bbox[3] < HEADER_Y or bbox[1] > FOOTER_Y:
            continue
        if any(overlaps(bbox, tb) for tb in table_boxes):
            continue
        for line in blk["lines"]:
            text = norm("".join(s["text"] for s in line["spans"]))
            if not text or text == "Edit":
                continue
            size = max(s["size"] for s in line["spans"])
            bold = any("bold" in s["font"].lower() for s in line["spans"])
            items.append(
                {"y": line["bbox"][1], "type": "line", "text": text,
                 "size": round(size, 1), "bold": bold, "x": line["bbox"][0]}
            )

    # Page 1 carries only the Archi logo; elsewhere, anything sizeable is a real figure
    # (the small ones are list bullets and the SharePoint "Edit" button).
    if pno > 0:
        for img in page.get_images(full=True):
            for rect in page.get_image_rects(img[0]):
                if rect.width >= 200 and rect.height >= 80:
                    items.append({"y": rect.y0, "type": "image", "xref": img[0],
                                  "w": rect.width, "h": rect.height, "page": pno})

    items.sort(key=lambda i: i["y"])
    return items


def group_lines(lines, body_size):
    """Turn a run of text lines into heading / paragraph / list blocks.

    Wrapping is told apart from a real break by the vertical gap: lines inside one
    paragraph sit about one line-height apart, while a new block is spaced further.
    """

    def is_heading(it):
        return (
            it["size"] > body_size + 0.6 or (it["bold"] and len(it["text"]) <= 70)
        ) and len(it["text"]) <= 90

    def tight(prev, cur):
        return cur["y"] - prev["y"] <= prev["size"] * 2.2

    out = []
    i = 0
    while i < len(lines):
        it = lines[i]

        if FIG_RE.match(it["text"]):
            out.append({"type": "caption", "text": it["text"].strip("()")})
            i += 1
            continue

        if BULLET_RE.match(it["text"]):
            items, prev = [], None
            while i < len(lines):
                cur = lines[i]
                m = BULLET_RE.match(cur["text"])
                if m:
                    items.append(m.group(2).strip())
                elif items and prev and tight(prev, cur) and not FIG_RE.match(cur["text"]):
                    items[-1] += " " + cur["text"]
                else:
                    break
                prev = cur
                i += 1
            out.append({"type": "list", "items": items})
            continue

        if is_heading(it):
            parts, prev = [it["text"]], it
            i += 1
            # A heading too long for one line continues on the next — but only up to a
            # heading's worth of text, since these documents also bold whole sentences.
            while (
                i < len(lines)
                and is_heading(lines[i])
                and tight(prev, lines[i])
                and lines[i]["size"] == prev["size"]
                and len(" ".join(parts)) + len(lines[i]["text"]) <= 90
            ):
                parts.append(lines[i]["text"])
                prev = lines[i]
                i += 1
            out.append({"type": "h3", "text": " ".join(parts)})
            continue

        parts, prev = [it["text"]], it
        i += 1
        while i < len(lines) and not is_heading(lines[i]) and tight(prev, lines[i]):
            if BULLET_RE.match(lines[i]["text"]) or FIG_RE.match(lines[i]["text"]):
                break
            parts.append(lines[i]["text"])
            prev = lines[i]
            i += 1
        out.append({"type": "para", "text": " ".join(parts)})
    return out


def merge_tables(blocks):
    """Rejoin a table split across a page break (same column count, no text between)."""
    out = []
    for b in blocks:
        if (
            b["type"] == "table"
            and out
            and out[-1]["type"] == "table"
            and out[-1].get("cols") == b.get("cols")
            and b.get("continued")
        ):
            out[-1]["rows"].extend(b["rows"])
            continue
        out.append(b)
    return out


def fuse_runs(blocks):
    """A run of short, unpunctuated one-liners is an enumeration set in spaced lines."""
    out, run = [], []

    def flush():
        nonlocal run
        if len(run) >= 3:
            out.append({"type": "list", "items": [b["text"] for b in run]})
        else:
            out.extend(run)
        run = []

    for b in blocks:
        if b["type"] == "para" and len(b["text"]) <= 110 and not b["text"].endswith((".", ":")):
            run.append(b)
        else:
            flush()
            out.append(b)
    flush()
    return out


def refine_tables(blocks):
    """Lift spanning title rows out of tables and drop hollow definition rows.

    A row carrying text in its first cell only is a title banner, not data; when one
    turns up mid-table it also marks where two tables were joined at a page break.
    """
    out = []
    for b in blocks:
        if b["type"] != "table":
            out.append(b)
            continue
        rows, width = b["rows"], len(b["rows"][0])
        if width <= 2:
            kept = [r for r in rows if len(r) < 2 or r[1]]
            if len(kept) > 1:
                out.append({"type": "table", "rows": kept, "cols": width})
            continue
        if len(rows) < 2:
            continue
        chunk = []
        for row in rows:
            if sum(1 for c in row if c) == 1 and row[0]:
                if chunk:
                    out.append({"type": "table", "rows": chunk, "cols": width})
                    chunk = []
                out.append({"type": "h3", "text": row[0]})
            else:
                chunk.append(row)
        if chunk:
            out.append({"type": "table", "rows": chunk, "cols": width})
    return out


def parse(path, code, title):
    doc = pymupdf.open(path)
    blocks, meta, figures = [], {}, []
    body_size = 11.0

    sizes = {}
    for page in doc:
        for blk in page.get_text("dict")["blocks"]:
            if blk["type"] != 0:
                continue
            for line in blk["lines"]:
                for s in line["spans"]:
                    if s["text"].strip():
                        sizes[round(s["size"], 1)] = sizes.get(round(s["size"], 1), 0) + len(s["text"])
    if sizes:
        body_size = max(sizes, key=sizes.get)

    pending = []
    banner_key = key(code + title)
    for pno, page in enumerate(doc):
        items = page_items(doc, page, pno, code)
        first_content = True
        for it in items:
            if it["type"] == "line":
                # Page 1 opens with the logo banner: the org name and the document
                # title echoed across a few lines. None of it is content.
                if pno == 0:
                    k = key(it["text"])
                    if ORG_RE.search(it["text"]) or (k and k in banner_key):
                        continue
                pending.append(it)
                first_content = False  # text before a table means it isn't a continuation
                continue
            # A non-text item ends the current run of lines.
            if pending:
                blocks.extend(group_lines(pending, body_size))
                pending = []
            if it["type"] == "table":
                if not meta and parse_meta(it["rows"]).get("code"):
                    meta = parse_meta(it["rows"])
                    first_content = False
                    continue
                it["continued"] = first_content
                blocks.append(it)
            elif it["type"] == "image":
                figures.append(it)
                blocks.append({"type": "figure", "xref": it["xref"], "page": pno})
            first_content = False
    if pending:
        blocks.extend(group_lines(pending, body_size))

    blocks = fuse_runs(refine_tables(merge_tables(blocks)))
    for b in blocks:
        b.pop("y", None)
        b.pop("continued", None)
    return meta, blocks, figures, doc


def sectionize(blocks):
    """Split the block stream on roman-numbered headings that run in order."""
    ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]
    expect, marks = 0, []
    for i, b in enumerate(blocks):
        if b["type"] in ("h3", "para"):
            m = SECTION_RE.match(b.get("text", ""))
            if m and len(b["text"]) <= 46 and expect < len(ROMAN) and m.group(1) == ROMAN[expect]:
                marks.append((i, f"{m.group(1)}. {m.group(2)}"))
                expect += 1
    if not marks:
        return [{"title": None, "blocks": blocks}] if blocks else []
    sections = []
    lead = blocks[: marks[0][0]]
    if lead:
        sections.append({"title": None, "blocks": lead})
    for k, (idx, title) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else len(blocks)
        body = blocks[idx + 1 : end]
        if body:
            sections.append({"title": title, "blocks": body})
    return sections


def main():
    global SRC, FIG_DIR
    if len(sys.argv) < 4:
        sys.exit("usage: extract-standards.py <pdf-dir> <figure-out-dir> <json-out>")
    SRC, FIG_DIR = sys.argv[1], sys.argv[2]
    out = []
    for name in sorted(os.listdir(SRC)):
        if not name.lower().endswith(".pdf"):
            continue
        base = name[:-4]
        m = re.match(r"^([A-Z]\.\d+\.[A-Z]+\.\d+)\s*-?\s*(.*)$", base)
        code, title = (m.group(1), m.group(2)) if m else (base, "")
        code, title = code.strip(), title.strip()
        meta, blocks, figures, doc = parse(os.path.join(SRC, name), code, title)

        # Save content figures (the logo was already skipped with the banner).
        fig_map = {}
        if FIG_DIR and figures:
            d = os.path.join(FIG_DIR, code)
            os.makedirs(d, exist_ok=True)
            for n, f in enumerate(figures, 1):
                pix = pymupdf.Pixmap(doc, f["xref"])
                if pix.n - pix.alpha >= 4:
                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                rel = f"{code}/fig-{n}.png"
                pix.save(os.path.join(FIG_DIR, rel))
                fig_map[f["xref"]] = rel
        for b in blocks:
            if b["type"] == "figure":
                b["src"] = fig_map.get(b.pop("xref"), "")
                b.pop("page", None)
        blocks = [b for b in blocks if b["type"] != "figure" or b["src"]]

        out.append(
            {
                "code": code,
                "title": title or base,
                "meta": meta,
                "sections": sectionize(blocks),
                "pages": doc.page_count,
            }
        )
        doc.close()
    dest = sys.argv[3]
    with open(dest, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f"\nwrote {len(out)} docs -> {dest}")


if __name__ == "__main__":
    main()
