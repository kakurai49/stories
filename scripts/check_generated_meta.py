"""Verify generated pages include responsive head tags and shared styles."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from bs4 import BeautifulSoup


def find_html_files(root: Path) -> Iterable[Path]:
    """Yield all HTML files under the given root directory."""

    for path in sorted(root.rglob("*.html")):
        if path.is_file():
            yield path


def main() -> None:
    target = Path("generated")
    if not target.exists():
        raise SystemExit("generated directory not found; run sitegen build first.")

    errors: list[str] = []

    for html_path in find_html_files(target):
        html = html_path.read_text(encoding="utf-8")
        soup = BeautifulSoup(html, "html.parser")

        viewport = soup.find("meta", attrs={"name": "viewport"})
        if not viewport or "width=device-width" not in (viewport.get("content") or ""):
            errors.append(f"{html_path}: viewport meta missing")

        links = soup.find_all("link", rel=lambda value: value and "stylesheet" in value)
        hrefs = [link.get("href", "") for link in links]
        if not any("assets/base.css" in href for href in hrefs):
            errors.append(f"{html_path}: shared base.css stylesheet missing")

    if errors:
        for message in errors:
            print(message)
        raise SystemExit(1)

    print(f"OK: {len(list(find_html_files(target)))} HTML files have viewport and shared styles.")


if __name__ == "__main__":
    main()
