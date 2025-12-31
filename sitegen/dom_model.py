"""Simple DOM model for HTML serialization."""

from __future__ import annotations

import html
from dataclasses import dataclass, field
from typing import Dict, List, Sequence


@dataclass
class DomNode:
    tag: str
    attrs: Dict[str, str] = field(default_factory=dict)
    children: List["DomContent"] = field(default_factory=list)
    text: str | None = None
    raw_html: str | None = None
    self_closing: bool = False


DomContent = DomNode | str


def _render_attrs(attrs: Dict[str, str]) -> str:
    if not attrs:
        return ""
    parts = [f'{name}="{html.escape(value, quote=True)}"' for name, value in attrs.items()]
    return " " + " ".join(parts)


def _render_children(children: Sequence[DomContent]) -> str:
    html_parts: List[str] = []
    for child in children:
        if isinstance(child, DomNode):
            html_parts.append(dom_to_html([child]))
        else:
            html_parts.append(html.escape(str(child)))
    return "".join(html_parts)


def dom_to_html(dom: List[DomNode]) -> str:
    parts: List[str] = []
    for node in dom:
        attrs = _render_attrs(node.attrs)
        if node.self_closing:
            parts.append(f"<{node.tag}{attrs}/>")
            continue
        parts.append(f"<{node.tag}{attrs}>")
        if node.raw_html is not None:
            # Raw HTML insertion assumes content is trusted.
            parts.append(node.raw_html)
        elif node.text is not None:
            parts.append(html.escape(node.text))
        if node.children:
            parts.append(_render_children(node.children))
        parts.append(f"</{node.tag}>")
    return "".join(parts)
