"""Trích văn bản và vị trí từ tệp Office hoặc gói mã đính kèm, không bung tệp ra đĩa."""
import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


def xml(archive, name):
    with archive.open(name) as stream:
        data = stream.read(512 * 1024 + 1)
    if len(data) > 512 * 1024 or re.search(br"<!\s*(?:DOCTYPE|ENTITY)", data, re.I):
        raise ValueError("XML quá lớn hoặc có khai báo thực thể")
    return ET.fromstring(data.decode("utf-8-sig"))


def text(node):
    return "".join(item.text or "" for item in node.iter() if item.tag.endswith("}t"))


def index(archive, ext):
    names = archive.namelist()
    if ext == ".docx":
        paragraphs = xml(archive, "word/document.xml").findall(".//{*}p")
        for number, paragraph in enumerate(paragraphs, 1):
            yield f"Đoạn {number}", text(paragraph)
    elif ext == ".pptx":
        slides = [(int(match[1]), name) for name in names if (match := re.fullmatch(r"ppt/slides/slide(\d+)\.xml", name))]
        for number, name in sorted(slides):
            yield f"Slide {number}", "\n".join(text(p) for p in xml(archive, name).findall(".//{*}p"))
    elif ext == ".xlsx":
        shared = [text(item) for item in xml(archive, "xl/sharedStrings.xml")] if "xl/sharedStrings.xml" in names else []
        for name in names:
            if not re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name):
                continue
            for row in xml(archive, name).findall(".//{*}row"):
                values = []
                for cell in row.findall("{*}c"):
                    value = cell.findtext("{*}v") or text(cell)
                    if cell.get("t") == "s":
                        value = shared[int(value)]
                    if value:
                        values.append(f"{cell.get('r', '?')}={value}")
                yield name, " | ".join(values)
    else:
        files = [name for name in names if not name.endswith("/") and len(name) <= 200]
        yield "Danh mục tệp", "\n".join(files[:120])
        for name in files[:120]:
            if Path(name).name.lower() not in {"readme.md", "readme.txt"}:
                continue
            with archive.open(name) as stream:
                yield name, stream.read(4096).decode("utf-8-sig", errors="replace")


def main():
    results = []
    room = 12000
    for raw in sys.argv[1:]:
        if room <= 0:
            break
        path = Path(raw)
        entry = {"path": raw, "trich": []}
        results.append(entry)
        try:
            with ZipFile(path) as archive:
                for place, body in index(archive, path.suffix.lower()):
                    if room <= 0:
                        break
                    snippet = body.strip()[:min(room, 1500)]
                    if snippet:
                        room -= len(snippet) + len(place)
                        entry["trich"].append({"viTri": place, "noiDung": snippet})
        except (OSError, BadZipFile, ValueError, ET.ParseError, KeyError, IndexError, RuntimeError) as error:
            entry["loi"] = type(error).__name__
    print(json.dumps(results, ensure_ascii=True))


if __name__ == "__main__":
    main()
