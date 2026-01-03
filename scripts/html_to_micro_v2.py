#!/usr/bin/env python3
"""Generate a micro store (v2) from a static HTML entry page.

The converter extracts semantic blocks from the `<main>` (or `<body>`) section
of the input HTML and emits a deterministic micro store compatible with the
existing micro v2 loaders and validators. Only a lightweight subset of tags is
handled (headings, paragraphs, list items, and links), but whitespace is
normalized to keep fingerprints stable.
"""

from __future__ import annotations

import argparse
import html as html_lib
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List

from bs4 import BeautifulSoup, NavigableString, Tag

REPO_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT_STR = str(REPO_ROOT)
if REPO_ROOT_STR not in sys.path:
    sys.path.insert(0, REPO_ROOT_STR)

from sitegen.compile_pipeline import compile_store_v2
from sitegen.io_utils import write_json_stable
from sitegen.micro_ids import block_id_from_block
from sitegen.micro_store import MicroStore


WHITESPACE_RE = re.compile(r"\s+")


@dataclass
class BuildOptions:
    input_path: Path
    out_dir: Path
    entity_id: str
    variant: str
    page_type: str
    force: bool


def _normalize_text(text: str) -> str:
    return WHITESPACE_RE.sub(" ", text).strip()


def _select_content_root(soup: BeautifulSoup) -> Tag:
    main = soup.find("main")
    if main:
        return main
    body = soup.find("body")
    if body:
        return body
    return soup


def _ancestor_href(tag: Tag) -> str | None:
    anchor = tag if tag.name == "a" else tag.find_parent("a", href=True)
    if isinstance(anchor, Tag) and anchor.has_attr("href"):
        return anchor.get("href") or None
    return None


def _append_text_inline(inlines: List[Dict[str, str]], text: str) -> None:
    if not text:
        return
    if inlines and inlines[-1].get("type") == "Text":
        inlines[-1]["text"] += text
    else:
        inlines.append({"type": "Text", "text": text})


def _parts_to_inlines(parts: List[tuple[str, str, str | None]], href_hint: str | None) -> List[Dict[str, str]]:
    inlines: List[Dict[str, str]] = []
    for idx, (kind, value, href) in enumerate(parts):
        if idx > 0:
            _append_text_inline(inlines, " ")
        if kind == "text":
            _append_text_inline(inlines, value)
        else:
            inlines.append({"type": "InlineLink", "label": value, "href": href or href_hint or ""})
    return inlines or [{"type": "Text", "text": ""}]


def _inlines_from_tag(tag: Tag, *, href_hint: str | None = None) -> List[Dict[str, str]]:
    parts: List[tuple[str, str, str | None]] = []
    for child in tag.contents:
        if isinstance(child, NavigableString):
            text = _normalize_text(str(child))
            if text:
                parts.append(("text", text, None))
            continue
        if not isinstance(child, Tag):
            continue
        name = child.name.lower()
        if name in {"script", "style"}:
            continue
        if name == "br":
            parts.append(("text", " ", None))
            continue
        if name == "a":
            label = _normalize_text(child.get_text(" ", strip=True))
            href = child.get("href") or href_hint
            if label:
                parts.append(("link", label, href))
            continue
        text = _normalize_text(child.get_text(" ", strip=True))
        if text:
            parts.append(("text", text, None))
    return _parts_to_inlines(parts, href_hint)


def _heading_block(tag: Tag) -> dict | None:
    text = _normalize_text(tag.get_text(" ", strip=True))
    if not text:
        return None
    level = 1
    try:
        level = int(tag.name[1])
    except (ValueError, IndexError):
        level = 1
    return {"type": "Heading", "level": level, "text": text}


def _paragraph_block(tag: Tag) -> dict | None:
    text = _normalize_text(tag.get_text(" ", strip=True))
    if not text:
        return None
    inlines = _inlines_from_tag(tag, href_hint=_ancestor_href(tag))
    return {"type": "Paragraph", "inlines": inlines}


def _list_item_block(tag: Tag) -> dict | None:
    block = _paragraph_block(tag)
    if not block:
        return None
    inlines = block.get("inlines", [])
    if inlines:
        inlines = [{"type": "Text", "text": "• "}] + inlines
    block["inlines"] = inlines
    return block


def _link_block(tag: Tag) -> dict | None:
    href = tag.get("href")
    if not href:
        return None
    label = _normalize_text(tag.get_text(" ", strip=True))
    if not label:
        return None
    return {"type": "Link", "label": label, "href": href}


def _iter_blocks(content_root: Tag) -> Iterable[dict]:
    for element in content_root.descendants:
        if not isinstance(element, Tag):
            continue
        name = element.name.lower()
        if name in {"script", "style"}:
            continue
        block: dict | None = None
        if name in {"h1", "h2", "h3"}:
            block = _heading_block(element)
        elif name == "p":
            block = _paragraph_block(element)
        elif name == "li":
            block = _list_item_block(element)
        elif name == "a":
            block = _link_block(element)
        if block:
            yield block


