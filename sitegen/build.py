"""Build utilities for generated experiences."""

from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from jinja2 import Environment, FileSystemLoader, select_autoescape
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
    _copied_assets: set[str] = field(default_factory=set, init=False, repr=False)

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

        _copy_assets(self.assets_dir(experience), destination)
        self._copied_assets.add(cache_key)
        return destination

    def output_dir(self, experience: ExperienceSpec) -> Path:
        """Ensure and return the output directory for the experience."""

        output_dir = experience.output_dir or experience.key
        if not output_dir:
            raise ValueError(f"output_dir is required for experience '{experience.key}'")
        return ensure_dir(self.out_root / output_dir)

    def routes_path(self, experience: ExperienceSpec) -> Path:
        """Return the target path for the experience's routes.json."""

        return self.output_dir(experience) / self.routes_filename

    def jinja_env(self, experience: ExperienceSpec) -> Environment:
        """Create a Jinja environment scoped to the experience templates."""

        return Environment(
            loader=FileSystemLoader(self.templates_dir(experience)),
            autoescape=select_autoescape(["html", "jinja"]),
            trim_blocks=True,
            lstrip_blocks=True,
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


def load_content_items(content_dir: Path) -> list[ContentItem]:
    """Load and validate content items from a directory."""

    if not content_dir.exists():
        raise FileNotFoundError(f"Content directory not found: {content_dir}")

    items: list[ContentItem] = []
    for json_path in sorted(content_dir.glob("*.json")):
        try:
            payload = json.loads(json_path.read_text(encoding="utf-8"))
            items.append(ContentItem.model_validate(payload))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise ValueError(f"Invalid content file {json_path}: {exc}") from exc

    return items


def _content_for_experience(
    experience: ExperienceSpec, items: list[ContentItem]
) -> list[ContentItem]:
    """Return content targeted to the experience, or all items if none match."""

    targeted = [item for item in items if item.experience == experience.key]
    return targeted or items


def build_home(experience: ExperienceSpec, ctx: BuildContext) -> List[Path]:
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
    routes_href = _relative_href(ctx.routes_path(experience), output_file.parent)
    asset_prefix = _relative_href(output_dir, output_file.parent)

    rendered = template.render(
        experience=experience,
        routes_href=routes_href,
        asset_prefix=asset_prefix,
        nav_links=[
            {"href": experience.route_patterns.home, "label": "ホーム"},
            {"href": experience.route_patterns.list, "label": "一覧"},
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
    output_file = output_dir / "list.html"
    routes_href = _relative_href(ctx.routes_path(experience), output_file.parent)

    env = ctx.jinja_env(experience)
    template = env.get_template("list.jinja")

    ctx.copy_assets(experience)
    asset_prefix = _relative_href(output_dir, output_file.parent)

    entries = []
    for item in _content_for_experience(experience, items):
        detail_path = output_dir / "posts" / f"{item.content_id}.html"
        entries.append(
            {
                "content": item,
                "detail_href": _relative_href(detail_path, output_file.parent),
            }
        )

    rendered = template.render(
        experience=experience,
        routes_href=routes_href,
        asset_prefix=asset_prefix,
        items=entries,
        nav_links=[
            {"href": experience.route_patterns.home, "label": "ホーム"},
            {"href": experience.route_patterns.list, "label": "一覧"},
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
    detail_dir = ensure_dir(output_dir / "posts")
    output_file = detail_dir / f"{item.content_id}.html"
    routes_href = _relative_href(ctx.routes_path(experience), output_file.parent)
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
        nav_links=[
            {"href": experience.route_patterns.home, "label": "ホーム"},
            {"href": experience.route_patterns.list, "label": "一覧"},
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
