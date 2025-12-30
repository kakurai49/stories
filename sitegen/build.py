"""Build utilities for generated experiences."""

from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from pydantic import ValidationError

from .models import ContentItem, ExperienceSpec
from .util_fs import ensure_dir


@dataclass
class BuildContext:
    """Configuration for building generated experiences."""

    src_root: Path
    out_root: Path
    routes_filename: str = "routes.json"
    shared_init_features: Path | None = None
    shared_assets_dir: Path | None = None
    _copied_assets: set[str] = field(default_factory=set, init=False, repr=False)

    @property
    def shared_templates_dir(self) -> Path:
        """Directory containing shared templates available to all experiences."""

        return Path(__file__).parent / "templates"

    @property
    def shared_experience_assets_dir(self) -> Path:
        """Assets shared across generated experiences."""

        return self.src_root / "shared" / "assets"

    def templates_dir(self, experience: ExperienceSpec) -> Path:
        """Return the template directory for the experience."""

        return self.src_root / experience.key / "templates"

    def assets_dir(self, experience: ExperienceSpec) -> Path:
        """Return the assets directory for the experience."""

        return self.src_root / experience.key / "assets"

    def copy_assets(self, experience: ExperienceSpec) -> Path:
        """Copy static assets for an experience once and return the output dir."""

        output_dir = self.output_dir(experience)
        destination = ensure_dir(output_dir / "assets")
        cache_key = experience.key
        if cache_key in self._copied_assets:
            return destination

        _copy_assets(self.shared_experience_assets_dir, destination)
        _copy_assets(self.assets_dir(experience), destination)
        self._copied_assets.add(cache_key)
        return destination

    def output_dir(self, experience: ExperienceSpec) -> Path:
        """Ensure and return the output directory for the experience."""

        output_dir = experience.output_dir or experience.key
        if not output_dir:
            raise ValueError(f"output_dir is required for experience '{experience.key}'")
        return ensure_dir(self.out_root / output_dir)

    @property
    def routes_path(self) -> Path:
        """Return the shared routes.json path for all experiences."""

        return self.out_root / self.routes_filename

    def shared_asset_href(self, filename: str, base: Path) -> str | None:
        """Compute a relative href to a shared asset if configured."""

        if not self.shared_assets_dir:
            return None
        return _relative_href(self.shared_assets_dir / filename, base)

    def jinja_env(self, experience: ExperienceSpec) -> Environment:
        """Create a Jinja environment scoped to the experience templates."""

        template_dirs = [self.templates_dir(experience), self.shared_templates_dir]
        return Environment(
            loader=FileSystemLoader(template_dirs),
            autoescape=select_autoescape(["html", "jinja"]),
            trim_blocks=True,
            lstrip_blocks=True,
            undefined=StrictUndefined,
        )


def _copy_assets(source: Path, destination: Path) -> None:
    """Copy static assets into the destination directory."""

    if not source.exists():
        return

    for asset_path in source.rglob("*"):
        if asset_path.is_dir():
            continue
        relative = asset_path.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(asset_path, target)


def _relative_href(target: Path, base: Path) -> str:
    """Return a POSIX-style relative href from base to target."""

    return Path(os.path.relpath(target, base)).as_posix()


def _relative_route(target: Path, base: Path) -> str:
    """Return a pretty href to the target, collapsing index.html to a slash."""

    href = _relative_href(target, base)
    if href.endswith("index.html"):
        href = href[: -len("index.html")]
        if not href:
            return "./"
        if not href.endswith("/"):
            href += "/"
    return href


def load_content_items(content_dir: Path) -> list[ContentItem]:
    """Load and validate content items from a directory."""

    if not content_dir.exists():
        raise FileNotFoundError(f"Content directory not found: {content_dir}")

    json_paths = sorted(content_dir.glob("*.json"))
    if not json_paths:
        raise SystemExit(f"No content files found in {content_dir}")

    items: list[ContentItem] = []
    for json_path in json_paths:
        try:
            payload = json.loads(json_path.read_text(encoding="utf-8"))
            items.append(ContentItem.model_validate(payload))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise SystemExit(f"Invalid content file {json_path}: {exc}") from exc

    return items


def _content_for_experience(
    experience: ExperienceSpec, items: list[ContentItem]
) -> list[ContentItem]:
    """Return content targeted to the experience, or all items if none match."""

    targeted = [item for item in items if item.experience == experience.key]
    return targeted or items


def _post_view_models(
    experience: ExperienceSpec,
    items: list[ContentItem],
    output_dir: Path,
    base: Path,
) -> tuple[list[dict], list[dict]]:
    """Build post view models and list entries for templates.

    Returns a tuple of (posts, entries) where:
    - posts is a simplified view model for home pages
    - entries retains the richer structure currently used by list templates
    """

    posts = []
    entries = []

    for item in _content_for_experience(experience, items):
        detail_path = output_dir / "posts" / item.content_id / "index.html"
        detail_href = _relative_route(detail_path, base)

        posts.append(
            {
                "title": item.title,
                "excerpt": item.summary or item.excerpt,
                "slug": item.content_id,
                "url": detail_href,
            }
        )
        entries.append({"content": item, "detail_href": detail_href})

    return posts, entries