def _block_text(block: dict) -> str:
    btype = block.get("type")
    if btype == "Heading":
        return block.get("text", "")
    if btype == "Paragraph":
        parts: List[str] = []
        for inline in block.get("inlines", []):
            if inline.get("type") == "Text":
                parts.append(inline.get("text", ""))
            elif inline.get("type") == "InlineLink":
                parts.append(inline.get("label", ""))
        return _normalize_text(" ".join(parts))
    if btype == "Link":
        return block.get("label", "")
    return ""


def build_micro_store_from_html(opts: BuildOptions) -> None:
    if not opts.input_path.exists():
        raise FileNotFoundError(f"Input HTML not found: {opts.input_path}")

    html = opts.input_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    content_root = _select_content_root(soup)

    if opts.out_dir.exists():
        if not opts.force:
            raise SystemExit(f"Output directory already exists: {opts.out_dir}. Use --force to overwrite.")
        shutil.rmtree(opts.out_dir)

    blocks_dir = opts.out_dir / "blocks"
    entities_dir = opts.out_dir / "entities"
    blocks_dir.mkdir(parents=True, exist_ok=True)
    entities_dir.mkdir(parents=True, exist_ok=True)

    blocks_by_id: Dict[str, dict] = {}
    block_ids: List[str] = []
    block_refs: List[str] = []

    for block in _iter_blocks(content_root):
        block_id = block_id_from_block(block)
        block_with_id = {"id": block_id, **block}
        if block_id not in blocks_by_id:
            blocks_by_id[block_id] = block_with_id
            block_ids.append(block_id)
            write_json_stable(blocks_dir / f"{block_id}.json", block_with_id)
        block_refs.append(block_id)

    title = _normalize_text(soup.title.get_text() if soup.title else "")
    if not title:
        for block in blocks_by_id.values():
            if block.get("type") == "Heading":
                title = block.get("text", "")
                break
    description = ""
    meta_description = soup.find("meta", attrs={"name": "description"})
    if meta_description and meta_description.get("content"):
        description = _normalize_text(meta_description["content"])
    if not description:
        for block_id in block_refs:
            description = _block_text(blocks_by_id[block_id])
            if description:
                break

    tags = []
    for tag in content_root.select(".tag"):
        text = _normalize_text(tag.get_text(" ", strip=True))
        if text:
            tags.append(text)

    entity = {
        "id": opts.entity_id,
        "variant": opts.variant,
        "type": opts.page_type,
        "meta": {
            "title": title or opts.entity_id,
            "summary": description or title or opts.entity_id,
            "tags": tags,
        },
        "body": {"blockRefs": block_refs},
        "relations": {},
    }

    write_json_stable(entities_dir / f"{opts.entity_id}.json", entity)
    index = {"entity_ids": [opts.entity_id], "block_ids": block_ids}
    write_json_stable(opts.out_dir / "index.json", index)


def _write_compiled_outputs(micro_dir: Path, out_dir: Path) -> None:
    store = MicroStore.load(micro_dir)
    compiled = compile_store_v2(store)
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "micro.css").write_text(compiled.css_text, encoding="utf-8")

    for entity in store.iter_posts():
        compiled_post = compiled.posts[entity["id"]]
        title = compiled_post.meta.get("title") or compiled_post.id
        html_doc = (
            "<!DOCTYPE html>"
            "<html lang=\"ja\">"
            "<head>"
            "<meta charset=\"utf-8\"/>"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/>"
            f"<title>{html_lib.escape(title)}</title>"
            "<link rel=\"stylesheet\" href=\"micro.css\"/>"
            "</head>"
            "<body>"
            f"{compiled_post.html}"
            "</body>"
            "</html>"
        )
        (out_dir / f"{compiled_post.id}.html").write_text(html_doc, encoding="utf-8")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert HTML to micro store (v2)")
    parser.add_argument("--input", required=True, type=Path, help="Input HTML file (e.g., etc/index.html)")
    parser.add_argument("--out", required=True, type=Path, help="Output directory for the micro store")
    parser.add_argument("--entity-id", default="etc-home", help="Entity id to assign to the generated page")
    parser.add_argument("--variant", default="etc", help="Variant to embed in the entity")
    parser.add_argument("--page-type", default="page", help="Page type value for the entity")
    parser.add_argument("--compiled-out", type=Path, help="Optional output directory for compiled HTML + micro.css")
    parser.add_argument("--force", action="store_true", help="Overwrite the output directory if it exists")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    opts = BuildOptions(
        input_path=args.input,
        out_dir=args.out,
        entity_id=args.entity_id,
        variant=args.variant,
        page_type=args.page_type,
        force=args.force,
    )
    build_micro_store_from_html(opts)
    if args.compiled_out:
        _write_compiled_outputs(opts.out_dir, args.compiled_out)
    print(f"Wrote micro store to {opts.out_dir}")


if __name__ == "__main__":
    main(sys.argv[1:])
