"""Legacy post type definitions."""

from __future__ import annotations

from typing import Literal, TypedDict


class LegacyRenderHtml(TypedDict):
    kind: Literal["html"]
    html: str


class LegacyRenderMarkdown(TypedDict):
    kind: Literal["markdown"]
    markdown: str


LegacyRender = LegacyRenderHtml | LegacyRenderMarkdown


class LegacyPost(TypedDict, total=False):
    contentId: str
    experience: str
    pageType: str
    title: str
    summary: str
    role: str
    profile: str
    ctaLabel: str
    ctaHref: str
    tags: list[str]
    render: LegacyRender
