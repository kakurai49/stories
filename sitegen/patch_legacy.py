"""Patch legacy HTML pages to support the experience switcher."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, Optional

from bs4 import BeautifulSoup


def _ensure_dataset(
    body, *, routes_href: str, template: str, content_id: Optional[str]
) -> None:
    body["data-experience"] = "ruri"
    body["data-template"] = template
    body["data-routes-href"] = routes_href
    if content_id:
        body["data-content-id"] = content_id
    elif "data-content-id" in body.attrs:
        del body["data-content-id"]


def _ensure_assets(soup: BeautifulSoup, css_href: str, js_href: str) -> None:
    head = soup.head
    if not head:
        head = soup.new_tag("head")
        soup.html.insert(0, head)

    if not head.find("link", attrs={"href": css_href}):
        link_tag = soup.new_tag(
            "link", rel="stylesheet", href=css_href, type="text/css"
        )
        head.append(link_tag)

    script_tag = head.find("script", attrs={"src": js_href})
    if not script_tag:
        script_tag = soup.new_tag("script", src=js_href)
        head.append(script_tag)
    script_tag["defer"] = "defer"


def _insert_switcher_button(soup: BeautifulSoup) -> None:
    nav = soup.find("nav", class_="nav") or soup.find("nav")
    if not nav:
        return

    existing = nav.find("button", attrs={"data-action": "switch-experience"})
    if existing:
        return

    button = soup.new_tag(
        "button",
        type="button",
        attrs={"class": "view-switcher", "data-action": "switch-experience"},
    )
    button.string = "体験を切り替える"
    nav.append(button)


def _patch_file(
    path: Path,
    *,
    template: str,
    routes_href: str,
    css_href: str,
    js_href: str,
    content_id: Optional[str] = None,
) -> Path:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    body = soup.body
    if not body:
        raise ValueError(f"<body> not found in {path}")

    _ensure_dataset(body, routes_href=routes_href, template=template, content_id=content_id)
    _ensure_assets(soup, css_href=css_href, js_href=js_href)
    _insert_switcher_button(soup)

    path.write_text(str(soup), encoding="utf-8")
    return path


def patch_legacy_pages(
    base_dir: Path,
    *,
    routes_href: str,
    css_href: str,
    js_href: str,
) -> list[Path]:
    """Apply switcher-friendly patches to legacy HTML pages."""

    targets: list[Path] = []
    index_path = base_dir / "index.html"
    story1_path = base_dir / "story1.html"

    if index_path.exists():
        targets.append(
            _patch_file(
                index_path,
                template="home",
                routes_href=routes_href,
                css_href=css_href,
                js_href=js_href,
            )
        )

    if story1_path.exists():
        targets.append(
            _patch_file(
                story1_path,
                template="detail",
                routes_href=routes_href,
                css_href=css_href,
                js_href=js_href,
                content_id="ep01",
            )
        )

    return targets


__all__ = ["patch_legacy_pages"]
