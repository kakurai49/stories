"""Routing helpers and build-time site plan management."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple, TYPE_CHECKING

from .models import ContentItem, ExperienceSpec
from .util_fs import ensure_dir

if TYPE_CHECKING:  # pragma: no cover
    from .build import BuildContext


def relative_href(target: Path, base: Path) -> str:
    """Return a POSIX-style relative href from base to target."""

    return Path(os.path.relpath(target, base)).as_posix()


def relative_route(target: Path, base: Path, *, collapse_index: bool = True) -> str:
    """Return a pretty href to the target, collapsing index.html to a slash."""

    href = relative_href(target, base)
    if collapse_index and href.endswith("index.html"):
        href = href[: -len("index.html")]
        if not href:
            return "./"
        if not href.endswith("/"):
            href += "/"
    return href


@dataclass
class PageAlias:
    """Alias pointing to a canonical page."""

    url_path: str
    out_file: Path
    redirect_to: str


@dataclass
class PageSpec:
    """Description of a page to render."""

    experience: ExperienceSpec
    page_type: str
    template: str
    url_path: str
    out_file: Path
    content: ContentItem | None = None
    aliases: list[PageAlias] = field(default_factory=list)

    def href_from(self, base: Path, *, collapse_index: bool = True) -> str:
        return relative_route(self.out_file, base, collapse_index=collapse_index)


class SiteRouter:
    """Single source of truth for page specs and route payloads."""

    def __init__(
        self,
        ctx: "BuildContext",
        experiences: list[ExperienceSpec],
        items: list[ContentItem],
    ) -> None:
        self.ctx = ctx
        self.experiences = experiences
        self.items = items
        self._out_href_prefix = self._compute_out_href_prefix()
        self.pages: list[PageSpec] = []
        self.aliases: list[PageAlias] = []
        self._home: Dict[str, PageSpec] = {}
        self._list: Dict[str, PageSpec] = {}
        self._content: Dict[str, Dict[str, PageSpec]] = {}
        self._legacy_routes: Dict[str, Dict[str, str]] = {}
        self._build()

    def _compute_out_href_prefix(self) -> str:
        out_root = self.ctx.out_root
        if out_root.is_absolute():
            try:
                out_root = out_root.relative_to(Path.cwd())
            except ValueError:
                out_root = Path(out_root.name)
        prefix = "/" + out_root.as_posix().lstrip("./")
        return prefix.rstrip("/")

    def _absolute_from_url_path(self, url_path: str) -> str:
        cleaned = url_path.lstrip("./")
        if cleaned and not cleaned.startswith("/"):
            cleaned = "/" + cleaned
        return f"{self._out_href_prefix}{cleaned or '/'}"

    def _targeted_items(self, experience: ExperienceSpec) -> list[ContentItem]:
        targeted = [item for item in self.items if item.experience == experience.key]
        if experience.kind == "generated" and not targeted:
            return list(self.items)
        return targeted

    def _canonical_url(self, out_file: Path) -> str:
        return relative_route(out_file, self.ctx.out_root)

    def _register_page(
        self,
        *,
        experience: ExperienceSpec,
        page_type: str,
        template: str,
        out_file: Path,
        content: ContentItem | None = None,
        aliases: Optional[list[PageAlias]] = None,
    ) -> PageSpec:
        url_path = self._canonical_url(out_file)
        spec = PageSpec(
            experience=experience,
            page_type=page_type,
            template=template,
            url_path=url_path,
            out_file=out_file,
            content=content,
            aliases=aliases or [],
        )
        self.pages.append(spec)
        if page_type == "home":
            self._home[experience.key] = spec
        elif page_type == "list":
            self._list[experience.key] = spec
        elif content:
            self._content.setdefault(experience.key, {})[content.content_id] = spec
        return spec

    def _detail_template_name(self, experience: ExperienceSpec, page_type: str) -> str:
        candidate = f"detail_{page_type}.jinja"
        if (self.ctx.templates_dir(experience) / candidate).exists():
            return candidate
        return "detail.jinja"

    def _build_generated(self, experience: ExperienceSpec) -> None:
        output_dir = self.ctx.output_dir(experience)
        home_out = output_dir / "index.html"
        list_out = output_dir / "list" / "index.html"
        self._register_page(
            experience=experience, page_type="home", template="home.jinja", out_file=home_out
        )
        self._register_page(
            experience=experience, page_type="list", template="list.jinja", out_file=list_out
        )

        targeted = self._targeted_items(experience)
        for item in targeted:
            detail_dir = output_dir / "posts" / item.content_id
            detail_out = detail_dir / "index.html"
            alias_out = output_dir / "posts" / f"{item.content_id}.html"
            alias = PageAlias(
                url_path=relative_route(alias_out, self.ctx.out_root, collapse_index=False),
                out_file=alias_out,
                redirect_to=relative_route(detail_out, self.ctx.out_root),
            )
            spec = self._register_page(
                experience=experience,
                page_type=item.page_type,
                template=self._detail_template_name(experience, item.page_type),
                out_file=detail_out,
                content=item,
                aliases=[alias],
            )
            self.aliases.append(alias)
            self._content.setdefault(experience.key, {})[item.content_id] = spec

    def _register_legacy(self, experience: ExperienceSpec) -> None:
        base_dir = self.ctx.out_root
        payload: dict[str, str] = {}

        def _resolve_target(href: str) -> Path | None:
            raw = Path(href)
            candidates = []
            if raw.is_absolute():
                candidates.append(raw)
            else:
                candidates.append(raw.resolve())
                candidates.append((base_dir / href).resolve())
            for candidate in candidates:
                if candidate.exists():
                    return candidate
            return None

        home_href = experience.home or experience.route_patterns.home
        home_path = _resolve_target(home_href)
        if home_path:
            payload["home"] = relative_route(home_path, base_dir, collapse_index=True)

        list_href = experience.route_patterns.list
        list_path = _resolve_target(list_href)
        if list_path:
            payload["list"] = relative_route(list_path, base_dir, collapse_index=True)

        content_map: dict[str, str] = {}
        for cid, href in (experience.content or {}).items():
            target = _resolve_target(href)
            if target and target.exists():
                content_map[cid] = relative_route(target, base_dir, collapse_index=False)
        if content_map:
            payload["content"] = content_map
        if payload:
            self._legacy_routes[experience.key] = payload

    def _build(self) -> None:
        for experience in self.experiences:
            if experience.kind == "generated":
                self._build_generated(experience)
            else:
                self._register_legacy(experience)

    def home(self, experience_key: str) -> Optional[PageSpec]:
        return self._home.get(experience_key)

    def list_page(self, experience_key: str) -> Optional[PageSpec]:
        return self._list.get(experience_key)

    def content_page(self, experience_key: str, content_id: str) -> Optional[PageSpec]:
        return self._content.get(experience_key, {}).get(content_id)

    def content_ids(self, experience_key: str) -> set[str]:
        return set(self._content.get(experience_key, {}))

    def detail_template_for(self, experience: ExperienceSpec, page_type: str) -> str:
        return self._detail_template_name(experience, page_type)

    def absolute_href_for_page(self, spec: PageSpec | None) -> str:
        if not spec:
            return ""
        return self._absolute_from_url_path(spec.url_path)

    def absolute_href_for_path(self, target: Path) -> str:
        try:
            relative = target.relative_to(self.ctx.out_root)
        except ValueError:
            relative = target
        return self._absolute_from_url_path(relative.as_posix())

    def href_for_page(self, spec: PageSpec | None, base: Path) -> str:
        if not spec:
            return ""
        return spec.href_from(base)

    def routes_payload(self) -> dict:
        order = [exp.key for exp in self.experiences]
        routes: dict[str, dict] = {}
        for exp in self.experiences:
            payload: dict[str, object] = {}
            home_spec = self.home(exp.key)
            list_spec = self.list_page(exp.key)
            if home_spec:
                payload["home"] = home_spec.url_path
            if list_spec:
                payload["list"] = list_spec.url_path

            content_routes: dict[str, str] = {}
            content_aliases: dict[str, list[str]] = {}
            for slug, spec in sorted(self._content.get(exp.key, {}).items()):
                content_routes[slug] = spec.url_path
                if spec.aliases:
                    content_aliases[slug] = [alias.url_path for alias in spec.aliases]
            if content_routes:
                payload["content"] = content_routes
            if content_aliases:
                payload["contentAliases"] = content_aliases
            if exp.key in self._legacy_routes:
                payload.update(self._legacy_routes[exp.key])
            routes[exp.key] = payload
        return {"order": order, "routes": routes}

    def render_aliases(self) -> list[Path]:
        """Render redirect stubs for alias routes."""

        written: list[Path] = []
        for spec in self.pages:
            for alias in spec.aliases:
                ensure_dir(alias.out_file.parent)
                redirect_href = relative_route(spec.out_file, alias.out_file.parent)
                html = "\n".join(
                    [
                        "<!doctype html>",
                        '<html lang="ja">',
                        "  <head>",
                        '    <meta charset="utf-8">',
                        f'    <meta http-equiv="refresh" content="0; url={redirect_href}">',
                        f'    <link rel="canonical" href="{redirect_href}">',
                        "    <title>Redirecting…</title>",
                        "  </head>",
                        "  <body>",
                        f'    <p>Redirecting to <a href="{redirect_href}">{redirect_href}</a></p>',
                        "  </body>",
                        "</html>",
                    ]
                )
                alias.out_file.write_text(html, encoding="utf-8")
                written.append(alias.out_file)
        return written

    def pages_for_experience(self, experience_key: str) -> list[PageSpec]:
        return [page for page in self.pages if page.experience.key == experience_key]


__all__ = ["PageAlias", "PageSpec", "SiteRouter", "relative_href", "relative_route"]
