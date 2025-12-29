"""Build utilities for generated experiences."""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import List

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .models import ExperienceSpec
from .util_fs import ensure_dir


@dataclass
class BuildContext:
    """Configuration for building generated experiences."""

    src_root: Path
    out_root: Path
    routes_filename: str = "routes.json"

    def templates_dir(self, experience: ExperienceSpec) -> Path:
        """Return the template directory for the experience."""

        return self.src_root / experience.key / "templates"

    def assets_dir(self, experience: ExperienceSpec) -> Path:
        """Return the assets directory for the experience."""

        return self.src_root / experience.key / "assets"

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

    output_dir = ctx.output_dir(experience)
    assets_out = ensure_dir(output_dir / "assets")
    _copy_assets(ctx.assets_dir(experience), assets_out)

    env = ctx.jinja_env(experience)
    template = env.get_template("home.jinja")

    output_file = output_dir / "index.html"
    routes_href = _relative_href(ctx.routes_path(experience), output_file.parent)

    rendered = template.render(
        experience=experience,
        routes_href=routes_href,
        nav_links=[
            {"href": experience.route_patterns.home, "label": "ホーム"},
            {"href": experience.route_patterns.list, "label": "一覧"},
        ],
    )
    output_file.write_text(rendered, encoding="utf-8")

    return [output_file]


__all__ = ["BuildContext", "build_home"]
