"""Micro world type definitions."""

from __future__ import annotations

from typing import Literal, TypedDict


class InlineText(TypedDict):
    type: Literal["Text"]
    text: str


class InlineLink(TypedDict):
    type: Literal["InlineLink"]
    label: str
    href: str


Inline = InlineText | InlineLink


class BaseBlock(TypedDict):
    id: str
    type: str


class HeadingBlock(BaseBlock):
    type: Literal["Heading"]
    level: int
    text: str


class ParagraphBlock(BaseBlock):
    type: Literal["Paragraph"]
    inlines: list[Inline]


class ImageBlock(BaseBlock):
    type: Literal["Image"]
    src: str
    alt: str
    caption: str | None


class LinkBlock(BaseBlock):
    type: Literal["Link"]
    label: str
    href: str


class SectionBlock(BaseBlock):
    type: Literal["Section"]
    children: list[str]


class RawHtmlBlock(BaseBlock):
    type: Literal["RawHtml"]
    html: str


class MarkdownBlock(BaseBlock):
    type: Literal["Markdown"]
    source: str


MicroBlock = (
    HeadingBlock
    | ParagraphBlock
    | ImageBlock
    | LinkBlock
    | SectionBlock
    | RawHtmlBlock
    | MarkdownBlock
)


class MicroMetaCta(TypedDict, total=False):
    label: str
    href: str


class MicroMeta(TypedDict, total=False):
    title: str
    summary: str
    tags: list[str]
    role: str
    profile: str
    cta: MicroMetaCta


class MicroBody(TypedDict):
    blockRefs: list[str]


class MicroEntity(TypedDict):
    id: str
    variant: str
    type: str
    meta: MicroMeta
    body: MicroBody
    relations: dict
