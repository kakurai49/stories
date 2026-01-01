"""Compilation pipeline from micro world to legacy HTML output."""

from __future__ import annotations

import importlib.util
import html
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .dom_model import DomNode, dom_to_html
from .io_utils import write_json
from .micro_store import MicroStore, load_micro_store


def resolve_blocks(entity: Dict[str, Any], store: MicroStore) -> List[Dict[str, Any]]:
    resolved = []
    for block_id in entity.get("body", {}).get("blockRefs", []):
        if block_id not in store.blocks_by_id:
            raise KeyError(f"Block {block_id} not found in store")
        resolved.append(store.blocks_by_id[block_id])
    return resolved


def _render_inlines(inlines: List[Dict[str, Any]]) -> List[Any]:
    rendered: List[Any] = []
    for inline in inlines:
        if inline["type"] == "Text":
            rendered.append(inline["text"])
        elif inline["type"] == "InlineLink":
            rendered.append(
                DomNode(
                    tag="a",
                    attrs={"class": "mw-link", "href": inline["href"]},
                    text=inline["label"],
                )
            )
    return rendered


def _convert_block(block: Dict[str, Any], lookup: Dict[str, Dict[str, Any]]) -> List[DomNode]:
    btype = block["type"]
    if btype == "Heading":
        level = int(block.get("level", 1))
        return [
            DomNode(
                tag=f"h{level}",
                attrs={"class": f"mw-heading level-{level}"},
                text=block.get("text", ""),
            )
        ]
    if btype == "Paragraph":
        children = _render_inlines(block.get("inlines", []))
        return [DomNode(tag="p", attrs={"class": "mw-paragraph"}, children=children)]
    if btype == "Link":
        return [
            DomNode(
                tag="a",
                attrs={"class": "mw-link", "href": block.get("href", "")},
                text=block.get("label", ""),
            )
        ]
    if btype == "Image":
        img = DomNode(
            tag="img",
            attrs={"class": "mw-image-img", "src": block.get("src", ""), "alt": block.get("alt", "")},
            self_closing=True,
        )
        children: List[Any] = [img]
        caption = block.get("caption")
        if caption:
            children.append(DomNode(tag="figcaption", attrs={"class": "mw-image-caption"}, text=caption))
        figure = DomNode(tag="figure", attrs={"class": "mw-image"}, children=children)
        return [figure]
    if btype == "Section":
        children: List[Any] = []
        for child_id in block.get("children", []):
            if child_id not in lookup:
                continue
            children.extend(_convert_block(lookup[child_id], lookup))
        return [DomNode(tag="div", attrs={"class": "mw-section"}, children=children)]
    if btype == "RawHtml":
        return [
            DomNode(
                tag="div",
                attrs={"class": "mw-raw", "data-kind": "rawHtml"},
                raw_html=block.get("html", ""),
            )
        ]
    if btype == "Markdown":
        html_text = None
        if importlib.util.find_spec("markdown"):
            from markdown import markdown

            html_text = markdown(block.get("source", ""))
        if html_text is not None:
            return [DomNode(tag="div", attrs={"class": "mw-md"}, raw_html=html_text)]
        escaped = html.escape(block.get("source", ""))
        return [DomNode(tag="pre", attrs={"class": "mw-md"}, raw_html=escaped)]
    return []


def blocks_to_dom(blocks: List[Dict[str, Any]], ctx: Dict[str, Any] | None = None) -> List[DomNode]:
    ctx = ctx or {}
    lookup = {block["id"]: block for block in blocks}
    dom: List[DomNode] = []
    for block in blocks:
        dom.extend(_convert_block(block, lookup))
    return dom


def apply_theme(dom: List[DomNode], theme: Dict[str, Any] | None = None) -> Tuple[List[DomNode], str]:
    theme = theme or {}
    css_lines = [
        ":root {",
        "  --mw-font-size-base: 16px;",
        "  --mw-font-family: sans-serif;",
        "  --mw-text-color: #222;",
        "}",
        ".mw-heading { font-family: var(--mw-font-family); color: var(--mw-text-color); }",
        ".mw-paragraph { font-family: var(--mw-font-family); color: var(--mw-text-color); line-height: 1.6; }",
        ".mw-link { color: #0a6cff; text-decoration: underline; }",
        ".mw-image { margin: 1em 0; }",
        ".mw-image-img { max-width: 100%; height: auto; display: block; }",
        ".mw-image-caption { font-size: 0.9em; color: #555; }",
        ".mw-section { margin: 1.5em 0; }",
        ".mw-raw { margin: 1em 0; }",
        ".mw-md { margin: 1em 0; }",
    ]
    if theme:
        for key, value in theme.items():
            css_lines.append(f":root {{ --{key}: {value}; }}")
    css_text = "\n".join(css_lines) + "\n"
    return dom, css_text


def emit_legacy(entity: Dict[str, Any], html_text: str) -> Dict[str, Any]:
    legacy: Dict[str, Any] = {
        "contentId": entity["id"],
        "experience": entity["variant"],
        "pageType": entity["type"],
        "title": entity.get("meta", {}).get("title"),
        "summary": entity.get("meta", {}).get("summary"),
        "tags": entity.get("meta", {}).get("tags", []),
        "render": {"kind": "html", "html": html_text},
    }
    for extra in ("role", "profile"):
        if extra in entity.get("meta", {}):
            legacy[extra] = entity["meta"][extra]
    if "dataHref" in entity.get("meta", {}):
        legacy["dataHref"] = entity["meta"]["dataHref"]
    return legacy


def build_posts(micro_dir: Path, dist_dir: Path) -> None:
    store = load_micro_store(micro_dir)
    blocks_dir = dist_dir / "posts"
    dist_dir.mkdir(parents=True, exist_ok=True)
    css_path = dist_dir / "micro.css"

    generated_css = None

    for entity in store.entities:
        blocks = resolve_blocks(entity, store)
        dom = blocks_to_dom(blocks, ctx={"entity": entity})
        dom, css_text = apply_theme(dom, theme={})
        if generated_css is None:
            css_path.write_text(css_text, encoding="utf-8")
            generated_css = css_text
        html_text = dom_to_html(dom)
        legacy = emit_legacy(entity, html_text)
        blocks_dir.mkdir(parents=True, exist_ok=True)
        write_json(blocks_dir / f"{entity['id']}.json", legacy)
