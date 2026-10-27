"""Rebuild the standalone index.html from the editable source files.

Usage:
    python src/build.py

The output is written to the repository root as index.html and is fully
self-contained: CSS, application JS and Three.js are inlined.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "index.html"

html = (ROOT / "engine-3d.src.html").read_text(encoding="utf-8")
css = (ROOT / "engine-3d.css").read_text(encoding="utf-8")
app = (ROOT / "engine-3d.js").read_text(encoding="utf-8")
three = (ROOT / "vendor" / "three.min.js").read_text(encoding="utf-8")

assert "</style" not in css.lower()
assert "</script" not in app.lower()
assert "</script" not in three.lower()

html = html.replace(
    '<link rel="stylesheet" href="engine-3d.css">',
    "<style>\n" + css + "\n</style>",
)
html = html.replace(
    '<script src="vendor/three.min.js"></script>',
    "<!-- Three.js r160 (UMD, bundled locally) · MIT License -->\n"
    "<script>\n" + three + "\n</script>",
)
html = html.replace(
    '<script src="engine-3d.js"></script>',
    "<script>\n" + app + "\n</script>",
)

OUT.write_text(html, encoding="utf-8")
print(f"Built {OUT} ({len(html.encode('utf-8')):,} bytes)")