def build_home(
    experience: ExperienceSpec, ctx: BuildContext, items: list[ContentItem]
) -> List[Path]:
    """Render the home template for a generated experience.

    Returns a list of written paths to make it easy to tally outputs.
    """

    if experience.kind != "generated":
        return []

    template_path = ctx.templates_dir(experience) / "home.jinja"
    if not template_path.exists():
        raise FileNotFoundError(
            f"Home template not found for experience '{experience.key}': {template_path}"
        )

    env = ctx.jinja_env(experience)
    template = env.get_template("home.jinja")

    output_dir = ctx.output_dir(experience)
    ctx.copy_assets(experience)
    output_file = output_dir / "index.html"
    routes_href = _relative_href(ctx.routes_path, output_file.parent)
    asset_prefix = _relative_href(output_dir, output_file.parent)

    posts, entries = _post_view_models(
        experience, items, output_dir=output_dir, base=output_file.parent
    )

    rendered = template.render(
        experience=experience,
        routes_href=routes_href,
        asset_prefix=asset_prefix,
        switcher_css_href=ctx.shared_asset_href("switcher.css", output_file.parent),
        switcher_js_href=ctx.shared_asset_href("switcher.js", output_file.parent),
        template_key="home",
        items=entries,
        posts=posts,
        nav_links=[
            {"href": _relative_route(output_dir / "index.html", output_file.parent), "label": "ホーム"},
            {"href": _relative_route(output_dir / "list" / "index.html", output_file.parent), "label": "一覧"},
        ],
    )
    output_file.write_text(rendered, encoding="utf-8")

    return [output_file]


def build_list(
    experience: ExperienceSpec, ctx: BuildContext, items: list[ContentItem]
) -> List[Path]:
    """Render the list template for a generated experience."""

    if experience.kind != "generated":
        return []

    template_path = ctx.templates_dir(experience) / "list.jinja"
    if not template_path.exists():
        raise FileNotFoundError(
            f"List template not found for experience '{experience.key}': {template_path}"
        )

    output_dir = ctx.output_dir(experience)
    list_dir = ensure_dir(output_dir / "list")
    output_file = list_dir / "index.html"
    routes_href = _relative_href(ctx.routes_path, output_file.parent)

    env = ctx.jinja_env(experience)
    template = env.get_template("list.jinja")

    ctx.copy_assets(experience)
    asset_prefix = _relative_href(output_dir, output_file.parent)

    _, entries = _post_view_models(
        experience, items, output_dir=output_dir, base=output_file.parent
    )

    rendered = template.render(
        experience=experience,
        routes_href=routes_href,
        asset_prefix=asset_prefix,
        switcher_css_href=ctx.shared_asset_href("switcher.css", output_file.parent),
        switcher_js_href=ctx.shared_asset_href("switcher.js", output_file.parent),
        template_key="list",
        items=entries,
        nav_links=[
            {"href": _relative_route(output_dir / "index.html", output_file.parent), "label": "ホーム"},
            {"href": _relative_route(output_dir / "list" / "index.html", output_file.parent), "label": "一覧"},
        ],
    )
    output_file.write_text(rendered, encoding="utf-8")

    return [output_file]


def build_detail(
    experience: ExperienceSpec,
    ctx: BuildContext,
    item: ContentItem,
) -> List[Path]:
    """Render the detail template for a single content item."""

    if experience.kind != "generated":
        return []

    template_path = ctx.templates_dir(experience) / "detail.jinja"
    if not template_path.exists():
        raise FileNotFoundError(
            f"Detail template not found for experience '{experience.key}': {template_path}"
        )

    output_dir = ctx.output_dir(experience)
    detail_dir = ensure_dir(output_dir / "posts" / item.content_id)
    output_file = detail_dir / "index.html"
    routes_href = _relative_href(ctx.routes_path, output_file.parent)
    ctx.copy_assets(experience)
    asset_prefix = _relative_href(output_dir, output_file.parent)
    features_init_href = (
        _relative_href(ctx.shared_init_features, output_file.parent)
        if ctx.shared_init_features
        else None
    )

    env = ctx.jinja_env(experience)
    template = env.get_template("detail.jinja")
    rendered = template.render(
        experience=experience,
        content=item,
        routes_href=routes_href,
        asset_prefix=asset_prefix,
        features_init_href=features_init_href,
        switcher_css_href=ctx.shared_asset_href("switcher.css", output_file.parent),
        switcher_js_href=ctx.shared_asset_href("switcher.js", output_file.parent),
        template_key="detail",
        nav_links=[
            {"href": _relative_route(output_dir / "index.html", output_file.parent), "label": "ホーム"},
            {"href": _relative_route(output_dir / "list" / "index.html", output_file.parent), "label": "一覧"},
        ],
    )
    output_file.write_text(rendered, encoding="utf-8")

    return [output_file]


__all__ = [
    "BuildContext",
    "build_detail",
    "build_home",
    "build_list",
    "load_content_items",
]
