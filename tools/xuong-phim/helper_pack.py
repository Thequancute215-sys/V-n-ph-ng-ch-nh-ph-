"""Đóng gói các tài sản đã duyệt với đường dẫn tương đối cho Xưởng phim."""
import json
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

manifest, output = map(Path, sys.argv[1:])
bundle = json.loads(manifest.read_text(encoding="utf-8"))
with ZipFile(output, "x", compression=ZIP_DEFLATED, compresslevel=3) as archive:
    archive.writestr("phim.json", json.dumps(bundle["hoSo"], indent=2, ensure_ascii=False) + "\n")
    for item in bundle["entries"]:
        archive.write(item["source"], item["dest"])
